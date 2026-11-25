import { useEffect, useLayoutEffect, useRef } from "react";
import type { PageSize } from "../ink/geometry";
import type { PDFDocumentProxy } from "./pdfjs";
import { getReady, pageKey, pixelWidthFor, renderPage } from "./renderCache";
import { contains, SHARP_MIN_GAIN, sharpWindow, type SharpWindow } from "../view/sharpWindow";
import { onViewSettled } from "../view/viewMotion";

/** 확대한 PDF의 선명한 창 한 장 픽셀 수 상한 (v0.50) */
const MAX_PDF_TILE_PIXELS = 9_000_000;

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

  // 선명한 창 (v0.50, SPEC 6장 "확대한 필기·PDF"): 전체 쪽 그림은 픽셀 수 상한(MAX_PDF_PIXELS)이 있어 크게 확대하면 흐리다.
  // 화면 이동·확대가 멈추면 보이는 자리(+ 여유)만 실제 배율로 그려 위에 덮는다 (다 그릴 때까지는 그전 그림 그대로)
  const tileHostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tiles = tileHostRef.current;
    if (!tiles || !pixelWidth) return;
    let win: SharpWindow | null = null;
    let task: { cancel: () => void } | null = null;
    let disposed = false;
    const drop = () => {
      task?.cancel();
      task = null;
      win = null;
      for (const c of [...tiles.children] as HTMLCanvasElement[]) {
        c.width = 0;
        c.height = 0;
      }
      tiles.replaceChildren();
    };
    const update = async (force: boolean) => {
      const host = hostRef.current;
      if (!host) return;
      const want = (window.devicePixelRatio || 1) * (zoom || 1);
      const full = pixelWidth / Math.max(1, size.width);
      const next = want > full * SHARP_MIN_GAIN ? sharpWindow(host, size, want, MAX_PDF_TILE_PIXELS) : null;
      if (!next) return drop();
      if (!force && win && Math.abs(win.s - next.s) < 1e-6 && contains(win, next.visible)) return;
      task?.cancel();
      win = next;
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (disposed || win !== next) return;
        const base = page.getViewport({ scale: 1 });
        const k = size.width / base.width;
        const viewport = page.getViewport({ scale: next.s * k, offsetX: -next.x * next.s, offsetY: -next.y * next.s });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(next.w * next.s));
        canvas.height = Math.max(1, Math.round(next.h * next.s));
        canvas.className = "pdf-sharp";
        Object.assign(canvas.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.w}px`, height: `${next.h}px` });
        const job = page.render({ canvas, viewport });
        task = job;
        await job.promise;
        if (disposed || win !== next) {
          canvas.width = 0;
          canvas.height = 0;
          return;
        }
        for (const c of [...tiles.children] as HTMLCanvasElement[]) {
          c.width = 0;
          c.height = 0;
        }
        tiles.replaceChildren(canvas);
      } catch (err) {
        if ((err as Error)?.name !== "RenderingCancelledException") console.error(err);
      }
    };
    void update(true);
    const off = onViewSettled(() => void update(false));
    return () => {
      disposed = true;
      off();
      drop();
    };
    // size는 그릴 때마다 새 객체라 가로·세로 값으로
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageIndex, pixelWidth, zoom, size.width, size.height]);

  return (
    <>
      <div ref={hostRef} className="pdf-host" style={{ width: size.width, height: size.height }} />
      <div ref={tileHostRef} className="pdf-sharp-host" style={{ width: size.width, height: size.height }} aria-hidden="true" />
    </>
  );
}
