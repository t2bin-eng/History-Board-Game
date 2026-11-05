// 손으로 그린 획 → 도형 알아보기 (긋다가 떼지 않고 멈추면, SPEC 6장 "도형 보정").
// 모서리 찾기는 공개된 ShortStraw 방법(Wolin 외, 2008): 고른 간격으로 다시 찍은 점에서 앞뒤 몇 점 사이 거리("빨대")가
// 짧아지는 곳이 모서리다. 모서리 사이가 모두 곧으면 다각형, 아니면 타원 맞추기로 원·타원을 본다.
// 결과는 페이지 px 기준 (중심·크기·회전). 모르면 null → 그리던 쪽이 직선으로 바꾼다.

import type { ShapeKind } from "./types";

export type Pt = [number, number];

export interface ShapeGuess {
  kind: ShapeKind;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 도 */
  rot: number;
  pts?: [number, number][];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const deg = (rad: number) => (rad * 180) / Math.PI;

function pathLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

function bounds(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, diag: Math.hypot(maxX - minX, maxY - minY) };
}

/** 닫힌 길을 n개의 고른 간격 점으로 (마지막 점은 첫 점과 겹치지 않음) */
function resampleClosed(pts: Pt[], n: number): Pt[] {
  const loop = [...pts, pts[0]];
  const step = pathLength(loop) / n;
  const out: Pt[] = [loop[0]];
  let acc = 0;
  for (let i = 1; i < loop.length && out.length < n; i++) {
    let a = loop[i - 1];
    const b = loop[i];
    let d = dist(a, b);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(p);
      a = p;
      d = dist(a, b);
      acc = 0;
    }
    acc += d;
  }
  while (out.length < n) out.push(loop[loop.length - 1]);
  return out;
}

/** [1/4, 1/2, 1/4] 고르기 (열린 꺾은선, 끝점 유지) */
function smooth(pts: Pt[]): Pt[] {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
}

