// PR visual review only: never uploads content or changes the live homepage.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const siteRoot = "http://127.0.0.1:4173";
const pages = [
  ["home-en", "/"],
  ["home-ko", "/ko/"],
  ["papers-en", "/publications/"],
  ["papers-ko", "/ko/publications/"],
  ["books-en", "/books/"],
  ["books-ko", "/ko/books/"],
  ["media-en", "/media/"],
  ["media-ko", "/ko/media/"],
  ["history-en", "/media/history-of-science/"],
  ["history-ko", "/ko/media/history-of-science/"],
  ["teaching-en", "/teaching/"],
  ["teaching-ko", "/ko/teaching/"],
  ["materials-26f-en", "/teaching/2026-fall-physical-chemistry-of-materials/"],
  ["materials-26f-ko", "/ko/teaching/2026-fall-physical-chemistry-of-materials/"],
  ["research-trends-26f-en", "/teaching/2026-fall-recent-trends-in-chemical-research/"],
  ["research-trends-26f-ko", "/ko/teaching/2026-fall-recent-trends-in-chemical-research/"],
];
const viewports = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

// Computed CSS transforms are matrices with x-skew tan(-8 degrees).
function isEightDegreeSkew(value) {
  const matrix = /^matrix\(([^)]+)\)$/.exec(value);
  if (!matrix) return false;
  const values = matrix[1].split(",").map((number) => Number(number.trim()));
  return values.length === 6 && Math.abs(values[2] - Math.tan((-8 * Math.PI) / 180)) < 0.001;
}

