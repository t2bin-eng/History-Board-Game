import { htmlAsset, mediaAsset, pageAspect, pdfAsset, type DocState, type Page } from "../doc/types";
import { strokeToSvgPath } from "../ink/geometry";
import { HIGHLIGHTER_ALPHA } from "../ink/palette";
import type { Stroke } from "../ink/types";
import type { PDFDocumentProxy } from "../pdf/pdfjs";
import { getMeta } from "../store/db";
import { paintBoxes } from "./boxPaint";
import { paintStickers } from "./stickerPaint";

// 홈 카드에 쓰는 썸네일 페이지 그림 (v0.22): 페이지 + 스티커 + 필기 + 글상자를 한 장의 JPEG로.
// 다른 사이트(유튜브)의 그림은 캔버스에서 꺼낼 수 없어 그리지 않는다.

export const SNAPSHOT_WIDTH = 480;

const pdfBases = new Map<string, Promise<HTMLCanvasElement>>();

/** PDF 쪽을 폭 width로 (최근 몇 장만 기억) */
function pdfBase(doc: PDFDocumentProxy, assetId: string, pageIndex: number, width: number): Promise<HTMLCanvasElement> {
  const key = `${assetId}:${pageIndex}:${width}`;
  const hit = pdfBases.get(key);
  if (hit) return hit;
  const job = (async () => {
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas;
  })();
  pdfBases.set(key, job);
  job.catch(() => pdfBases.delete(key));
  while (pdfBases.size > 6) pdfBases.delete(pdfBases.keys().next().value!);
  return job;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("그림을 불러오지 못했습니다"));
    img.src = url;
  });
}

function card(ctx: CanvasRenderingContext2D, w: number, h: number, bg: string, fg: string, lines: string[]) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((text, i) => {
    ctx.font = `${i === 0 ? 700 : 400} ${Math.round(w * (i === 0 ? 0.07 : 0.04))}px "Pretendard", "Noto Sans KR", sans-serif`;
    ctx.fillText(text, w / 2, h / 2 + (i - (lines.length - 1) / 2) * w * 0.08, w * 0.9);
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function paintBase(ctx: CanvasRenderingContext2D, page: Page, doc: DocState, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  switch (page.kind) {
    case "pdf": {
      const asset = pdfAsset(doc.assets, page.asset);
      if (asset) ctx.drawImage(await pdfBase(asset.doc, asset.id, page.pageIndex, w), 0, 0, w, h);
      return;
    }
    case "image": {
      const asset = mediaAsset(doc.assets, page.asset);
      if (asset) ctx.drawImage(await loadImage(asset.url), 0, 0, w, h);
      return;
    }
    case "video": {
      const asset = mediaAsset(doc.assets, page.asset);
      if (asset?.poster) ctx.drawImage(await loadImage(asset.poster), 0, 0, w, h);
      else card(ctx, w, h, "#1d2433", "#ffffff", ["동영상", asset?.name ?? ""]);
      return;
    }
    case "blank": {
      if (page.background !== "grid") return;
      ctx.strokeStyle = "#dfe6ea";
      ctx.lineWidth = 1;
      const step = w / 40;
      ctx.beginPath();
      for (let x = step; x < w; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = step; y < h; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
      return;
    }
    case "html":
      card(ctx, w, h, "#eef1f5", "#3a3f4a", ["HTML", htmlAsset(doc.assets, page.asset)?.name ?? ""]);
      return;
    case "url": {
      // 안드로이드 앱이 찍어 둔 화면이 있으면 그것
      const shot = await getMeta<string>(`preview:${doc.id}:${page.id}`).catch(() => undefined);
      if (shot) ctx.drawImage(await loadImage(shot), 0, 0, w, h);
      else card(ctx, w, h, "#eef1f5", "#3a3f4a", ["웹 페이지", hostOf(page.url)]);
      return;
    }
    case "youtube":
      card(ctx, w, h, "#111111", "#ffffff", ["▶", "유튜브"]);
      return;
  }
}

/** 페이지 한 장을 썸네일 그림(JPEG data URL)으로. 못 만들면 null (PDF·그림 원본이 없으면 빈 종이를 만들지 않는다) */
export async function snapshotPage(page: Page, doc: DocState, strokes: Stroke[], width = SNAPSHOT_WIDTH): Promise<string | null> {
  if (page.kind === "pdf" && !pdfAsset(doc.assets, page.asset)) return null;
  if (page.kind === "image" && !mediaAsset(doc.assets, page.asset)) return null;
  const height = Math.round(width / pageAspect(page, doc.assets));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const size = { width, height };
  try {
    await paintBase(ctx, page, doc, width, height);
    await paintStickers(ctx, page, doc.assets, size).catch(() => undefined);
    for (const s of strokes) {
      const d = strokeToSvgPath(s, size);
      if (!d) continue;
      ctx.globalAlpha = s.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
      ctx.fillStyle = s.color;
      ctx.fill(new Path2D(d));
    }
    ctx.globalAlpha = 1;
    paintBoxes(ctx, page, doc.pages, doc.hidden, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** 홈 카드 썸네일로 쓸 페이지: 고른 페이지(지금 문서에 있으면), 아니면 처음 보이는 페이지 */
export function thumbTarget(doc: Pick<DocState, "pages" | "hidden">, chosen: string | undefined): Page | undefined {
  return (chosen && doc.pages.find((p) => p.id === chosen)) || doc.pages.find((p) => !doc.hidden.includes(p.id)) || doc.pages[0];
}