/** Ramer–Douglas–Peucker (열린 꺾은선) */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let best = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = lineDist(pts[i], a, b);
    if (d > best) {
      best = d;
      idx = i;
    }
  }
  if (best <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/** 점에서 선분까지 거리 */
function lineDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** 직선 위 점에서 부호 있는 거리 (왼쪽 +) */
function side(p: Pt, a: Pt, b: Pt): number {
  const l = dist(a, b) || 1;
  return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l;
}

/**
 * 획(페이지 px 점들)이 어떤 도형인지. 닫힌 모양(원·타원·삼각형·사각형·마름모·오각형·육각형·별·다각형)과
 * 화살표를 알아본다. 모르면 null.
 */
export function recognizeShape(input: Pt[]): ShapeGuess | null {
  const raw = input.filter((p, i) => i === 0 || dist(p, input[i - 1]) > 0.01);
  if (raw.length < 5) return null;
  // 손떨림은 먼저 고르게 (끝점은 그대로)
  const pts = smooth(smooth(raw));
  const box = bounds(pts);
  const D = box.diag;
  if (D < 16) return null;
  const L = pathLength(pts);

  // 끝이 시작 근처로 돌아왔는지 (시작점을 조금 지나쳐 그린 것도: 뒤쪽 40%에서 시작점에 가장 가까운 곳까지)
  let end = pts.length - 1;
  let gap = dist(pts[0], pts[end]);
  for (let i = Math.floor(pts.length * 0.6); i < pts.length; i++) {
    const d = dist(pts[0], pts[i]);
    if (d < gap) {
      gap = d;
      end = i;
    }
  }
  const closed = gap < Math.max(0.16 * D, 12) && L > 1.6 * D;
  if (!closed) return recognizeArrow(pts, D, L);
  return recognizeClosed(pts.slice(0, end + 1));
}

/** 한 번에 그린 화살표: 긴 줄기 끝에서 꺾여 돌아오는 짧은 날개 (양쪽으로) */
function recognizeArrow(pts: Pt[], D: number, L: number): ShapeGuess | null {
  const simp = rdp(pts, 0.04 * D);
  if (simp.length < 4) return null;
  const tail = simp[0];
  const tip = simp[1];
  const shaft = dist(tail, tip);
  if (shaft < 0.45 * L || shaft < 30) return null;
  const tipIndex = pts.findIndex((p) => p === tip);
  const head = pts.slice(tipIndex + 1);
  if (!head.length || head.some((p) => dist(p, tip) > 0.5 * shaft)) return null;
  const sides = head.map((p) => side(p, tail, tip));
  const behind = head.filter((p) => (p[0] - tip[0]) * (tail[0] - tip[0]) + (p[1] - tip[1]) * (tail[1] - tip[1]) > 0);
  const wingMin = 0.06 * shaft;
  if (Math.max(...sides) < wingMin || Math.min(...sides) > -wingMin || behind.length < head.length * 0.5) return null;
  return {
    kind: "arrow",
    cx: (tail[0] + tip[0]) / 2,
    cy: (tail[1] + tip[1]) / 2,
    w: shaft,
    h: 0,
    rot: deg(Math.atan2(tip[1] - tail[1], tip[0] - tail[0])),
  };
}

const N = 96;
const STRAW = 3;

function recognizeClosed(loopPts: Pt[]): ShapeGuess | null {
  const R = resampleClosed(loopPts, N);
  const box = bounds(R);
  const D = box.diag;

  // ── ShortStraw 모서리 ──
  const at = (i: number) => R[((i % N) + N) % N];
  const straws = R.map((_, i) => dist(at(i - STRAW), at(i + STRAW)));
  const median = [...straws].sort((a, b) => a - b)[N >> 1];
  let corners: number[] = [];
  for (let i = 0; i < N; i++) {
    if (straws[i] >= median * 0.95) continue;
    let isMin = true;
    for (let k = -STRAW; k <= STRAW; k++) if (k && straws[((i + k) % N + N) % N] < straws[i]) isMin = false;
    if (isMin) corners.push(i);
  }
  // 모서리 a → b 사이 점들이 곧은 선에서 벗어난 정도 (가장 먼 거리 / 직선 길이)
  const bend = (a: number, b: number) => {
    const A = at(a);
    const B = at(b);
    const steps = ((b - a) % N + N) % N || N;
    let m = 0;
    for (let k = 1; k < steps; k++) m = Math.max(m, lineDist(at(a + k), A, B));
    return m / Math.max(1e-6, dist(A, B));
  };
  // 곧게 이어지는 모서리(가운데가 거의 직선)는 뺀다
  let changed = true;
  while (changed && corners.length > 2) {
    changed = false;
    for (let k = 0; k < corners.length; k++) {
      const prev = corners[(k - 1 + corners.length) % corners.length];
      const next = corners[(k + 1) % corners.length];
      if (bend(prev, next) < 0.045) {
        corners.splice(k, 1);
        changed = true;
        break;
      }
    }
  }
  corners = [...new Set(corners)].sort((a, b) => a - b);
  const V = corners.map(at);
  const k = V.length;
  const polyValid = k >= 3 && corners.every((c, j) => bend(c, corners[(j + 1) % k]) < 0.08);

  // ── 맞춤 오차 (D 대비) ──
  const ell = fitEllipse(R);
  const ellErr = R.reduce((sum, p) => sum + ellipseDist(p, ell), 0) / N / D;
  const polyErr = polyValid ? R.reduce((sum, p) => sum + Math.min(...V.map((v, j) => lineDist(p, v, V[(j + 1) % k]))), 0) / N / D : Infinity;

  if (polyValid && polyErr <= ellErr * 0.85) return classifyPolygon(V);
  if (ellErr < 0.05) return ellipseGuess(ell);
  if (polyValid && polyErr < 0.04) return classifyPolygon(V);
  return null;
}

interface Ellipse {
  cx: number;
  cy: number;
  a: number;
  b: number;
  /** 긴 축 방향 (라디안) */
  t: number;
}

/** 주성분 방향으로 맞춘 타원 (축 길이는 그 방향의 폭) */
function fitEllipse(R: Pt[]): Ellipse {
  const cx = R.reduce((s, p) => s + p[0], 0) / R.length;
  const cy = R.reduce((s, p) => s + p[1], 0) / R.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of R) {
    sxx += (x - cx) ** 2;
    syy += (y - cy) ** 2;
    sxy += (x - cx) * (y - cy);
  }
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [x, y] of R) {
    const u = (x - cx) * cos + (y - cy) * sin;
    const v = -(x - cx) * sin + (y - cy) * cos;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const mu = (minU + maxU) / 2;
  const mv = (minV + maxV) / 2;
  return {
    cx: cx + mu * cos - mv * sin,
    cy: cy + mu * sin + mv * cos,
    a: Math.max(1, (maxU - minU) / 2),
    b: Math.max(1, (maxV - minV) / 2),
    t,
  };
}

function ellipseDist(p: Pt, e: Ellipse): number {
  const dx = p[0] - e.cx;
  const dy = p[1] - e.cy;
  const u = dx * Math.cos(e.t) + dy * Math.sin(e.t);
  const v = -dx * Math.sin(e.t) + dy * Math.cos(e.t);
  const r = Math.hypot(u, v);
  if (r < 1e-6) return Math.min(e.a, e.b);
  const phi = Math.atan2(v / e.b, u / e.a);
  return Math.abs(r - Math.hypot(e.a * Math.cos(phi), e.b * Math.sin(phi)));
}

