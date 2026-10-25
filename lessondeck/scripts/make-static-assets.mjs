// 샘플 PDF(public/sample.pdf)와 PWA 아이콘(public/icons/*)을 만드는 1회성 스크립트.
// Playwright(Chromium)가 설치된 환경에서 `node scripts/make-static-assets.mjs`로 실행한다.
// 결과물은 저장소에 커밋되어 있으므로 평소 빌드에는 필요 없다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
mkdirSync(join(pub, "icons"), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

// ── 샘플 PDF ──
await page.setContent(readFileSync(join(here, "sample-sheet.html"), "utf8"), { waitUntil: "load" });
await page.pdf({ path: join(pub, "sample.pdf"), format: "A4", printBackground: true });

// ── 아이콘 ──
const iconSvg = readFileSync(join(here, "icon.svg"), "utf8");
writeFileSync(join(pub, "icons", "favicon.svg"), iconSvg);
const maskableSvg = readFileSync(join(here, "icon-maskable.svg"), "utf8");
const shots = [
  [iconSvg, 192, "icon-192.png"],
  [iconSvg, 512, "icon-512.png"],
  [maskableSvg, 512, "maskable-512.png"],
  [maskableSvg, 180, "apple-touch-icon.png"],
];
for (const [svg, size, name] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: join(pub, "icons", name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log("sample.pdf and icons written");
