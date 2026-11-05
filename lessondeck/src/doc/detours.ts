import { stepVisible } from "./pages";
import type { Page } from "./types";

// 강의 모드: 페이지 링크로 다른 쪽을 보고 돌아온 경우, 그 쪽은 다음·이전으로 넘길 때 건너뛴다 (SPEC 6장 "링크로 본 쪽 건너뛰기")

/** 페이지 링크로 간 길 (from 쪽에서 to 쪽으로) */
export interface Detour {
  from: string;
  to: string;
}

/**
 * 페이지 링크로 from → to. 전에 to → from으로 왔던 길을 되짚으면 from(들렀던 쪽)을 "링크로 본 쪽"으로 돌려준다.
 * 여러 번 들어가도(A → P → Q → P → A) 돌아올 때마다 하나씩 (Q, 그다음 P).
 */
export function followDetour(trail: Detour[], from: string, to: string): { trail: Detour[]; seen: string | null } {
  if (from === to) return { trail, seen: null };
  let back = -1;
  for (let i = trail.length - 1; i >= 0; i--) {
    if (trail[i].from === to && trail[i].to === from) {
      back = i;
      break;
    }
  }
  if (back >= 0) return { trail: [...trail.slice(0, back), ...trail.slice(back + 1)], seen: from };
  return { trail: [...trail, { from, to }], seen: null };
}

/** 숨긴 쪽과 skip(링크로 본 쪽)을 건너뛰고 한 쪽 넘기기. 건너뛴 쪽들도 함께. 더 갈 곳이 없으면 next = null */
export function stepSkipping(
  pages: Page[],
  hidden: string[],
  skip: string[],
  currentId: string,
  delta: 1 | -1,
): { next: string | null; skipped: string[] } {
  const skipSet = new Set(skip.filter((id) => id !== currentId));
  const skipped: string[] = [];
  let id = currentId;
  for (;;) {
    const n = stepVisible(pages, hidden, id, delta);
    if (!n) return { next: null, skipped };
    if (!skipSet.has(n)) return { next: n, skipped };
    skipped.push(n);
    id = n;
  }
}
