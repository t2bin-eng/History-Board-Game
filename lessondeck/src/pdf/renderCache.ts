import type { PDFDocumentProxy } from "./pdfjs";

// PDF 쪽을 캔버스로 그려 두는 작은 캐시.
// 현재 쪽과 앞뒤 쪽을 미리 그려 두면 페이지를 넘길 때 바로 보인다 (SPEC R7: 현재 쪽 주변만 유지).

const MAX_ENTRIES = 4;
const entries = new Map<string, Promise<HTMLCanvasElement>>();
const ready = new Map<string, HTMLCanvasElement>();

/** 태블릿에서 캔버스가 너무 커져 메모리가 부족해지지 않도록 픽셀 수 상한을 둔다 */
export const MAX_PDF_PIXELS = 12_000_000;

export function pageKey(assetId: string, pageIndex: number, pixelWidth: number) {
  return `${assetId}:${pageIndex}:${pixelWidth}`;
}

/** CSS 크기와 확대 배율로 실제 캔버스 가로 픽셀 수를 정한다 */
export function pixelWidthFor(cssWidth: number, cssHeight: number, zoom: number): number {
  let scale = (window.devicePixelRatio || 1) * zoom;
  const pixels = cssWidth * cssHeight * scale * scale;
  if (pixels > MAX_PDF_PIXELS) scale *= Math.sqrt(MAX_PDF_PIXELS / pixels);
  return Math.max(1, Math.round(cssWidth * scale));
}

/** 이미 그려진 캔버스가 있으면 바로 돌려준다 (페이지 전환 시 깜빡임 방지) */
export function getReady(key: string): HTMLCanvasElement | undefined {
  return ready.get(key);
}

export function renderPage(doc: PDFDocumentProxy, key: string, pageIndex: number, pixelWidth: number) {
  const hit = entries.get(key);
  if (hit) {
    // 최근에 쓴 항목을 맨 뒤로
    entries.delete(key);
    entries.set(key, hit);
    return hit;
  }
  const job = (async () => {
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pixelWidth / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.className = "pdf-canvas";
    await page.render({ canvas, viewport }).promise;
    // 그리는 동안 캐시에서 밀려났으면 보관하지 않는다
    if (entries.has(key)) ready.set(key, canvas);
    return canvas;
  })();
  entries.set(key, job);
  job.catch(() => evict(key));
  while (entries.size > MAX_ENTRIES) evict(entries.keys().next().value!);
  return job;
}

function evict(key: string) {
  entries.delete(key);
  const canvas = ready.get(key);
  ready.delete(key);
  // 화면에 붙어 있지 않은 캔버스는 크기를 0으로 줄여 메모리를 바로 돌려준다
  if (canvas && !canvas.isConnected) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function clearRenderCache() {
  for (const key of [...entries.keys()]) evict(key);
}
