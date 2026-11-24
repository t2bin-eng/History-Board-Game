import { strokeHitsCircle, unitsToPx, type PageSize } from "./geometry";
import { hasShape, isLineShape, lineEnds, lineSpec, withShape } from "./shapes";
import type { InkPoint, InkTool, ShapeSpec, Stroke } from "./types";

// 올가미 선택 (v0.43, SPEC 5장 "올가미로 옮기고 키우고 돌린 획" · 6장 "올가미"):
// 펜으로 둘러싼 획을 골라 틀(중심·크기·회전)로 옮기고 키우고 돌린다. 틀이 바뀐 만큼의 아핀 변환을 획에 그대로 쓴다.

export type Pt = [number, number];

/** 고른 것의 틀 (페이지 px): 중심·크기·회전(도, 시계 방향) */
export interface SelFrame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

/** 아핀 변환: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Affine = [number, number, number, number, number, number];

/** 획의 이만큼(길이 비율) 넘게 올가미 안에 들면 고른다 */
export const LASSO_INSIDE = 0.5;
/** 올가미가 이만큼(화면 px)보다 짧으면 톡 누름: 그 자리의 획 하나 */
export const LASSO_TAP_PX = 8;
/** 틀이 이보다 작아지지 않게 (페이지 px) */
export const SEL_MIN_PX = 12;
/** 틀 여백 (페이지 px): 고른 획 둘레를 조금 넉넉히 */
export const SEL_PAD = 8;

/** 점이 다각형 안에 있는지 (짝수-홀수 규칙, 마지막 점과 첫 점은 이어진 것으로) */
export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 획이 올가미 안에 든 비율 (획 길이 기준, 점 하나면 그 점) */
export function insideRatio(stroke: Stroke, poly: Pt[], page: PageSize, step = 3): number {
  const pts = stroke.points.map(([x, y]): Pt => [x * page.width, y * page.height]);
  if (!pts.length) return 0;
  if (pts.length === 1) return pointInPolygon(pts[0][0], pts[0][1], poly) ? 1 : 0;
  let total = 0;
  let inside = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      total += len / n;
      if (pointInPolygon(ax + (bx - ax) * t, ay + (by - ay) * t, poly)) inside += len / n;
    }
  }
  // 한자리에 겹친 점들(길이 0)이면 첫 점으로
  if (total === 0) return pointInPolygon(pts[0][0], pts[0][1], poly) ? 1 : 0;
  return inside / total;
}

/** 올가미(페이지 px)로 고른 획 id (그린 순서대로) */
export function lassoSelect(strokes: Stroke[], poly: Pt[], page: PageSize): string[] {
  if (poly.length < 3) return [];
  // 다각형 밖 상자의 획은 건너뛴다 (빠르게)
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const out: string[] = [];
  for (const s of strokes) {
    const b = strokesBounds([s], page, 0);
    if (!b || b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1) continue;
    if (insideRatio(s, poly, page) >= LASSO_INSIDE) out.push(s.id);
  }
  return out;
}

/** 이 자리(페이지 px)의 맨 위 획 (톡 눌러 고르기), 여유 reach px */
export function strokeAtPx(strokes: Stroke[], x: number, y: number, page: PageSize, reach: number): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) if (strokeHitsCircle(strokes[i], x, y, reach, page)) return strokes[i];
  return null;
}