async function main() {
  fs.mkdirSync("site-preview", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [device, viewport] of viewports) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      try {
        for (const [name, route] of pages) {
          const page = await context.newPage();
          try {
            const response = await page.goto(siteRoot + route, {
              waitUntil: "domcontentloaded",
              timeout: 45000,
            });
            if (!response || !response.ok()) {
              throw new Error(`${route} returned ${response?.status() ?? "no response"}`);
            }
            // Check that each page renders its actual SVG flag, not an OS emoji.
            const expectedFlag = route.startsWith("/ko/") ? "en-uk-us.svg" : "ko.svg";
            const expectedLanguageTooltip = route.startsWith("/ko/") ? "Change language to English" : "한국어로 변경";
            const flag = page.locator(".navbar-language-toggle img.jm-language-flag");
            if ((await flag.count()) !== 1) throw new Error(`Missing flag image: ${route}`);
            // Mobile navigation starts collapsed. Expand it before measuring
            // real layout geometry; hidden elements can report CSS width "auto".
            const mobileToggle = device === "mobile" ? page.locator(".navbar-toggler-main") : null;
            if (mobileToggle) {
              if (!(await mobileToggle.isVisible())) throw new Error(`Mobile menu toggle missing: ${route}`);
              await mobileToggle.click();
              await flag.waitFor({ state: "visible", timeout: 5000 });
            }
            await flag.evaluate(async (image) => await image.decode());
            if (mobileToggle && name.startsWith("home-")) {
              const expandedImage = path.join("site-preview", `${name}-mobile-menu-expanded.png`);
              await page.screenshot({
                path: expandedImage,
                animations: "disabled",
                fullPage: false,
              });
              console.log(`Saved ${expandedImage} (expanded mobile menu)`);
            }
            const renderedFlag = await flag.evaluate((image) => {
              const dimensions = getComputedStyle(image);
              return {
                path: new URL(image.src).pathname,
                loaded: image.complete && image.naturalWidth > 0,
                width: dimensions.width,
                height: dimensions.height,
                borderWidth: dimensions.borderWidth,
                borderRadius: dimensions.borderRadius,
                boxShadow: dimensions.boxShadow,
                accessibleName: image.closest("a")?.getAttribute("aria-label") || "",
                tooltip: image.closest("a")?.getAttribute("title") || "",
              };
            });
            console.log(`LANGUAGE_FLAG_PROBE ${name} ${JSON.stringify(renderedFlag)}`);
            if (
              !renderedFlag.path.endsWith("/" + expectedFlag) ||
              !renderedFlag.loaded ||
              Math.abs(parseFloat(renderedFlag.width) - 27) > 0.11 ||
              renderedFlag.height !== "18px" ||
              renderedFlag.borderWidth !== "0px" ||
              renderedFlag.borderRadius !== "0px" ||
              renderedFlag.boxShadow !== "none" ||
              renderedFlag.accessibleName !== expectedLanguageTooltip ||
              renderedFlag.tooltip !== expectedLanguageTooltip
            ) {
              throw new Error(`SVG language switch failed: ${JSON.stringify(renderedFlag)}`);
            }
            if (mobileToggle) {
              await mobileToggle.click();
              await flag.waitFor({ state: "hidden", timeout: 5000 });
            }
            if (name.startsWith("home-")) {
              // Verify *actual browser font loading* before taking a screenshot.
              // Computed CSS alone can claim oblique without a visible slant.
              await page.evaluate(async () => await document.fonts.ready);
              const slant = await page.evaluate(() => {
                const emphasis = [...document.querySelectorAll("em")].find((element) =>
                  element.textContent.includes("summa cum laude"),
                );
                if (!emphasis) throw new Error("Cannot find summa cum laude");
                const style = getComputedStyle(emphasis);
                const parent = getComputedStyle(emphasis.parentElement);
                return {
                  computedStyle: style.fontStyle,
                  fontFamily: style.fontFamily,
                  fontWeight: style.fontWeight,
                  parentWeight: parent.fontWeight,
                  transform: style.transform,
                  display: style.display,
                };
              });
              console.log(`OBLIQUE_FONT_PROBE ${name} ${JSON.stringify(slant)}`);
              if (
                slant.computedStyle !== "normal" ||
                !slant.fontFamily.includes("Roboto") ||
                slant.fontFamily.includes("Roboto Flex") ||
                slant.fontWeight !== slant.parentWeight ||
                slant.display !== "inline-block" ||
                !isEightDegreeSkew(slant.transform)
              ) {
                throw new Error(`Original Roboto eight-degree slant did not render: ${JSON.stringify(slant)}`);
              }
            } else if (name.startsWith("papers-")) {
              await page.evaluate(async () => await document.fonts.ready);
              const typography = await page.evaluate(() => {
                const author = document.querySelector(".publications ol.bibliography li .author .jm-self-author");
                const journal = document.querySelector(".publications ol.bibliography li .jm-periodical .journal-title");
                if (!author || !journal) throw new Error("Missing publication author or journal");
                const ownerStyle = getComputedStyle(author);
                const journalStyle = getComputedStyle(journal);
                const periodicalStyle = getComputedStyle(journal.parentElement);
                return {
                  ownerStyle: ownerStyle.fontStyle,
                  ownerFont: ownerStyle.fontFamily,
                  ownerUnderline: ownerStyle.textDecorationLine,
                  journalStyle: journalStyle.fontStyle,
                  journalFont: journalStyle.fontFamily,
                  journalWeight: journalStyle.fontWeight,
                  parentWeight: periodicalStyle.fontWeight,
                  journalTransform: journalStyle.transform,
                };
              });
              console.log(`PUBLICATION_TYPOGRAPHY ${name} ${JSON.stringify(typography)}`);
              if (
                typography.ownerStyle !== "normal" ||
                !typography.ownerUnderline.includes("underline") ||
                typography.ownerFont.includes("Roboto Flex") ||
                typography.journalStyle !== "normal" ||
                typography.journalFont.includes("Roboto Flex") ||
                typography.journalWeight !== typography.parentWeight ||
                !isEightDegreeSkew(typography.journalTransform)
              ) {
                throw new Error(`Publication font mismatch: ${JSON.stringify(typography)}`);
              }

              // Regression checks for scientific-title notation and the
              // distinction between an underlined name and its author markers.
              const publicationDetails = await page.evaluate(() => {
                const errors = [];
                const entries = document.querySelectorAll(".publications ol.bibliography li");
                const owners = [...entries].flatMap((entry) => [...entry.querySelectorAll(".jm-self-author")]);
                if (owners.length !== entries.length) errors.push("Expected one owner name per publication");
                for (const owner of owners) {
                  if (owner.querySelector("sup") || /[*∗†‡§¶‖&^]/.test(owner.textContent)) {
                    errors.push("Author marker is inside an underlined name");
                    break;
                  }
                }
                for (const [id, expected] of [
                  ["koo2024nucleation", "†"],
                  ["dar2024condensates", "*†"],
                  ["yang2023mendeleev", "*†"],
                ]) {
                  const marker = document.querySelector(`#${id} .jm-self-author`)?.nextElementSibling;
                  if (marker?.tagName !== "SUP" || marker.textContent.trim() !== expected) {
                    errors.push(`Incorrect separate author marker for ${id}`);
                  }
                  if (marker && getComputedStyle(marker).textDecorationLine !== "none") {
                    errors.push(`Underlined author marker for ${id}`);
                  }
                }
                for (const id of ["kim2024anthracene", "kim2026rhodamine"]) {
                  const italicN = document.querySelector(`#${id} .title em`);
                  const matrix = italicN && /^matrix\(([^)]+)\)$/.exec(getComputedStyle(italicN).transform);
                  const skew = matrix ? Number(matrix[1].split(",")[2]) : NaN;
                  if (
                    italicN?.textContent !== "n" ||
                    !Number.isFinite(skew) ||
                    Math.abs(skew - Math.tan((-8 * Math.PI) / 180)) > 0.001
                  ) {
                    errors.push(`Missing eight-degree italic n for ${id}`);
                  }
                }
                for (const [id, phrase] of [
                  ["jo2021liesegang", "Microscopic Analyses"],
                  ["choi2019absinth", "ABSINTH Force Field"],
                  ["choi2019absinth", "Amino Acid Specific"],
                  ["im2023amyloid", "(1–42)"],
                ]) {
                  if (!document.querySelector(`#${id} .title`)?.textContent.includes(phrase)) {
                    errors.push(`Published title mismatch: ${id}, ${phrase}`);
                  }
                }
                return { publicationCount: entries.length, authorCount: owners.length, errors };
              });
              console.log(`PUBLICATION_DETAIL_PROBE ${name} ${JSON.stringify(publicationDetails)}`);
              if (publicationDetails.errors.length) {
                throw new Error(`Publication details mismatch: ${JSON.stringify(publicationDetails)}`);
              }
            } else {
              await page.waitForTimeout(600);
            }
            // Empty post-exam dates should retain the no-class shading, but
            // display no lecture number, topic, or materials in either locale.
            if (name.startsWith("materials-26f-")) {
              const emptyWeekProbe = await page.evaluate(() => {
                const rows = [...document.querySelectorAll(".course-table-wrap table tbody tr")];
                const findDate = (date) =>
                  rows.find((row) => row.querySelectorAll("td")[1]?.textContent.trim() === date);
                const noClass = findDate("12/3");
                const background = (row) => row && getComputedStyle(row.querySelectorAll("td")[3]).backgroundColor;
                const blanks = ["12/15", "12/17"].map((date) => {
                  const row = findDate(date);
                  const cells = row ? [...row.querySelectorAll("td")] : [];
                  return {
                    date,
                    found: Boolean(row),
                    blank: cells.length === 5 && cells.slice(2).every((cell) => cell.textContent.trim() === ""),
                    muted: Boolean(row?.querySelector(".course-row-muted")),
                    background: background(row),
                  };
                });
                return { noClassBackground: background(noClass), blanks };
              });
              console.log(`MATERIALS_EMPTY_WEEK_PROBE ${name} ${JSON.stringify(emptyWeekProbe)}`);
              if (
                !emptyWeekProbe.noClassBackground ||
                emptyWeekProbe.noClassBackground === "rgba(0, 0, 0, 0)" ||
                emptyWeekProbe.blanks.some((row) =>
                  !row.found || !row.blank || !row.muted || row.background !== emptyWeekProbe.noClassBackground
                )
              ) {
                throw new Error(`Blank final rows must be shaded exactly like No class, without labels: ${name}`);
              }
            }

            // Capture complete media archives, teaching lists, and new course schedules.
            const entireReviewPage = name.startsWith("media-") || name.startsWith("history-") ||
              name.startsWith("teaching-") || name.includes("-26f-");
            if (entireReviewPage) {
              await page.evaluate(() => {
                document.querySelectorAll("img[loading='lazy']").forEach((image) => {
                  image.loading = "eager";
                });
              });
              await page.waitForTimeout(800);
            }
            const output = path.join("site-preview", `${name}-${device}.png`);
            const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            // The actual website uses a fixed footer. Set the viewport height
            // to the document height *for capture only* so that the footer
            // appears at the bottom instead of obscuring the middle of a
            // stitched full-page screenshot.
            if (entireReviewPage) {
              await page.setViewportSize({
                width: viewport.width,
                height: Math.max(viewport.height, documentHeight),
              });
            }
            await page.screenshot({
              path: output,
              animations: "disabled",
              fullPage: entireReviewPage,
            });
            if (entireReviewPage) {
              await page.setViewportSize(viewport);
            }
            console.log(`SCREENSHOT_FULL_PAGE ${name} ${device} ${JSON.stringify({path: output, fullPage: entireReviewPage, documentHeight})}`);
            console.log(`Saved ${output} (${route})`);

            // Frame only the nine horizontal feature thumbnails on the Media
            // landing page. All other card layouts and their text must retain
            // their previous position; the thumbnail frame matches the compact
            // video-card outer border and its inner 16:9 image geometry.
            const verifyMediaThumbnailParity = async (mode) => {
              if (!name.startsWith("media-")) return;
              const dimensions = await page.evaluate(() => {
                const compact = document.querySelector(".media-video-grid .media-video-thumbnail");
                const compactCard = document.querySelector(".media-video-grid .media-video-card");
                const individuals = [...document.querySelectorAll(".media-index .media-feature-visual-link")];
                if (!compact || !compactCard || !individuals.length) return null;
                const imageBox = compact.getBoundingClientRect();
                const cardBox = compactCard.getBoundingClientRect();
                const compactStyle = getComputedStyle(compactCard);
                const others = individuals.map((element) => {
                  const parent = element.closest(".media-feature-card");
                  const frame = element.getBoundingClientRect();
                  const image = element.querySelector("img")?.getBoundingClientRect();
                  const style = getComputedStyle(element);
                  const parentStyle = parent ? getComputedStyle(parent) : null;
                  return {
                    frameX: frame.x,
                    frameWidth: frame.width,
                    frameHeight: frame.height,
                    imageX: image?.x ?? null,
                    imageWidth: image?.width ?? 0,
                    imageHeight: image?.height ?? 0,
                    borderLeft: style.borderLeftWidth,
                    borderRight: style.borderRightWidth,
                    borderTop: style.borderTopWidth,
                    borderBottom: style.borderBottomWidth,
                    borderColor: style.borderLeftColor,
                    borderRadius: style.borderTopLeftRadius,
                    backgroundColor: style.backgroundColor,
                    parentBorderLeft: parentStyle?.borderLeftWidth,
                    parentBorderRight: parentStyle?.borderRightWidth,
                  };
                });
                return {
                  compact: {
                    frameX: cardBox.x,
                    frameWidth: cardBox.width,
                    imageX: imageBox.x,
                    imageWidth: imageBox.width,
                    imageHeight: imageBox.height,
                    borderColor: compactStyle.borderLeftColor,
                    borderRadius: compactStyle.borderTopLeftRadius,
                    backgroundColor: compactStyle.backgroundColor,
                  },
                  historyCount: document.querySelectorAll(".media-history-feature .media-feature-visual-link").length,
                  otherListCounts: [...document.querySelectorAll(".media-index > .media-feature-list:not(.media-history-feature)")].map(
                    (list) => list.querySelectorAll(".media-feature-visual-link").length,
                  ),
                  individual: others,
                };
              });
              if (!dimensions) throw new Error(`Missing horizontal media thumbnails: ${name} ${mode}`);
              const b = dimensions.compact;
              const aligned =
                dimensions.historyCount === 1 &&
                dimensions.otherListCounts.length === 2 &&
                dimensions.otherListCounts.every((count) => count === 4) &&
                dimensions.individual.length === 9 &&
                dimensions.individual.every((v) =>
                  v.borderLeft === "1px" &&
                  v.borderRight === "1px" &&
                  v.borderTop === "1px" &&
                  v.borderBottom === "1px" &&
                  v.borderColor === b.borderColor &&
                  v.borderRadius === b.borderRadius &&
                  v.backgroundColor === b.backgroundColor &&
                  v.parentBorderLeft === "0px" &&
                  v.parentBorderRight === "0px" &&
                  Math.abs(v.frameX - b.frameX) <= 0.06 &&
                  Math.abs(v.frameWidth - b.frameWidth) <= 0.06 &&
                  Math.abs(v.frameHeight - (b.imageHeight + 2)) <= 0.06 &&
                  Math.abs(v.imageX - b.imageX) <= 0.06 &&
                  Math.abs(v.imageWidth - b.imageWidth) <= 0.06 &&
                  Math.abs(v.imageHeight - b.imageHeight) <= 0.06,
                );
              // Probe both color themes; the alpha-blended border only looks
              // identical when the underlying fill also matches.
              const palette = await page.evaluate(() => {
                const root = document.documentElement;
                const originalTheme = root.getAttribute("data-theme");
                const card = document.querySelector(".media-video-grid .media-video-card");
                const thumbnails = [...document.querySelectorAll(".media-index .media-feature-visual-link")];
                const results = [];
                try {
                  for (const theme of ["light", "dark"]) {
                    root.setAttribute("data-theme", theme);
                    const cardStyle = getComputedStyle(card);
                    results.push({
                      theme,
                      cardBackground: cardStyle.backgroundColor,
                      cardBorder: cardStyle.borderLeftColor,
                      thumbnails: thumbnails.map((node) => {
                        const style = getComputedStyle(node);
                        return { background: style.backgroundColor, border: style.borderLeftColor };
                      }),
                    });
                  }
                } finally {
                  if (originalTheme === null) root.removeAttribute("data-theme");
                  else root.setAttribute("data-theme", originalTheme);
                }
                return results;
              });
              const samePalette = palette.every(
                (p) => p.thumbnails.length === 9 &&
                  p.thumbnails.every((v) => v.background === p.cardBackground && v.border === p.cardBorder),
              );
              console.log(`MEDIA_BORDER_PALETTE ${name} ${mode} ${JSON.stringify({ palette, match: samePalette })}`);
              console.log(`MEDIA_THUMBNAIL_PARITY ${name} ${mode} ${JSON.stringify({ ...dimensions, match: aligned })}`);
              if (!samePalette) {
                throw new Error(`Thumbnail borders do not match video card borders in light and dark themes: ${name} ${mode}`);
              }
              if (!aligned) {
                throw new Error(`Only thumbnail frames should match video-card borders; horizontal cards remain unframed: ${name} ${mode}`);
              }
            };
            await verifyMediaThumbnailParity(device);

            // Check the adaptive three-, two-, and one-column video grid in
            // Chromium, rather than relying on stylesheet declarations alone.
            if (name.startsWith("media-")) {
              const countGridColumns = async () =>
                page.locator(".media-video-grid").evaluateAll((grids) =>
                  grids.map((grid) =>
                    getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
                  ),
                );
              const widths = await countGridColumns();
              const expected = device === "desktop" ? 3 : 1;
              console.log(`MEDIA_GRID_PROBE ${name} ${device} ${JSON.stringify(widths)}`);
              if (!widths.length || widths.some((count) => count !== expected)) {
                throw new Error(`Media grid must be ${expected} columns: ${JSON.stringify(widths)}`);
              }

              if (device === "desktop") {
                await page.setViewportSize({ width: 800, height: 900 });
                const tabletColumns = await countGridColumns();
                await verifyMediaThumbnailParity("tablet");
                console.log(`MEDIA_GRID_PROBE ${name} tablet ${JSON.stringify(tabletColumns)}`);
                if (tabletColumns.some((count) => count !== 2)) {
                  throw new Error(`Media grid must be two columns on tablet: ${JSON.stringify(tabletColumns)}`);
                }
                const tabletHeight = await page.evaluate(() => document.documentElement.scrollHeight);
                await page.setViewportSize({
                  width: 800,
                  height: Math.max(900, tabletHeight),
                });
                await page.screenshot({
                  path: path.join("site-preview", `${name}-tablet.png`),
                  animations: "disabled",
                  fullPage: true,
                });
                await page.setViewportSize(viewport);
              }
            }

            // The Media landing page features only one history video, using
            // the same horizontal image-left/details-right layout as broadcasts.
            if (name.startsWith("media-")) {
              const card = page.locator(".media-history-feature .media-history-feature-card");
              const picture = card.locator(".media-feature-visual");
              const description = card.locator(".media-feature-body");
              const images = card.locator(".media-feature-visual-link");
              const countLabel = await page.locator(".media-history-feature .media-link-button").innerText();
              if (!countLabel.includes("(5)")) {
                throw new Error(`Media history count is not 5: ${name} ${countLabel}`);
              }
              if ((await card.count()) !== 1 || (await images.count()) !== 1) {
                throw new Error(`History series must show just one featured video: ${name}`);
              }
              const pictureBox = await picture.boundingBox();
              const detailsBox = await description.boundingBox();
              if (!pictureBox || !detailsBox) throw new Error(`Missing history feature columns: ${name}`);
              if (device === "desktop" && detailsBox.x < pictureBox.x + pictureBox.width - 1) {
                throw new Error(`History preview is not image-left/detail-right: ${name}`);
              }
              if (device === "mobile" && detailsBox.y < pictureBox.y + pictureBox.height - 1) {
                throw new Error(`History preview is not vertically stacked on mobile: ${name}`);
              }
              console.log(`MEDIA_HISTORY_FEATURE_PROBE ${name} ${device} ${JSON.stringify({pictureBox, detailsBox})}`);
            }

            if (name.startsWith("history-")) {
              const intro = await page.locator(".media-history-intro").evaluate((element) => {
                const style = getComputedStyle(element);
                return {
                  words: element.textContent.replace(/\s+/g, " ").trim(),
                  breaks: element.querySelectorAll("br").length,
                  wordBreak: style.wordBreak,
                  maxWidth: style.maxWidth,
                  width: element.getBoundingClientRect().width,
                  containerWidth: element.parentElement.getBoundingClientRect().width,
                };
              });
              const desiredUrl = name === "history-en" ? "/ko/media/history-of-science/" : "/media/history-of-science/";
              const languageHref = await page.locator(".navbar-language-toggle a").getAttribute("href");
              console.log(`HISTORY_BILINGUAL_PROBE ${name} ${JSON.stringify({intro,languageHref})}`);
              if (
                intro.breaks !== 0 ||
                intro.wordBreak !== "keep-all" ||
                intro.maxWidth !== "none" ||
                Math.abs(intro.width - intro.containerWidth) > 2 ||
                languageHref !== desiredUrl
              ) {
                throw new Error(`Science-history locale, sentence break, or full-width introduction is wrong: ${name}`);
              }
              if (name === "history-ko" && device === "desktop") {
                const lines = await page.locator(".media-history-intro").evaluate((element) => {
                  const firstSentence = [...element.childNodes].find((node) =>
                    node.nodeType === Node.TEXT_NODE && node.textContent.includes("연속 강의입니다."),
                  );
                  if (!firstSentence) return -1;
                  const range = document.createRange();
                  range.selectNodeContents(firstSentence);
                  return range.getClientRects().length;
                });
                console.log(`KOREAN_INTRO_FIRST_SENTENCE_LINES ${lines}`);
                if (lines !== 1) throw new Error("Korean first sentence still wraps on desktop");
              }

              const archiveRows = page.locator(".media-history-row");
              const titles = await archiveRows.locator(".media-history-row-title").allTextContents();
              if (
                (await archiveRows.count()) !== 5 ||
                titles.length !== 5 ||
                titles.some((title) => (name === "history-ko" ? !/[가-힣]/.test(title) : /[가-힣]/.test(title)))
              ) {
                throw new Error(`History archive requires 5 individually translated, one-per-row cards: ${name}`);
              }
              const latest = await archiveRows.last().evaluate((row) => ({
                date: row.querySelector("time")?.getAttribute("datetime"),
                title: row.querySelector(".media-history-row-title")?.textContent.trim(),
                url: row.querySelector(".media-history-row-title a")?.getAttribute("href"),
              }));
              const expectedLatestTitle = name === "history-ko"
                ? "돌은 왜 가라앉고 불은 왜 올라갈까? 아리스토텔레스가 세상을 설명한 방법"
                : "Why Do Stones Sink and Fire Rise? How Aristotle Explained the World";
              console.log(`HISTORY_LATEST_EPISODE ${name} ${JSON.stringify(latest)}`);
              if (
                latest.date !== "2026-11-12" ||
                latest.title !== expectedLatestTitle ||
                latest.url !== "https://www.youtube.com/watch?v=b-EpfOwah1k"
              ) {
                throw new Error(`Latest history episode/date/translation is wrong: ${name}`);
              }
              const verifyHistoryRows = async (mode) => {
                const boxes = await archiveRows.evaluateAll((rows) =>
                  rows.map((row) => {
                    const position = (element) => {
                      const r = element.getBoundingClientRect();
                      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
                    };
                    return {
                      row: position(row),
                      thumbnail: position(row.querySelector(".media-history-row-thumbnail")),
                      title: position(row.querySelector(".media-history-row-title")),
                      date: position(row.querySelector(".media-history-row-date")),
                      dateText: row.querySelector(".media-history-row-date")?.textContent.trim(),
                    };
                  }),
                );
                const stacked = mode === "mobile";
                const aligned = boxes.length === 5 && boxes.every((row, i) => {
                  const ordered = !i || row.row.y > boxes[i - 1].row.bottom - 2;
                  const withinPage = row.row.width > 0 && row.row.right <= page.viewportSize().width + 1;
                  const correctLayout = stacked
                    ? row.date.y >= row.thumbnail.bottom - 2 && row.title.y >= row.date.bottom - 2
                    : row.date.x >= row.thumbnail.right - 1 && row.title.y >= row.date.bottom - 2;
                  const sameColumn = Math.abs(row.title.x - row.date.x) <= 2;
                  const topAligned = stacked || Math.abs(row.date.y - row.thumbnail.y) <= 4;
                  return (
                    ordered &&
                    withinPage &&
                    correctLayout &&
                    sameColumn &&
                    topAligned &&
                    /^\d{4}-\d{2}-\d{2}$/.test(row.dateText)
                  );
                });
                console.log(`HISTORY_ROW_PROBE ${name} ${mode} ${JSON.stringify({boxes, aligned})}`);
                if (!aligned) throw new Error(`History rows must show a gray date above the title to the right of the thumbnail: ${name} ${mode}`);
              };
              await verifyHistoryRows(device);
              if (device === "desktop") {
                await page.setViewportSize({ width: 800, height: 900 });
                await verifyHistoryRows("tablet");
                const height = await page.evaluate(() => document.documentElement.scrollHeight);
                await page.setViewportSize({ width: 800, height: Math.max(900, height) });
                await page.screenshot({
                  path: path.join("site-preview", `${name}-tablet.png`),
                  animations: "disabled",
                  fullPage: true,
                });
                await page.setViewportSize(viewport);
              }
            }

            // Compare the language hover accent with the adjacent Change theme
            // icon, and capture screenshots of the actual hovered flag.
            if (device === "desktop" && name.startsWith("home-")) {
              const themeToggle = page.locator("#light-toggle");
              const languageLink = page.locator(".navbar-language-toggle > .nav-link");
              const flagFrame = languageLink.locator(".jm-language-flag-frame");
              await themeToggle.hover();
              // The site transitions inherited colors; sample only after the
              // theme icon's CSS hover transition has completed.
              await page.waitForTimeout(300);
              const themeHoverColor = await themeToggle.evaluate(
                (button) => getComputedStyle(button).color,
              );
              const restRing = await flagFrame.evaluate((wrapper) => {
                const ring = getComputedStyle(wrapper, "::after");
                return { opacity: ring.opacity, shadow: ring.boxShadow };
              });
              const themeIconBounds = await page.evaluate(() => {
                const icon = [...document.querySelectorAll("#light-toggle i")].find((element) => {
                  const style = getComputedStyle(element);
                  return style.display !== "none" && style.visibility !== "hidden";
                });
                const rect = icon?.getBoundingClientRect();
                return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
              });
              const beforeBounds = await flag.boundingBox();
              await languageLink.hover();
              await page.waitForTimeout(250);
              const accent = await flagFrame.evaluate((wrapper) => {
                const ring = getComputedStyle(wrapper, "::after");
                const flagBounds = wrapper.querySelector(".jm-language-flag").getBoundingClientRect();
                const frameBounds = wrapper.getBoundingClientRect();
                return {
                  shadow: ring.boxShadow,
                  borderWidth: ring.borderTopWidth,
                  borderRadius: ring.borderTopLeftRadius,
                  insetTop: ring.top,
                  insetRight: ring.right,
                  insetBottom: ring.bottom,
                  insetLeft: ring.left,
                  opacity: ring.opacity,
                  frameOffsetX: frameBounds.x - flagBounds.x,
                  frameOffsetY: frameBounds.y - flagBounds.y,
                  frameWidth: frameBounds.width,
                  frameHeight: frameBounds.height,
                  tooltip: wrapper.closest("a")?.getAttribute("title"),
                };
              });
              const afterBounds = await flag.boundingBox();
              console.log(`LANGUAGE_HOVER_PROBE ${name} ${JSON.stringify({themeHoverColor, restRing, accent, beforeBounds, afterBounds, themeIconBounds})}`);
              if (
                restRing.opacity !== "0" ||
                !accent.shadow.includes(themeHoverColor) ||
                !accent.shadow.trim().endsWith("0px 0px 0px 3px") ||
                accent.borderWidth !== "0px" ||
                accent.borderRadius !== "2px" ||
                accent.insetTop !== "0px" ||
                accent.insetRight !== "0px" ||
                accent.insetBottom !== "0px" ||
                accent.insetLeft !== "0px" ||
                Math.abs(accent.frameOffsetX) > 0.01 ||
                Math.abs(accent.frameOffsetY) > 0.01 ||
                Math.abs(accent.frameWidth - 27) > 0.01 ||
                Math.abs(accent.frameHeight - 18) > 0.01 ||
                accent.opacity !== "1" ||
                accent.tooltip !== expectedLanguageTooltip ||
                !beforeBounds ||
                !afterBounds ||
                Math.abs(beforeBounds.width - afterBounds.width) > 0.01 ||
                Math.abs(beforeBounds.height - afterBounds.height) > 0.01 ||
                Math.abs(beforeBounds.x - afterBounds.x) > 0.01 ||
                Math.abs(beforeBounds.y - afterBounds.y) > 0.01
              ) {
                throw new Error(`Language hover ring must be flush with the flag and match the theme accent: ${JSON.stringify(accent)}`);
              }
              const hoverImage = path.join("site-preview", `${name}-desktop-language-hover.png`);
              await page.screenshot({
                path: hoverImage,
                animations: "disabled",
                fullPage: false,
              });
              console.log(`Saved ${hoverImage} (hovered ${route})`);
              // Tight crop makes the flag-to-ring edge visible at pixel level.
              const closeup = path.join("site-preview", `${name}-desktop-language-hover-closeup.png`);
              await page.screenshot({
                path: closeup,
                animations: "disabled",
                clip: {
                  x: Math.max(0, afterBounds.x - 14),
                  y: Math.max(0, afterBounds.y - 14),
                  width: afterBounds.width + 28,
                  height: afterBounds.height + 28,
                },
              });
              console.log(`Saved ${closeup} (flag hover closeup)`);
            }
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    }
    // Test real OS color schemes in isolated browsers, including the one-time
    // migration of legacy saved "light"/"dark" values that were never tagged as
    // user choices. Subsequent explicit choices remain binary and persistent.
    for (const osTheme of ["light", "dark"]) {
      const oldSavedTheme = osTheme === "dark" ? "light" : "dark";
      const systemContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: osTheme,
        storageState: {
          cookies: [],
          origins: [{ origin: siteRoot, localStorage: [{ name: "theme", value: oldSavedTheme }] }],
        },
      });
      const page = await systemContext.newPage();
      try {
        const response = await page.goto(siteRoot + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
        if (!response || !response.ok()) throw new Error(`OS theme page did not load for ${osTheme}`);

        const getTheme = async () => page.evaluate(() => ({
          theme: document.documentElement.getAttribute("data-theme"),
          iconMode: document.documentElement.getAttribute("data-theme-setting"),
          stored: localStorage.getItem("theme"),
          manuallySelected: localStorage.getItem("jm-theme-manual-v1"),
        }));

        const initial = await getTheme();
        if (initial.theme !== osTheme || initial.iconMode !== osTheme ||
            initial.stored !== "system" || initial.manuallySelected === "1") {
          throw new Error(`First visit ignored OS preference or legacy migration: ${JSON.stringify({ osTheme, initial })}`);
        }
        console.log(`SYSTEM_THEME_PROBE initial ${osTheme} ${JSON.stringify(initial)}`);
        await page.screenshot({
          path: path.join("site-preview", `theme-os-${osTheme}-initial.png`),
          animations: "disabled",
          fullPage: false,
        });

        // Until the visitor clicks, subsequent OS preference changes apply.
        await page.emulateMedia({ colorScheme: oldSavedTheme });
        await page.waitForFunction((expected) =>
          document.documentElement.getAttribute("data-theme") === expected &&
          document.documentElement.getAttribute("data-theme-setting") === expected,
          oldSavedTheme);
        const autoChanged = await getTheme();
        if (autoChanged.stored !== "system" || autoChanged.manuallySelected === "1") {
          throw new Error(`Automatic OS tracking unexpectedly persisted a choice: ${JSON.stringify(autoChanged)}`);
        }
        console.log(`SYSTEM_THEME_PROBE changed ${osTheme} ${JSON.stringify(autoChanged)}`);

        // A button click now becomes the only source of a saved manual override.
        await page.locator("#light-toggle").click();
        await page.waitForFunction((expected) =>
          document.documentElement.getAttribute("data-theme") === expected,
          osTheme);
        let manuallyChosen = await getTheme();
        if (manuallyChosen.theme !== osTheme || manuallyChosen.iconMode !== osTheme ||
            manuallyChosen.stored !== osTheme || manuallyChosen.manuallySelected !== "1") {
          throw new Error(`Binary toggle did not save the manual override: ${JSON.stringify(manuallyChosen)}`);
        }

        // The saved choice survives both navigation and an OS scheme change.
        await page.reload({ waitUntil: "domcontentloaded" });
        const afterReload = await getTheme();
        if (afterReload.theme !== osTheme || afterReload.iconMode !== osTheme ||
            afterReload.stored !== osTheme || afterReload.manuallySelected !== "1") {
          throw new Error(`Manual theme did not survive reload: ${JSON.stringify(afterReload)}`);
        }
        await page.emulateMedia({ colorScheme: osTheme });
        await page.emulateMedia({ colorScheme: oldSavedTheme });
        manuallyChosen = await getTheme();
        if (manuallyChosen.theme !== osTheme) {
          throw new Error(`OS scheme overrode the saved manual choice: ${JSON.stringify(manuallyChosen)}`);
        }

        await page.locator("#light-toggle").click();
        await page.waitForFunction((expected) =>
          document.documentElement.getAttribute("data-theme") === expected,
          oldSavedTheme);
        const binaryAgain = await getTheme();
        if (binaryAgain.stored !== oldSavedTheme || binaryAgain.manuallySelected !== "1" ||
            binaryAgain.iconMode !== oldSavedTheme) {
          throw new Error(`Third mode appeared after a second click: ${JSON.stringify(binaryAgain)}`);
        }
        console.log(`SYSTEM_THEME_PROBE manual ${osTheme} ${JSON.stringify(binaryAgain)}`);
      } finally {
        await systemContext.close();
      }
    }

    fs.writeFileSync(
      path.join("site-preview", "README.txt"),
      "Desktop (1440x900) and mobile-size (390x844) screenshots of twelve English/Korean homepage sections and four 26F course pages; Media, History, Teaching, and 26F course images are FULL-PAGE (desktop/mobile/800px tablet), not viewport crops, with OS-light and OS-dark initial-theme previews. Theme checks also validate automatic OS changes, one-time legacy preference reset, binary user override and persistence. These are not live preview URLs. The actual website was not published by this job.\n",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
