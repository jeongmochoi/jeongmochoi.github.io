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
            await page.waitForTimeout(800);
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