/** 획들이 차지하는 상자 (페이지 px, 굵기 절반 + pad 포함) */
export function strokesBounds(strokes: Stroke[], page: PageSize, pad = SEL_PAD): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes) {
    const r = unitsToPx(s.width, page) / 2;
    for (const [x, y] of s.points) {
      const px = x * page.width;
      const py = y * page.height;
      x0 = Math.min(x0, px - r);
      y0 = Math.min(y0, py - r);
      x1 = Math.max(x1, px + r);
      y1 = Math.max(y1, py + r);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

/** 고른 획을 감싸는 틀 (돌리지 않은) */
export function frameOf(strokes: Stroke[], page: PageSize): SelFrame | null {
  const b = strokesBounds(strokes, page);
  if (!b) return null;
  const w = Math.max(SEL_MIN_PX, b.x1 - b.x0);
  const h = Math.max(SEL_MIN_PX, b.y1 - b.y0);
  return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w, h, rot: 0 };
}

// ── 아핀 변환 ──

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function applyAffine(m: Affine, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** m2 ∘ m1 (m1 먼저) */
export function compose(m2: Affine, m1: Affine): Affine {
  return [
    m2[0] * m1[0] + m2[2] * m1[1],
    m2[1] * m1[0] + m2[3] * m1[1],
    m2[0] * m1[2] + m2[2] * m1[3],
    m2[1] * m1[2] + m2[3] * m1[3],
    m2[0] * m1[4] + m2[2] * m1[5] + m2[4],
    m2[1] * m1[4] + m2[3] * m1[5] + m2[5],
  ];
}

export function translate(dx: number, dy: number): Affine {
  return [1, 0, 0, 1, dx, dy];
}

export function scaleAbout(k: number, x: number, y: number): Affine {
  return [k, 0, 0, k, x - k * x, y - k * y];
}

/** 틀 f0 안의 자리를 틀 f1 안의 같은 자리로 (가로·세로 비율대로) */
export function frameAffine(f0: SelFrame, f1: SelFrame): Affine {
  const r0 = (f0.rot * Math.PI) / 180;
  const r1 = (f1.rot * Math.PI) / 180;
  const sx = f1.w / Math.max(1e-6, f0.w);
  const sy = f1.h / Math.max(1e-6, f0.h);
  const c0 = Math.cos(r0);
  const s0 = Math.sin(r0);
  const c1 = Math.cos(r1);
  const s1 = Math.sin(r1);
  // M = R1 · S · R0⁻¹
  const a = c1 * sx * c0 + -s1 * sy * -s0;
  const c = c1 * sx * s0 + -s1 * sy * c0;
  const b = s1 * sx * c0 + c1 * sy * -s0;
  const d = s1 * sx * s0 + c1 * sy * c0;
  return [a, b, c, d, f1.cx - (a * f0.cx + c * f0.cy), f1.cy - (b * f0.cx + d * f0.cy)];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 획들에 변환을 쓴다 (페이지 px 기준). from 페이지의 0~1 좌표 → to 페이지의 0~1 좌표 (보통 같은 페이지).
 * 굵기는 넓이 배율의 제곱근만큼, 도형은 다시 만든다.
 */
export function transformStrokes(strokes: Stroke[], m: Affine, from: PageSize, to: PageSize = from): Stroke[] {
  const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  return strokes.map((s) => {
    const width = round2(Math.min(200, Math.max(0.3, (s.width * k * from.width) / to.width)));
    if (hasShape(s)) return withShape({ ...s, width }, transformShape(s.shape, m, from, to), to);
    const points = s.points.map(([x, y, p]): InkPoint => {
      const [nx, ny] = applyAffine(m, x * from.width, y * from.height);
      return [round5(nx / to.width), round5(ny / to.height), p];
    });
    return { ...s, width, points };
  });
}

function transformShape(spec: ShapeSpec, m: Affine, from: PageSize, to: PageSize): ShapeSpec {
  if (isLineShape(spec.kind)) {
    const [a, b] = lineEnds(spec, from).map(([x, y]) => applyAffine(m, x, y));
    const next = lineSpec(spec.kind, a, b, to);
    return { ...next, ...(spec.curve ? { curve: spec.curve } : {}), ...(spec.head ? { head: spec.head } : {}) };
  }
  const [cx, cy] = applyAffine(m, spec.cx * from.width, spec.cy * from.height);
  const rad = (spec.rot * Math.PI) / 180;
  // 도형의 가로축·세로축이 변환 뒤 얼마나 늘고 어디로 돌았는지
  const ux = m[0] * Math.cos(rad) + m[2] * Math.sin(rad);
  const uy = m[1] * Math.cos(rad) + m[3] * Math.sin(rad);
  const vx = m[0] * -Math.sin(rad) + m[2] * Math.cos(rad);
  const vy = m[1] * -Math.sin(rad) + m[3] * Math.cos(rad);
  const kw = Math.hypot(ux, uy);
  const kh = Math.hypot(vx, vy);
  return {
    ...spec,
    cx: cx / to.width,
    cy: cy / to.height,
    w: (spec.w * from.width * kw) / to.width,
    h: (spec.h * from.width * kh) / to.width,
    rot: Math.round(((Math.atan2(uy, ux) * 180) / Math.PI) * 100) / 100,
  };
}

/** 고른 획을 바꾼 획으로 갈아 끼운 전체 목록 (순서 그대로) */
export function replaceStrokes(all: Stroke[], changed: Stroke[]): Stroke[] {
  const byId = new Map(changed.map((s) => [s.id, s]));
  return all.map((s) => byId.get(s.id) ?? s);
}

/** 순서 바꾸기: 고른 획을 맨 앞(마지막에 그림)이나 맨 뒤(처음에 그림)로. 고른 것끼리의 순서는 그대로 */
export function reorderStrokes(all: Stroke[], ids: readonly string[], to: "front" | "back"): Stroke[] {
  const set = new Set(ids);
  const picked = all.filter((s) => set.has(s.id));
  const rest = all.filter((s) => !set.has(s.id));
  return to === "front" ? [...rest, ...picked] : [...picked, ...rest];
}

/** 색을 바꿀 도구: 펜 필기가 있으면 펜만, 형광펜만 골랐으면 형광펜 */
export function recolorTool(strokes: Stroke[]): InkTool {
  return strokes.some((s) => s.tool === "pen") ? "pen" : "highlighter";
}

/** 색 바꾸기 (그 도구의 획만) */
export function recolorStrokes(strokes: Stroke[], color: string, page: PageSize): Stroke[] {
  const tool = recolorTool(strokes);
  return strokes.map((s) => (s.tool !== tool || s.color === color ? s : hasShape(s) ? withShape({ ...s, color }, s.shape, page) : { ...s, color }));
}

/** 굵기 바꾸기 (배율 k, 도구마다 범위 안) */
export function rewidthStrokes(strokes: Stroke[], k: number, page: PageSize): Stroke[] {
  return strokes.map((s) => {
    const [lo, hi] = s.tool === "pen" ? [0.5, 60] : [4, 80];
    const width = round2(Math.min(hi, Math.max(lo, s.width * k)));
    if (width === s.width) return s;
    return hasShape(s) ? withShape({ ...s, width }, s.shape, page) : { ...s, width };
  });
}

// ── 틀 고치기 (손잡이) ──

export type SelHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

/** 손잡이로 틀 크기 바꾸기: 모서리는 비율 그대로(맞은편 모서리 고정), 변은 그 방향만(맞은편 변 고정) */
export function resizeFrame(f0: SelFrame, handle: SelHandle, p: Pt): SelFrame {
  const rad = (f0.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p[0] - f0.cx;
  const dy = p[1] - f0.cy;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  let w = f0.w;
  let h = f0.h;
  let ox = 0;
  let oy = 0;
  if (sx && sy) {
    // 대각선에 비춘 만큼 같은 배율로 (글씨 모양 그대로)
    const fx = (-sx * f0.w) / 2;
    const fy = (-sy * f0.h) / 2;
    const k0 = ((lx - fx) * sx * f0.w + (ly - fy) * sy * f0.h) / (f0.w * f0.w + f0.h * f0.h);
    const k = Math.max(SEL_MIN_PX / Math.min(f0.w, f0.h), k0);
    w = f0.w * k;
    h = f0.h * k;
    ox = fx + (sx * w) / 2;
    oy = fy + (sy * h) / 2;
  } else if (sx) {
    const fixed = (-sx * f0.w) / 2;
    w = Math.max(SEL_MIN_PX, (lx - fixed) * sx);
    ox = fixed + (sx * w) / 2;
  } else {
    const fixed = (-sy * f0.h) / 2;
    h = Math.max(SEL_MIN_PX, (ly - fixed) * sy);
    oy = fixed + (sy * h) / 2;
  }
  return { cx: f0.cx + ox * cos - oy * sin, cy: f0.cy + ox * sin + oy * cos, w, h, rot: f0.rot };
}

/** 위 손잡이로 돌리기: 가운데에서 펜 쪽이 위가 되게 (15° 배수 ±4°에 붙음) */
export function rotateFrame(f0: SelFrame, p: Pt, snap: (deg: number) => number): SelFrame {
  const deg = (Math.atan2(p[1] - f0.cy, p[0] - f0.cx) * 180) / Math.PI + 90;
  return { ...f0, rot: snap(deg) };
}

// ── 복사·붙이기 ──

/** 붙일 때의 변환: 복사한 페이지 → 붙일 페이지 (가로 기준 같은 크기), at(페이지 px)이면 고른 것의 가운데를 거기에 */
export function pasteAffine(strokes: Stroke[], from: PageSize, to: PageSize, at: Pt | null, nudge: boolean): Affine {
  const k = to.width / from.width;
  let m = scaleAbout(k, 0, 0);
  const b = strokesBounds(strokes, from, 0);
  if (at && b) {
    const [cx, cy] = applyAffine(m, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    m = compose(translate(at[0] - cx, at[1] - cy), m);
  } else if (nudge) {
    const d = to.width * 0.03;
    m = compose(translate(d, d), m);
  }
  return m;
}
