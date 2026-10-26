import type { PDFDocumentProxy } from "../pdf/pdfjs";

// 문서 = 원본 파일(assets) + 페이지 목록 (SPEC.md 2장·5장)
// 페이지 추가·삭제·순서 변경은 목록만 바꾸고 원본 PDF·HTML은 건드리지 않는다.

export interface PdfAsset {
  kind: "pdf";
  id: string;
  name: string;
  doc: PDFDocumentProxy;
  pageCount: number;
  /** 쪽별 가로/세로 비율 */
  aspects: number[];
}

export interface HtmlAsset {
  kind: "html";
  id: string;
  name: string;
  /** 파일 내용 그대로 (iframe srcdoc으로 실행) */
  html: string;
  /** 오프라인·sandbox에서 문제가 될 수 있는 점 (외부 파일, localStorage 등) */
  warnings: string[];
}

/** 이미지·동영상 원본. 기기 안(IndexedDB)의 Blob을 object URL로 보여 준다 */
export interface MediaAsset {
  kind: "image" | "video";
  id: string;
  name: string;
  mime: string;
  width: number;
  height: number;
  /** 동영상 길이(초) */
  duration?: number;
  /** 동영상 첫 장면 (작은 JPEG data URL) */
  poster?: string;
  url: string;
}

export type Asset = PdfAsset | HtmlAsset | MediaAsset;

export type BlankBackground = "plain" | "grid";

/** HTML·URL 페이지 화면 비율 (SPEC R8) */
export type AspectPreset = "16:9" | "4:3" | "A4";

export const ASPECT_PRESETS: AspectPreset[] = ["16:9", "4:3", "A4"];

/** 웹앱을 그릴 가상 화면 크기. 페이지 크기에 맞춰 통째로 축소·확대한다. */
export const VIRTUAL_SCREEN: Record<AspectPreset, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "4:3": { width: 1024, height: 768 },
  A4: { width: 794, height: 1123 },
};

/** 텍스트 상자의 하이퍼링크: 이 문서의 다른 페이지 또는 외부 웹 주소 */
export type BoxLink = { type: "page"; pageId: string } | { type: "url"; url: string };

/** 페이지 위 텍스트 상자 (SPEC 5장). 위치는 페이지 대비 0~1, 글자 크기는 "페이지 가로 = 1000" 단위 */
export interface TextBox {
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  link?: BoxLink;
  /** 페이지 링크를 걸 때 연결한 페이지에 자동으로 생긴 "돌아가기" 링크 */
  role?: "back";
  /** 이 돌아가기 링크를 만든 원래 링크 상자 id (원래 링크를 지우면 같이 지운다) */
  backOf?: string;
}

export type Page = (
  | { id: string; kind: "pdf"; asset: string; pageIndex: number }
  | { id: string; kind: "blank"; background: BlankBackground; aspect: number }
  | { id: string; kind: "html"; asset: string; aspect: AspectPreset }
  | { id: string; kind: "url"; url: string; aspect: AspectPreset }
  | { id: string; kind: "youtube"; videoId?: string; list?: string; start?: number; aspect: AspectPreset }
  | { id: string; kind: "image"; asset: string }
  | { id: string; kind: "video"; asset: string }
) & {
  /** 텍스트 상자·하이퍼링크 */
  boxes?: TextBox[];
};

/** iframe으로 띄우는 페이지 (화면 비율을 고를 수 있음) */
export type WebPage = Extract<Page, { kind: "html" | "url" | "youtube" }>;
/** 판서/조작 모드가 있는 페이지 (웹앱·동영상) */
export type InteractivePage = Extract<Page, { kind: "html" | "url" | "youtube" | "video" }>;

export interface DocState {
  /** 기기 안 저장소(IndexedDB)의 문서 id */
  id: string;
  title: string;
  assets: Record<string, Asset>;
  pages: Page[];
  /** 숨긴 페이지 id (SPEC F3) */
  hidden: string[];
}

export const A4_PORTRAIT = 210 / 297;

export function isWebPage(page: Page | undefined): page is WebPage {
  return page?.kind === "html" || page?.kind === "url" || page?.kind === "youtube";
}

export function isInteractivePage(page: Page | undefined): page is InteractivePage {
  return isWebPage(page) || page?.kind === "video";
}

export function pageAspect(page: Page, assets: Record<string, Asset>): number {
  switch (page.kind) {
    case "blank":
      return page.aspect;
    case "html":
    case "url":
    case "youtube": {
      const v = VIRTUAL_SCREEN[page.aspect];
      return v.width / v.height;
    }
    case "pdf": {
      const asset = assets[page.asset];
      return asset?.kind === "pdf" ? (asset.aspects[page.pageIndex] ?? A4_PORTRAIT) : A4_PORTRAIT;
    }
    case "image":
    case "video": {
      const asset = mediaAsset(assets, page.asset);
      return asset && asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 16 / 9;
    }
  }
}

export function mediaAsset(assets: Record<string, Asset>, id: string): MediaAsset | undefined {
  const a = assets[id];
  return a?.kind === "image" || a?.kind === "video" ? a : undefined;
}

export function pdfAsset(assets: Record<string, Asset>, id: string): PdfAsset | undefined {
  const a = assets[id];
  return a?.kind === "pdf" ? a : undefined;
}

export function htmlAsset(assets: Record<string, Asset>, id: string): HtmlAsset | undefined {
  const a = assets[id];
  return a?.kind === "html" ? a : undefined;
}

export function newId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newPageId(): string {
  return newId("p");
}
