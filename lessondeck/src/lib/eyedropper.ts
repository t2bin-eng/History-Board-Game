import type { DocState, Page } from "../doc/types";
import { strokeHitsCircle } from "../ink/geometry";
import { isHighlighter, strokeColor } from "../ink/inkPaint";
import { shiftStroke } from "../ink/shift";
import type { Stroke } from "../ink/types";
import { pageFullImage } from "../view/pageSnapshot";
import { isNativeApp } from "./platform";
import { snapshotRegion } from "./webFrames";

// 스포이트 (v0.42, SPEC 6장 "색 고르기"): 화면의 한 점에서 색을 가져온다.
// 1) 누른 자리에 필기가 있으면 그 획의 색 그대로 (형광펜도 종이와 섞이기 전의 색)
// 2) 안드로이드 앱: 그 자리 화면을 찍어 가운데 색 (PDF·그림·웹 페이지·글상자 어디든)
// 3) 웹 버전: 페이지를 그림으로 그려 그 자리 색 (다른 사이트·HTML 페이지 바탕은 그릴 수 없음)

/** 필기를 찾는 반경 (화면 px) */
const INK_REACH_PX = 6;

export type PickResult = { color: string; from: "ink" | "screen" | "page" } | { error: "outside" | "unavailable" };

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const rgbHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** 화면 점 → 그 자리의 획 (펜이 위, 그다음 형광펜). strokes는 화면에 그려진 좌표(웹 스크롤을 옮긴 뒤) */
export function inkColorAt(strokes: Stroke[], x: number, y: number, page: { width: number; height: number }, reach: number): string | null {
  const hit = (list: Stroke[]) => {
    for (let i = list.length - 1; i >= 0; i--) if (strokeHitsCircle(list[i], x, y, reach, page)) return list[i];
    return null;
  };
  const s = hit(strokes.filter((s) => !isHighlighter(s))) ?? hit(strokes.filter(isHighlighter));
  return s ? strokeColor(s).toLowerCase() : null;
}

/** 그림(data URL·Blob)의 (fx, fy) 비율 자리 색. 가운데 2×2를 고르게 */
async function sampleImage(src: Blob, fx: number, fy: number): Promise<string | null> {
  const bmp = await createImageBitmap(src);
  try {
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const px = Math.max(0, Math.min(bmp.width - 2, Math.floor(fx * bmp.width - 0.5)));
    const py = Math.max(0, Math.min(bmp.height - 2, Math.floor(fy * bmp.height - 0.5)));
    const d = ctx.getImageData(px, py, Math.min(2, bmp.width), Math.min(2, bmp.height)).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    c.width = c.height = 0;
    return rgbHex(r / n, g / n, b / n);
  } finally {
    bmp.close();
  }
}

/**
 * 화면 점 (x, y)의 색. strokes는 지금 페이지의 저장된 획(웹 문서 좌표), shift는 HTML 페이지가 스크롤된 만큼(비율).
 * 페이지는 화면의 지금 페이지 `.page.current` (v0.44 이어 보기에서도).
 */
export async function pickColorAt(x: number, y: number, ctx: { page: Page; doc: DocState; strokes: Stroke[]; shift: { x: number; y: number } }): Promise<PickResult> {
  const el = document.querySelector<HTMLElement>(".page.current");
  const rect = el?.getBoundingClientRect();
  const inside = !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  if (el && rect && inside) {
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const k = size.width / rect.width;
    const shown = ctx.strokes.map((s) => shiftStroke(s, -ctx.shift.x, -ctx.shift.y));
    const ink = inkColorAt(shown, (x - rect.left) * k, (y - rect.top) * k, size, INK_REACH_PX * k);
    if (ink) return { color: ink, from: "ink" };
  }
  if (isNativeApp) {
    // 누른 자리 둘레 8 CSS px를 PNG로 (기기 px가 8 넘게)
    const url = await snapshotRegion({ x: x - 4, y: y - 4, width: 8, height: 8 }, 8, undefined, "png");
    if (url) {
      const color = await sampleImage(await (await fetch(url)).blob(), 0.5, 0.5);
      if (color) return { color, from: "screen" };
    }
    return { error: "unavailable" };
  }
  if (!rect || !inside) return { error: "outside" };
  // 웹 버전은 웹 페이지·동영상의 지금 화면을 그릴 수 없다 (대신 그리는 그림은 진짜 색이 아님)
  if (ctx.page.kind === "html" || ctx.page.kind === "url" || ctx.page.kind === "youtube" || ctx.page.kind === "video") return { error: "unavailable" };
  const image = await pageFullImage(ctx.page, ctx.doc, ctx.strokes, 800);
  if (!image) return { error: "unavailable" };
  const color = await sampleImage(image.blob, (x - rect.left) / rect.width, (y - rect.top) / rect.height);
  return color ? { color, from: "page" } : { error: "unavailable" };
}
