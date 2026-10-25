import { useEffect, useRef } from "react";
import type { PageSize } from "../ink/geometry";
import type { PDFDocumentProxy } from "./pdfjs";

interface Props {
  doc: PDFDocumentProxy;
  pageIndex: number;
  size: PageSize;
  onRendered?: (ms: number) => void;
}

/** 태블릿에서 캔버스가 너무 커져 메모리가 부족해지지 않도록 픽셀 수 상한을 둔다 */
const MAX_PIXELS = 12_000_000;

export function PdfPageCanvas({ doc, pageIndex, size, onRendered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    const t0 = performance.now();

    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      let dpr = window.devicePixelRatio || 1;
      const pixels = size.width * dpr * size.height * dpr;
      if (pixels > MAX_PIXELS) dpr *= Math.sqrt(MAX_PIXELS / pixels);
      const viewport = page.getViewport({ scale: (size.width * dpr) / baseViewport.width });

      // 렌더링이 끝날 때까지 기존 그림을 유지하도록 화면 밖 캔버스에 먼저 그린다
      const off = document.createElement("canvas");
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      task = page.render({ canvas: off, viewport });
      try {
        await task.promise;
      } catch (err) {
        if ((err as Error)?.name !== "RenderingCancelledException") console.error(err);
        return;
      }
      if (cancelled) return;
      const canvas = canvasRef.current!;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")!.drawImage(off, 0, 0);
      onRendered?.(performance.now() - t0);
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, size.width, size.height, onRendered]);

  return <canvas ref={canvasRef} className="pdf-canvas" style={{ width: size.width, height: size.height }} />;
}