function ellipseGuess(e: Ellipse): ShapeGuess {
  let w = e.a * 2;
  let h = e.b * 2;
  let rot = deg(e.t);
  // 거의 동그라면 원, 축이 가로·세로에 가까우면 바로 세운다
  if (Math.abs(w - h) < 0.12 * Math.max(w, h)) {
    w = h = (w + h) / 2;
    rot = 0;
  }
  rot = snapRot(rot, 90, 10);
  if (rot === 90 || rot === -90) {
    [w, h] = [h, w];
    rot = 0;
  }
  return { kind: "ellipse", cx: e.cx, cy: e.cy, w, h, rot };
}

/** step 도의 배수 근처(tol 이내)면 그 배수로, (-180, 180] */
function snapRot(r: number, step: number, tol: number): number {
  let a = ((r % 360) + 540) % 360 - 180;
  const near = Math.round(a / step) * step;
  if (Math.abs(a - near) <= tol) a = near;
  if (a <= -180) a += 360;
  return a === -0 ? 0 : a;
}

/** 꼭짓점의 안쪽 각 (0~180도) */
function angleAt(V: Pt[], i: number): number {
  const n = V.length;
  const p = V[(i - 1 + n) % n];
  const c = V[i];
  const q = V[(i + 1) % n];
  const a1 = Math.atan2(p[1] - c[1], p[0] - c[0]);
  const a2 = Math.atan2(q[1] - c[1], q[0] - c[0]);
  let d = Math.abs(deg(a1 - a2));
  if (d > 180) d = 360 - d;
  return d;
}

function centroid(V: Pt[]): Pt {
  return [V.reduce((s, p) => s + p[0], 0) / V.length, V.reduce((s, p) => s + p[1], 0) / V.length];
}

/** 값들이 고른 정도 (표준편차 / 평균) */
function spread(values: number[]): number {
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
  return sd / (m || 1);
}

function classifyPolygon(V: Pt[]): ShapeGuess {
  const k = V.length;
  const angles = V.map((_, i) => angleAt(V, i));
  const sides = V.map((v, i) => dist(v, V[(i + 1) % k]));
  const c = centroid(V);

  if (k === 4) {
    // 마름모: 두 대각선이 가로·세로
    const d1 = deg(Math.atan2(V[2][1] - V[0][1], V[2][0] - V[0][0]));
    const d2 = deg(Math.atan2(V[3][1] - V[1][1], V[3][0] - V[1][0]));
    const axis = (d: number) => {
      const off = (((d % 90) + 90) % 90);
      return Math.min(off, 90 - off);
    };
    if (axis(d1) < 12 && axis(d2) < 12) {
      const b = bounds(V);
      return { kind: "diamond", cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.w, h: b.h, rot: 0 };
    }
  }
  if (k === 4 && angles.every((a) => Math.abs(a - 90) < 13)) {
    // 사각형: 네 변 방향의 평균(90도 단위)으로 기울기
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 4; i++) {
      const t = Math.atan2(V[(i + 1) % 4][1] - V[i][1], V[(i + 1) % 4][0] - V[i][0]) * 4;
      sx += Math.cos(t);
      sy += Math.sin(t);
    }
    const rot = snapRot(deg(Math.atan2(sy, sx) / 4), 90, 8);
    const { cx, cy, w, h } = rotatedExtent(V, rot);
    const square = Math.abs(w - h) < 0.1 * Math.max(w, h);
    return { kind: "rect", cx, cy, w: square ? (w + h) / 2 : w, h: square ? (w + h) / 2 : h, rot };
  }
  if ((k === 5 && angles.every((a) => a < 72)) || (k === 10 && isStar10(V, c))) {
    return regularGuess("star", V, c, 5);
  }
  if (k === 5 && spread(sides) < 0.22 && angles.every((a) => Math.abs(a - 108) < 20)) return regularGuess("pentagon", V, c, 5);
  if (k === 6 && spread(sides) < 0.22 && angles.every((a) => Math.abs(a - 120) < 20)) return regularGuess("hexagon", V, c, 6);
  if (k === 3) {
    const S = snapEdges(V);
    const b = bounds(S);
    // 밑변이 가로이고 꼭대기가 가운데면 이등변삼각형
    for (let i = 0; i < 3; i++) {
      const p = S[i];
      const q = S[(i + 1) % 3];
      const apex = S[(i + 2) % 3];
      if (Math.abs(p[1] - q[1]) > 0.5 && Math.abs(p[1] - q[1]) > 0.02 * b.w) continue;
      const mid = (p[0] + q[0]) / 2;
      if (Math.abs(apex[0] - mid) < 0.1 * Math.abs(q[0] - p[0])) {
        return { kind: "triangle", cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.w, h: b.h, rot: apex[1] > p[1] ? 180 : 0 };
      }
    }
    return polygonGuess(S);
  }
  return polygonGuess(snapEdges(V));
}

