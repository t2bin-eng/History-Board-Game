import type { PDFDocumentProxy } from "./pdfjs";

// 페이지 바에 쓰는 PDF 축소 이미지. 작은 JPEG 데이터 URL로 보관해 메모리를 아낀다.
// 본문 렌더링을 방해하지 않도록 한 번에 하나씩 차례로 그린다.

const THUMB_WIDTH = 240;
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

export function thumbnailFor(doc: PDFDocumentProxy, assetId: string, pageIndex: number): Promise<string> {
  const key = `${assetId}:${pageIndex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const url = canvas.toDataURL("image/jpeg", 0.82);
    canvas.width = 0;
    canvas.height = 0;
    return url;
  });
  queue = job.catch(() => undefined);
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}

export function clearThumbnails(assetId?: string) {
  for (const key of [...cache.keys()]) {
    if (!assetId || key.startsWith(`${assetId}:`)) cache.delete(key);
  }
}
