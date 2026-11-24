import type { PageSize } from "./geometry";
import { strokesBounds, transformStrokes, translate } from "./selection";
import type { Stroke } from "./types";

// 여백 넣기 (v0.46, SPEC 5장 "여백 넣기로 옮긴 획" · 6장 "여백 넣기"): 가로줄 아래의 필기를 아래로 밀어 사이를 띄우거나 위로 당겨 좁힌다.

/** 줄(페이지 px y) 아래에서 시작하는 획: 맨 위 끝(굵기 절반 포함)이 줄보다 아래. 줄에 걸친 획은 그대로 */
export function strokesBelow(strokes: Stroke[], y: number, page: PageSize): Stroke[] {
  return strokes.filter((s) => {
    const b = strokesBounds([s], page, 0);
    return !!b && b.y0 >= y;
  });
}

/** 옮길 수 있는 범위 (페이지 px): 위로는 맨 위가 줄에 닿을 때까지(≤ 0), 아래로는 맨 아래가 페이지 끝에 닿을 때까지(≥ 0) */
export function spaceLimits(moving: Stroke[], y: number, page: PageSize): { up: number; down: number } {
  const b = strokesBounds(moving, page, 0);
  if (!b) return { up: 0, down: 0 };
  return { up: Math.min(0, y - b.y0), down: Math.max(0, page.height - b.y1) };
}

/** 범위 안으로 */
export function clampSpace(dy: number, limits: { up: number; down: number }): number {
  return Math.min(limits.down, Math.max(limits.up, dy));
}

/** 획들을 dy(페이지 px)만큼 위아래로 */
export function shiftDown(moving: Stroke[], dy: number, page: PageSize): Stroke[] {
  return dy ? transformStrokes(moving, translate(0, dy), page) : moving;
}
