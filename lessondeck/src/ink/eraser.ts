import { unitsToPx, type PageSize } from "./geometry";
import type { InkPoint, Stroke } from "./types";

// 지우개가 지울 것 (v0.32, SPEC 5장 기기 설정 lessondeck.eraserTarget · 6장 지우개)
// 판서 위에 그은 형광펜만 걷어 내거나, 형광펜은 두고 펜 글씨만 지울 때. 도형 획은 그 도구(펜·형광펜)를 따른다.

export type EraserTarget = "all" | "pen" | "highlighter";

export const ERASER_TARGET_KEY = "lessondeck.eraserTarget";

export const ERASER_TARGETS: { id: EraserTarget; label: string; clearLabel: string }[] = [
  { id: "all", label: "전부", clearLabel: "필기 지우기" },
  { id: "pen", label: "펜만", clearLabel: "펜 필기 모두 지우기" },
  { id: "highlighter", label: "형광펜만", clearLabel: "형광펜 모두 지우기" },
];

/** 이 지우개가 이 획을 지울 수 있는지 */
export function eraserTakes(target: EraserTarget, stroke: Stroke): boolean {
  if (target === "all") return true;
  return stroke.tool === target;
}

/** 기기에 기억한 값 (없거나 읽지 못하면 전부) */
export function loadEraserTarget(): EraserTarget {
  try {
    const v = localStorage.getItem(ERASER_TARGET_KEY);
    if (v === "pen" || v === "highlighter") return v;
  } catch {
    // 기억을 못 읽으면 기본값
  }
  return "all";
}

export function saveEraserTarget(target: EraserTarget) {
  try {
    localStorage.setItem(ERASER_TARGET_KEY, target);
  } catch {
    // 기억하지 못해도 이번 실행 동안은 된다
  }
}

// ── 지우는 방법 (v0.40, SPEC 5장 lessondeck.eraserMode · "부분 지우개로 잘린 획", 6장 "지우개 — 지우는 방법") ──

/** stroke: 닿은 획을 통째로 · area: 문지른 부분만 */
export type EraserMode = "stroke" | "area";

export const ERASER_MODE_KEY = "lessondeck.eraserMode";

export const ERASER_MODES: { id: EraserMode; label: string }[] = [
  { id: "stroke", label: "획 통째로" },
  { id: "area", label: "문지른 부분만" },
];

export function loadEraserMode(): EraserMode {
  try {
    if (localStorage.getItem(ERASER_MODE_KEY) === "area") return "area";
  } catch {
    // 기억을 못 읽으면 기본값
  }
  return "stroke";
}

export function saveEraserMode(mode: EraserMode) {
  try {
    localStorage.setItem(ERASER_MODE_KEY, mode);
  } catch {
    // 기억하지 못해도 이번 실행 동안은 된다
  }
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * 부분 지우개: 획에서 지우개 원(가운데 cx·cy, 반지름 r — 페이지 px) 안에 든 부분만 잘라 낸다.
 * 원은 획 굵기의 1/4만큼 넓혀 본다(굵은 형광펜의 잘린 끝 둥근 마개가 지운 자리로 많이 들어오지 않게).
 * 원에 닿지 않으면 null(그대로). 닿으면 남은 조각들(다 지워졌으면 빈 배열) — 첫 조각은 원래 id, 나머지는 newId().
 * 잘린 끝이 원 가장자리에 맞도록 점 사이를 촘촘히 채운다(필압도 사이값). 점 하나뿐인 조각은 버린다.
 * 도형 획은 shape를 떼고 그 선의 점으로 된 고른 굵기 획이 된다.
 */
export function eraseStrokeArea(stroke: Stroke, cx: number, cy: number, r: number, page: PageSize, newId: () => string): Stroke[] | null {
  const reach = r + unitsToPx(stroke.width, page) / 4;
  const pts = stroke.points;
  if (!pts.length) return null;
  const px = (q: InkPoint) => q[0] * page.width;
  const py = (q: InkPoint) => q[1] * page.height;
  const inside = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= reach;
  // 닿는지 먼저 (점 사이 선분까지)
  let touches = pts.length === 1 && inside(px(pts[0]), py(pts[0]));
  for (let i = 1; i < pts.length && !touches; i++) {
    const ax = px(pts[i - 1]);
    const ay = py(pts[i - 1]);
    const bx = px(pts[i]);
    const by = py(pts[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2)) : 0;
    touches = inside(ax + dx * t, ay + dy * t);
  }
  if (!touches) return null;
  if (pts.length === 1) return [];

  // 촘촘히 채우기
  const step = Math.max(0.4, reach / 3);
  const dense: InkPoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(px(b) - px(a), py(b) - py(a));
    const n = Math.floor(d / step);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      dense.push([round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t), round(a[2] + (b[2] - a[2]) * t)]);
    }
    dense.push(b);
  }

  // 원 밖의 이어진 점들 = 남는 조각
  const runs: InkPoint[][] = [];
  let run: InkPoint[] = [];
  for (const q of dense) {
    if (inside(px(q), py(q))) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(q);
    }
  }
  if (run.length) runs.push(run);
  const pieces = runs.filter((r2) => r2.length >= 2);

  const base: Stroke = { ...stroke };
  if (base.shape) {
    delete base.shape;
    base.fixedWidth = true;
  }
  return pieces.map((points, i) => ({ ...base, id: i === 0 ? stroke.id : newId(), points }));
}
