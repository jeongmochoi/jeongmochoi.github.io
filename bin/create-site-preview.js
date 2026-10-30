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
            await flag.evaluate(async (image) => await image.decode());
            const renderedFlag = await flag.evaluate((image) => {
              const dimensions = getComputedStyle(image);
              return {
                path: new URL(image.src).pathname,
                loaded: image.complete && image.naturalWidth > 0,
                width: dimensions.width,
                height: dimensions.height,
                accessibleName: image.closest("a")?.getAttribute("aria-label") || "",
              };
            });
            console.log(`LANGUAGE_FLAG_PROBE ${name} ${JSON.stringify(renderedFlag)}`);
            if (
              !renderedFlag.path.endsWith("/" + expectedFlag) ||
              !renderedFlag.loaded ||
              renderedFlag.width !== "27px" ||
              renderedFlag.height !== "18px" ||
              !renderedFlag.accessibleName.startsWith("Switch language to ")
            ) {
              throw new Error(`SVG language switch failed: ${JSON.stringify(renderedFlag)}`);
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
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    }
    fs.writeFileSync(
      path.join("site-preview", "README.txt"),
      "Desktop (1440x900) and mobile-size (390x844) first-viewport screenshots of ten English/Korean homepage sections. These are not live preview URLs and do not cover every scroll position or interactive behavior. The actual website was not published by this job.\n",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
