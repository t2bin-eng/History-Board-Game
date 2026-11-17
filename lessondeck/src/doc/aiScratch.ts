import { emptyHistory, type InkBook } from "../ink/history";
import type { Stroke } from "../ink/types";
import { toRuntimeAsset, type OpenedDoc } from "../store/docStore";
import type { PageImage } from "../view/pageSnapshot";
import type { Asset, DocState, Page } from "./types";

// AI로 보내기 (v0.31, SPEC 5장): 저장하지 않는 임시 문서. 보고 있는 페이지의 바탕을 그림으로 굳히고,
// 그 위에 원래 페이지의 글상자·화살표·스티커·필기를 옮겨 와 고칠 수 있게 한다.

export const AI_DOC_ID = "ai-scratch";
export const AI_PAGE_ID = "ai-page";
export const AI_SHOT_ID = "ai-shot";

/** 편집 화면이 AI 창을 열 때 넘기는 것 */
export interface AiRequest {
  /** 페이지 바탕 그림 */
  base: PageImage;
  /** 보고 있던 페이지 (글상자·화살표·스티커를 옮겨 온다) */
  page: Page;
  strokes: Stroke[];
  /** 돌아올 때 그대로 이어 쓰도록: 그 문서의 필기(실행 취소 포함)와 강의 모드였는지 */
  ink: InkBook;
  lecture: boolean;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 임시 페이지: 바탕 그림(image) 위에 원래 페이지의 글상자·화살표·스티커 사본 */
export function aiScratchPage(source: Page): Page {
  const page: Page = { id: AI_PAGE_ID, kind: "image", asset: AI_SHOT_ID };
  if (source.boxes?.length) page.boxes = clone(source.boxes);
  if (source.arrows?.length) page.arrows = clone(source.arrows);
  if (source.stickers?.length) page.stickers = clone(source.stickers);
  return page;
}

/** 임시 문서를 연다. 스티커 원본은 원래 문서의 것을 빌려 쓴다 (닫을 때 정리하지 않음) */
export async function openAiScratch(req: AiRequest, from: DocState): Promise<OpenedDoc> {
  const { base } = req;
  const shot = await toRuntimeAsset(AI_SHOT_ID, { type: "image", name: "AI", mime: base.blob.type || "image/jpeg", width: base.width, height: base.height }, base.blob);
  const page = aiScratchPage(req.page);
  const assets: Record<string, Asset> = { [AI_SHOT_ID]: shot };
  for (const s of page.stickers ?? []) {
    const a = from.assets[s.asset];
    if (a) assets[s.asset] = a;
  }
  return {
    doc: { id: AI_DOC_ID, title: "AI로 보내기", assets, pages: [page], hidden: [] },
    ink: { [AI_PAGE_ID]: { ...emptyHistory, present: req.strokes.slice() } },
    missingAssets: [],
  };
}

/** 임시 문서를 닫을 때: 그 창에서 새로 만든 원본만 정리 (원래 문서에서 빌려 온 것은 그대로) */
export function releaseAiScratch(doc: DocState, from: DocState) {
  for (const [id, a] of Object.entries(doc.assets)) {
    if (from.assets[id] === a) continue;
    if (a.kind === "pdf") a.doc.loadingTask.destroy();
    else if (a.kind === "image" || a.kind === "video") URL.revokeObjectURL(a.url);
  }
}
