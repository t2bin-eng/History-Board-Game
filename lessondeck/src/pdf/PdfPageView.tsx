import { useEffect, useLayoutEffect, useRef } from "react";
import type { PageSize } from "../ink/geometry";
import type { PDFDocumentProxy } from "./pdfjs";
import { getReady, pageKey, pixelWidthFor, renderPage } from "./renderCache";

interface Props {
  doc: PDFDocumentProxy;
  assetId: string;
  pageIndex: number;
  size: PageSize;
  /** 손가락으로 확대한 배율. 확대가 끝나면 이 배율로 다시 선명하게 그린다. */
  zoom: number;
  /** 미리 그려 둘 앞뒤 쪽 */
  prefetch?: { doc: PDFDocumentProxy; assetId: string; pageIndex: number; size: PageSize }[];
  onRendered?: (ms: number) => void;
}

// 캐시에서 꺼낸 캔버스를 그대로 붙인다 (복사 없음)
export function PdfPageView({ doc, assetId, pageIndex, size, zoom, prefetch, onRendered }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pixelWidth = size.width > 0 ? pixelWidthFor(size.width, size.height, zoom) : 0;
  const key = pageKey(assetId, pageIndex, pixelWidth);

  useLayoutEffect(() => {
    const host = hostRef.current!;
    if (!pixelWidth) return;
    const shown = host.firstElementChild as HTMLCanvasElement | null;
    const readyCanvas = getReady(key);
    if (readyCanvas) {
      readyCanvas.dataset.page = `${assetId}:${pageIndex}`;
      if (shown !== readyCanvas) host.replaceChildren(readyCanvas);
      return;
    }
    // 같은 쪽을 더 선명하게 다시 그리는 중이면 기존 그림을 유지하고, 다른 쪽이면 비운다
    if (shown?.dataset.page !== `${assetId}:${pageIndex}`) host.replaceChildren();
    let cancelled = false;
    const t0 = performance.now();
    renderPage(doc, key, pageIndex, pixelWidth)
      .then((canvas) => {
        if (cancelled) return;
        canvas.dataset.page = `${assetId}:${pageIndex}`;
        host.replaceChildren(canvas);
        onRendered?.(performance.now() - t0);
      })
      .catch((err) => {
        if ((err as Error)?.name !== "RenderingCancelledException") console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, assetId, pageIndex, pixelWidth, key, onRendered]);

  // 현재 쪽이 그려진 뒤 앞뒤 쪽을 미리 그린다 (확대 배율 1 기준)
  useEffect(() => {
    if (!prefetch?.length || !pixelWidth) return;
    const t = setTimeout(() => {
      for (const p of prefetch) {
        const w = pixelWidthFor(p.size.width, p.size.height, 1);
        renderPage(p.doc, pageKey(p.assetId, p.pageIndex, w), p.pageIndex, w).catch(() => undefined);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [prefetch, pixelWidth]);

  return <div ref={hostRef} className="pdf-host" style={{ width: size.width, height: size.height }} />;
}
