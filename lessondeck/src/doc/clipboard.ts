import type { Stroke } from "../ink/types";
import type { AssetMeta } from "../store/db";
import type { BoxClip } from "./boxes";
import type { Page, Sticker } from "./types";

// 앱 안 클립보드 (SPEC 5장). 마지막으로 복사·잘라낸 것 하나(글상자 / 스티커 / 페이지)를 담는다.
// 문서를 바꿔도 남도록 화면 밖(모듈)에 둔다 (앱을 끄면 사라짐).

/** 다른 문서에 붙일 때 함께 넣을 원본 파일 */
export interface ClipAsset {
  meta: AssetMeta;
  blob: Blob;
}

export interface StickerClip {
  docId: string;
  stickers: Sticker[];
  assets: Record<string, ClipAsset>;
  /** 복사할 때의 틀 높이 (페이지 세로 대비, 길게 누른 자리에 가운데를 맞출 때) */
  heights: number[];
}

export interface PageClip {
  docId: string;
  pages: Page[];
  /** 페이지 id → 필기 */
  ink: Record<string, Stroke[]>;
  /** 글상자 id → 복사할 때 보이던 글자 (다른 문서에서 링크를 풀 때 남길 글자) */
  labels: Record<string, string>;
  assets: Record<string, ClipAsset>;
}

export type AppClip = { kind: "boxes"; clip: BoxClip } | { kind: "stickers"; clip: StickerClip } | { kind: "pages"; clip: PageClip };

let current: AppClip | null = null;

export function getClip(): AppClip | null {
  return current;
}

export function setClip(next: AppClip | null) {
  current = next;
}
