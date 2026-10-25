import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const base = import.meta.env.BASE_URL;

export type { PDFDocumentProxy };

/** PDF 바이트를 연다. 원본은 수정하지 않으므로 호출 측 버퍼를 복사해서 넘긴다. */
export function openPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  return getDocument({
    data: bytes,
    // 한글 PDF(CID 글꼴)와 비내장 표준 글꼴을 오프라인에서도 그리기 위한 경로 (scripts/copy-pdfjs-assets.mjs)
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
  }).promise;
}
