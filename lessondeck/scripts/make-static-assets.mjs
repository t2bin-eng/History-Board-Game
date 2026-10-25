// 샘플 PDF(public/sample.pdf), PWA 아이콘(public/icons/*), 안드로이드 런처 아이콘(android/.../mipmap-*)을 만드는 1회성 스크립트.
// Playwright(Chromium)가 설치된 환경에서 `node scripts/make-static-assets.mjs`로 실행한다.
// 결과물은 저장소에 커밋되어 있으므로 평소 빌드에는 필요 없다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pub = join(root, "public");
const androidRes = join(root, "android", "app", "src", "main", "res");
mkdirSync(join(pub, "icons"), { recursive: true });

const BG = "#262626";
// 아이콘 그림(흰 페이지 + 빨간 필기 + HTML 배지). 512 좌표계, 그림 중심은 대략 (283, 258)
const CONTENT = `
  <path d="M150 104 h168 l46 46 v246 a16 16 0 0 1 -16 16 H150 a16 16 0 0 1 -16 -16 V120 a16 16 0 0 1 16 -16z" fill="#ffffff"/>
  <path d="M318 104 v34 a12 12 0 0 0 12 12 h34z" fill="#d9d9d9"/>
  <rect x="170" y="170" width="140" height="12" rx="6" fill="#d0d0d0"/>
  <rect x="170" y="200" width="110" height="12" rx="6" fill="#d0d0d0"/>
  <path d="M168 272 c30 -40 52 -40 62 -6 s30 30 52 -12 s40 -26 58 4" fill="none" stroke="#e53935" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="300" y="300" width="132" height="104" rx="22" fill="#3fc3e6"/>
  <path d="M342 330 l-20 22 l20 22 M390 330 l20 22 l-20 22" fill="none" stroke="#062a33" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`;

const centered = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-283 -258)">${CONTENT}</g>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;

const ICON = readFileSync(join(here, "icon.svg"), "utf8");
const MASKABLE = svg(`<rect width="512" height="512" fill="${BG}"/>${centered(0.8)}`);
const ROUND = svg(`<circle cx="256" cy="256" r="256" fill="${BG}"/>${centered(0.78)}`);
// 적응형 아이콘 전경: 108dp 중 지름 66dp 원(안전 영역) 안에 그림 대각선이 들어가도록
const FOREGROUND = svg(centered(0.68));

const browser = await chromium.launch();
const page = await browser.newPage();

async function png(markup, size, path) {
  mkdirSync(dirname(path), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// ── 샘플 PDF ──
await page.setContent(readFileSync(join(here, "sample-sheet.html"), "utf8"), { waitUntil: "load" });
await page.pdf({ path: join(pub, "sample.pdf"), format: "A4", printBackground: true });

// ── PWA 아이콘 ──
writeFileSync(join(pub, "icons", "favicon.svg"), ICON);
await png(ICON, 192, join(pub, "icons", "icon-192.png"));
await png(ICON, 512, join(pub, "icons", "icon-512.png"));
await png(MASKABLE, 512, join(pub, "icons", "maskable-512.png"));
await png(MASKABLE, 180, join(pub, "icons", "apple-touch-icon.png"));

// ── 안드로이드 런처 아이콘 (npx cap add android 이후) ──
if (existsSync(androidRes)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const dir = join(androidRes, `mipmap-${d}`);
    await png(ICON, 48 * k, join(dir, "ic_launcher.png"));
    await png(ROUND, 48 * k, join(dir, "ic_launcher_round.png"));
    await png(FOREGROUND, 108 * k, join(dir, "ic_launcher_foreground.png"));
  }
}

await browser.close();
console.log("sample.pdf, PWA icons and Android launcher icons written");
