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
  // Temporary development aid: show the repository's exact Liquid formatting.
  const { execFileSync } = require("node:child_process");
  const formattedHistory = execFileSync("npx", ["prettier", "_layouts/media_history.liquid"], { encoding: "utf8" });
  console.log("LIQUID_FORMAT_BEGIN" + Buffer.from(formattedHistory).toString("base64") + "LIQUID_FORMAT_END");
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
              !renderedFlag.accessibleName.startsWith("Switch language to ")
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
            } else {
              await page.waitForTimeout(600);
            }
            const output = path.join("site-preview", `${name}-${device}.png`);
            await page.screenshot({
              path: output,
              animations: "disabled",
              fullPage: false,
            });
            console.log(`Saved ${output} (${route})`);

            // Check the adaptive three-, two-, and one-column video grid in
            // Chromium, rather than relying on stylesheet declarations alone.
            if (name.startsWith("media-") || name.startsWith("history-")) {
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
                console.log(`MEDIA_GRID_PROBE ${name} tablet ${JSON.stringify(tabletColumns)}`);
                if (tabletColumns.some((count) => count !== 2)) {
                  throw new Error(`Media grid must be two columns on tablet: ${JSON.stringify(tabletColumns)}`);
                }
                await page.screenshot({
                  path: path.join("site-preview", `${name}-tablet.png`),
                  animations: "disabled",
                  fullPage: false,
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
                return { opacity: ring.opacity, borderColor: ring.borderTopColor };
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
                const border = getComputedStyle(wrapper, "::after");
                return {
                  borderColor: border.borderTopColor,
                  borderStyle: border.borderTopStyle,
                  borderWidth: border.borderTopWidth,
                  borderRadius: border.borderTopLeftRadius,
                  insetTop: border.top,
                  insetRight: border.right,
                  insetBottom: border.bottom,
                  insetLeft: border.left,
                  opacity: border.opacity,
                  tooltip: wrapper.closest("a")?.getAttribute("title"),
                };
              });
              const afterBounds = await flag.boundingBox();
              console.log(`LANGUAGE_HOVER_PROBE ${name} ${JSON.stringify({themeHoverColor, restRing, accent, beforeBounds, afterBounds, themeIconBounds})}`);
              if (
                restRing.opacity !== "0" ||
                accent.borderColor !== themeHoverColor ||
                accent.borderStyle !== "solid" ||
                accent.borderWidth !== "3px" ||
                accent.borderRadius !== "7px" ||
                accent.insetTop !== "-3px" ||
                accent.insetRight !== "-3px" ||
                accent.insetBottom !== "-3px" ||
                accent.insetLeft !== "-3px" ||
                accent.opacity !== "1" ||
                !accent.tooltip ||
                !beforeBounds ||
                !afterBounds ||
                Math.abs(beforeBounds.width - afterBounds.width) > 0.01 ||
                Math.abs(beforeBounds.height - afterBounds.height) > 0.01 ||
                Math.abs(beforeBounds.x - afterBounds.x) > 0.01 ||
                Math.abs(beforeBounds.y - afterBounds.y) > 0.01
              ) {
                throw new Error(`Language hover rounded border does not match theme button: ${JSON.stringify(accent)}`);
              }
              const hoverImage = path.join("site-preview", `${name}-desktop-language-hover.png`);
              await page.screenshot({
                path: hoverImage,
                animations: "disabled",
                fullPage: false,
              });
              console.log(`Saved ${hoverImage} (hovered ${route})`);
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
      "Desktop (1440x900) and mobile-size (390x844) first-viewport screenshots of twelve English/Korean homepage sections, plus 800px-wide tablet media pages, with OS-light and OS-dark initial-theme previews. Theme checks also validate automatic OS changes, one-time legacy preference reset, binary user override and persistence. These are not live preview URLs. The actual website was not published by this job.\n",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
