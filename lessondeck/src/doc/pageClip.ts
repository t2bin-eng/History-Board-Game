import type { Stroke } from "../ink/types";
import type { PageClip } from "./clipboard";
import { newId, newPageId, type Page, type TextBox } from "./types";

// 페이지 복사·붙여넣기 (SPEC 5장 "앱 안 클립보드"). 원본 파일 옮기기는 store/assetTransfer.ts.

/** 페이지가 쓰는 원본 id (페이지 자신 + 스티커) */
export function pageAssetIds(page: Page): string[] {
  const ids = new Set<string>();
  if ("asset" in page) ids.add(page.asset);
  for (const s of page.stickers ?? []) ids.add(s.asset);
  return [...ids];
}

/** PDF 원본별로 담은 쪽 번호 (다른 문서에 그 쪽만 뽑아 넣으려고) */
export function pdfPagesUsed(pages: Page[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const p of pages) {
    if (p.kind !== "pdf") continue;
    const list = (out[p.asset] ??= []);
    if (!list.includes(p.pageIndex)) list.push(p.pageIndex);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a - b);
  return out;
}

export interface PastePlan {
  pages: Page[];
  /** 새 페이지 id → 필기 */
  ink: Record<string, Stroke[]>;
  /** 링크를 풀고 글자만 남긴 글상자 수 */
  unlinked: number;
}

/**
 * 붙일 페이지를 만든다: 새 페이지·글상자·스티커 id, 바뀐 원본 id·PDF 쪽 번호.
 * 글상자의 페이지 링크는 함께 붙이는 페이지면 새 id로, 붙이는 문서에 그 페이지가 있으면 그대로,
 * 아니면 보이던 글자만 남긴다. 돌아가기 링크는 원래 링크와의 연결(backOf)을 뗀다.
 */
export function planPaste(
  clip: PageClip,
  targetDocId: string,
  targetPages: Page[],
  assetMap: Record<string, string> = {},
  pdfIndexMap: Record<string, Record<number, number>> = {},
): PastePlan {
  const pageIdMap = new Map(clip.pages.map((p) => [p.id, newPageId()]));
  const sameDoc = clip.docId === targetDocId;
  const ink: Record<string, Stroke[]> = {};
  let unlinked = 0;

  const pages = clip.pages.map((src) => {
    const id = pageIdMap.get(src.id)!;
    let page: Page = { ...src, id };
    if ("asset" in page) {
      const asset = assetMap[page.asset] ?? page.asset;
      page =
        page.kind === "pdf"
          ? {
              ...page,
              asset,
              pageIndex: pdfIndexMap[page.asset]?.[page.pageIndex] ?? page.pageIndex,
            }
          : { ...page, asset };
    }
    if (src.boxes) {
      page.boxes = src.boxes.map(({ backOf: _backOf, ...b }) => {
        const box: TextBox = { ...b, id: newId("b") };
        if (box.link?.type !== "page") return box;
        const inClip = pageIdMap.get(box.link.pageId);
        if (inClip) return { ...box, link: { type: "page", pageId: inClip } };
        if (sameDoc && targetPages.some((p) => p.id === (box.link as { pageId: string }).pageId)) return box;
        unlinked++;
        const { link: _link, role: _role, ...rest } = box;
        return { ...rest, text: rest.text || clip.labels[b.id] || "" };
      });
    }
    if (src.stickers)
      page.stickers = src.stickers.map((s) => ({
        ...s,
        id: newId("s"),
        asset: assetMap[s.asset] ?? s.asset,
      }));
    const strokes = clip.ink[src.id];
    if (strokes?.length) ink[id] = strokes;
    return page;
  });
  return { pages, ink, unlinked };
}
