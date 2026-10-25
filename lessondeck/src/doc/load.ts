import { openPdf } from "../pdf/pdfjs";
import { newPageId, type Page, type PdfAsset } from "./types";

/** PDF 바이트를 열어 원본 파일(asset)로 만든다. 쪽마다 가로/세로 비율을 미리 읽어 둔다. */
export async function loadPdfAsset(bytes: ArrayBuffer, name: string): Promise<PdfAsset> {
  const doc = await openPdf(bytes);
  const aspects: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
    aspects.push(vp.width / vp.height);
  }
  return {
    id: `pdf-${newPageId().slice(2)}`,
    name: name.replace(/\.pdf$/i, ""),
    doc,
    pageCount: doc.numPages,
    aspects,
  };
}

/** PDF 전 쪽을 페이지 목록 항목으로 (SPEC F1) */
export function pagesForAsset(asset: PdfAsset): Page[] {
  return asset.aspects.map((_, pageIndex) => ({ id: newPageId(), kind: "pdf", asset: asset.id, pageIndex }));
}
