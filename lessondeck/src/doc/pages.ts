import type { Page } from "./types";

// 페이지 목록 편집. 모두 새 배열을 돌려주는 순수 함수다.

export function insertPages(pages: Page[], index: number, added: Page[]): Page[] {
  const at = Math.max(0, Math.min(index, pages.length));
  return [...pages.slice(0, at), ...added, ...pages.slice(at)];
}

export function removePage(pages: Page[], id: string): Page[] {
  return pages.filter((p) => p.id !== id);
}

/** 페이지를 delta칸 옮긴다 (-1: 앞으로, +1: 뒤로) */
export function movePage(pages: Page[], id: string, delta: number): Page[] {
  const from = pages.findIndex((p) => p.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= pages.length) return pages;
  const next = pages.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 페이지를 지운 뒤 보여 줄 페이지: 같은 자리(뒤 페이지), 없으면 앞 페이지 */
export function pageAfterRemoval(pages: Page[], removedId: string): string | null {
  const i = pages.findIndex((p) => p.id === removedId);
  if (i < 0) return null;
  return pages[i + 1]?.id ?? pages[i - 1]?.id ?? null;
}

/** 숨긴 페이지를 건너뛰고 delta 방향의 다음 페이지 id. 없으면 null */
export function stepVisible(pages: Page[], hidden: string[], currentId: string, delta: 1 | -1): string | null {
  const skip = new Set(hidden);
  let i = pages.findIndex((p) => p.id === currentId);
  for (i += delta; i >= 0 && i < pages.length; i += delta) {
    if (!skip.has(pages[i].id)) return pages[i].id;
  }
  return null;
}

/** 숨기지 않은 페이지 중 몇 번째인지(0부터)와 전체 개수 */
export function visiblePosition(pages: Page[], hidden: string[], currentId: string): { index: number; count: number } {
  const skip = new Set(hidden);
  const visible = pages.filter((p) => !skip.has(p.id));
  return { index: visible.findIndex((p) => p.id === currentId), count: visible.length };
}

/** 끌어서 놓기: 원래 목록 기준 삽입 위치(0~길이)로 옮긴다 */
export function movePageTo(pages: Page[], id: string, toIndex: number): Page[] {
  const from = pages.findIndex((p) => p.id === id);
  if (from < 0) return pages;
  // 자기 뒤로 옮기면 자신이 빠진 만큼 한 칸 당겨진다
  const target = Math.max(0, Math.min(pages.length - 1, toIndex > from ? toIndex - 1 : toIndex));
  if (target === from) return pages;
  const next = pages.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}
