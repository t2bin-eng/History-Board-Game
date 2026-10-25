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
