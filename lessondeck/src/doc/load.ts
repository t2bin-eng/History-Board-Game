import { openPdf } from "../pdf/pdfjs";
import { analyzeHtml, decodeHtml, displayName } from "./html";
import { newPageId, type HtmlAsset, type Page, type PdfAsset } from "./types";

/** PDF 바이트를 열어 원본 파일(asset)로 만든다. 쪽마다 가로/세로 비율을 미리 읽어 둔다. */
export async function loadPdfAsset(bytes: ArrayBuffer, name: string): Promise<PdfAsset> {
  const doc = await openPdf(bytes);
  const aspects: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
    aspects.push(vp.width / vp.height);
  }
  return {
    kind: "pdf",
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

/** HTML 파일을 원본(asset)으로 만든다. 내용을 그대로 보관해 서버 없이 실행한다 (SPEC F2) */
export function loadHtmlAsset(bytes: ArrayBuffer, fileName: string): HtmlAsset {
  const html = decodeHtml(bytes);
  return {
    kind: "html",
    id: `html-${newPageId().slice(2)}`,
    name: displayName(fileName),
    html,
    warnings: analyzeHtml(html),
  };
}