/** 꼭짓점 10개가 멀고 가까움을 번갈아 하면 별 */
function isStar10(V: Pt[], c: Pt): boolean {
  const r = V.map((v) => dist(v, c));
  const odd = r.filter((_, i) => i % 2);
  const even = r.filter((_, i) => i % 2 === 0);
  const [outer, inner] = Math.min(...odd) > Math.max(...even) ? [odd, even] : [even, odd];
  return Math.min(...outer) > Math.max(...inner) * 1.4;
}

/** 정다각형·별: 바깥 꼭짓점의 평균 거리와 가장 위쪽 꼭짓점 방향으로 */
function regularGuess(kind: "star" | "pentagon" | "hexagon", V: Pt[], c: Pt, n: number): ShapeGuess {
  const outer = kind === "star" && V.length === 10 ? farthestHalf(V, c) : V;
  const center = kind === "star" && V.length === 5 ? c : centroid(outer);
  const R = outer.reduce((s, v) => s + dist(v, center), 0) / outer.length;
  // 기준 꼭짓점: 별·오각형은 위(-90도), 육각형은 오른쪽(0도)
  const base = kind === "hexagon" ? 0 : -90;
  const step = 360 / n;
  // 꼭짓점 방향들의 원형 평균 (n배 해서 step이 한 바퀴가 되게)
  let sx = 0;
  let sy = 0;
  for (const v of outer) {
    const a = (Math.atan2(v[1] - center[1], v[0] - center[0]) - (base * Math.PI) / 180) * n;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  const rot = snapRot(deg(Math.atan2(sy, sx) / n), step, 10);
  // 단위 모양(상자에 꽉 차게)의 크기·중심 어긋남
  const [wr, hr, dy] = kind === "hexagon" ? [2, Math.sqrt(3), 0] : [2 * Math.sin((72 * Math.PI) / 180), 1 + Math.cos((36 * Math.PI) / 180), (-1 + Math.cos((36 * Math.PI) / 180)) / 2];
  const t = (rot * Math.PI) / 180;
  return {
    kind,
    cx: center[0] - Math.sin(t) * dy * R,
    cy: center[1] + Math.cos(t) * dy * R,
    w: wr * R,
    h: hr * R,
    rot: rot === step || rot === -step ? 0 : rot,
  };
}

function farthestHalf(V: Pt[], c: Pt): Pt[] {
  const odd = V.filter((_, i) => i % 2);
  const even = V.filter((_, i) => i % 2 === 0);
  const avg = (a: Pt[]) => a.reduce((s, v) => s + dist(v, c), 0) / a.length;
  return avg(odd) > avg(even) ? odd : even;
}

/** 회전 rot(도)인 상자로 본 꼭짓점들의 중심·크기 */
function rotatedExtent(V: Pt[], rot: number) {
  const t = (rot * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const u = V.map((p) => p[0] * cos + p[1] * sin);
  const v = V.map((p) => -p[0] * sin + p[1] * cos);
  const mu = (Math.min(...u) + Math.max(...u)) / 2;
  const mv = (Math.min(...v) + Math.max(...v)) / 2;
  return { cx: mu * cos - mv * sin, cy: mu * sin + mv * cos, w: Math.max(...u) - Math.min(...u), h: Math.max(...v) - Math.min(...v) };
}

/** 가로·세로에 가까운(±7도) 변은 딱 맞추고, 이웃 변과 만나는 점으로 꼭짓점을 다시 */
function snapEdges(V: Pt[]): Pt[] {
  const n = V.length;
  const lines = V.map((a, i) => {
    const b = V[(i + 1) % n];
    const ang = deg(Math.atan2(b[1] - a[1], b[0] - a[0]));
    const snapped = snapRot(ang, 90, 7);
    const t = (snapped * Math.PI) / 180;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return { p: mid, d: [Math.cos(t), Math.sin(t)] as Pt };
  });
  return V.map((v, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const cross = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(cross) < 0.05) return v;
    const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / cross;
    const x: Pt = [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t];
    // 너무 멀리 가면(거의 평행) 원래 점
    return dist(x, v) > 0.3 * Math.max(...V.map((u) => dist(u, v))) ? v : x;
  });
}

function polygonGuess(V: Pt[]): ShapeGuess {
  const b = bounds(V);
  const w = Math.max(1, b.w);
  const h = Math.max(1, b.h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    kind: "polygon",
    cx,
    cy,
    w,
    h,
    rot: 0,
    pts: V.map(([x, y]) => [Math.round(((x - cx) / w) * 10000) / 10000, Math.round(((y - cy) / h) * 10000) / 10000]),
  };
}
