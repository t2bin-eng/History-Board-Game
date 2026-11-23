import type { InkPoint, Stroke } from "./types";

// 획 옮기기 (v0.36, SPEC 5장 "HTML 페이지 필기는 웹앱 문서에 붙는다"):
// HTML 페이지 획은 웹앱 문서 좌표로 저장하고, 화면에는 스크롤만큼 옮겨 그린다.

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** 점(과 도형 중심)을 dx, dy(0~1 비율)만큼 옮긴 획. 0이면 그대로 */
export function shiftStroke<T extends Stroke>(s: T, dx: number, dy: number): T {
  if (!dx && !dy) return s;
  const points = s.points.map(([x, y, p]) => [round(x + dx), round(y + dy), p] as InkPoint);
  return s.shape ? { ...s, points, shape: { ...s.shape, cx: s.shape.cx + dx, cy: s.shape.cy + dy } } : { ...s, points };
}

export interface ShiftedView {
  /** 화면에 그릴 획 */
  strokes: Stroke[];
  /** 화면 획 목록(고친 뒤) → 저장할 획 목록. 그대로인 획은 원래 획을 돌려준다 (옮겼다 되돌리며 생기는 오차 없이) */
  back(next: Stroke[]): Stroke[];
}

/** 문서 좌표 획 → 화면 좌표(스크롤 x, y만큼 위·왼쪽으로) */
export function shiftedView(strokes: Stroke[], x: number, y: number): ShiftedView {
  if (!x && !y) return { strokes, back: (next) => next };
  const original = new WeakMap<Stroke, Stroke>();
  const shown = strokes.map((s) => {
    const v = shiftStroke(s, -x, -y);
    original.set(v, s);
    return v;
  });
  return { strokes: shown, back: (next) => next.map((s) => original.get(s) ?? shiftStroke(s, x, y)) };
}
