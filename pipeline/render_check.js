// Render a D object with the current page template, exactly as the app does, and
// fail unless all 8 tabs open without a script error.
// Usage: node render_check.js <reference-dir> d.json
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const [refDir, dPath] = process.argv.slice(2);
const top = fs.readFileSync(path.join(refDir, "SHELL_TOP.html"), "utf8");
const bottom = fs.readFileSync(path.join(refDir, "SHELL_BOTTOM.html"), "utf8");
const D = JSON.parse(fs.readFileSync(dPath, "utf8"));
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const json = JSON.stringify(D).split("<").join("\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");
const html = `${top.replace("__DASH_TITLE__", `${D.basic.name} Sales Intelligence`)}\nconst D = ${json};\n${bottom}`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(html, { waitUntil: "load" });
  const tabs = await page.locator(".tab").count();
  for (let i = 0; i < tabs; i++) await page.locator(".tab").nth(i).click();
  const name = await page.textContent("#bankName").catch(() => null);
  await browser.close();
  if (tabs !== 8 || !name || errors.length) {
    console.error(`Render check failed: ${tabs} tabs, name=${name}, errors=${JSON.stringify([...new Set(errors)].slice(0, 3))}`);
    process.exit(1);
  }
  console.log(`Render check passed: ${name}, 8 tabs, no script errors`);
})();
