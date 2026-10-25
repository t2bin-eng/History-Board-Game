import type { PDFDocumentProxy } from "../pdf/pdfjs";

// 문서 = 원본 파일(assets) + 페이지 목록 (SPEC.md 2장·5장)
// 페이지 추가·삭제·순서 변경은 목록만 바꾸고 원본 PDF는 건드리지 않는다.

export interface PdfAsset {
  id: string;
  name: string;
  doc: PDFDocumentProxy;
  pageCount: number;
  /** 쪽별 가로/세로 비율 */
  aspects: number[];
}

export type BlankBackground = "plain" | "grid";

export type Page =
  | { id: string; kind: "pdf"; asset: string; pageIndex: number }
  | { id: string; kind: "blank"; background: BlankBackground; aspect: number };

export interface DocState {
  title: string;
  assets: Record<string, PdfAsset>;
  pages: Page[];
}

export const A4_PORTRAIT = 210 / 297;

export function pageAspect(page: Page, assets: Record<string, PdfAsset>): number {
  if (page.kind === "blank") return page.aspect;
  return assets[page.asset]?.aspects[page.pageIndex] ?? A4_PORTRAIT;
}

export function newPageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `p-${crypto.randomUUID()}`
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
