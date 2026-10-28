import type { PageSize } from "./geometry";
import type { InkPoint } from "./types";

// 직선 보정·필기 보정 (SPEC 6장 입력 규칙). 모든 계산은 화면 px(가로·세로 같은 비율)로 하고 0~1 비율로 돌려준다.

interface P {
  x: number;
  y: number;
  p: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t });
const round = (v: number, k = 10000) => Math.round(v * k) / k;

function toPx(points: InkPoint[], page: PageSize): P[] {
  return points.map(([x, y, p]) => ({ x: x * page.width, y: y * page.height, p }));
}

function toRatio(points: P[], page: PageSize): InkPoint[] {
  return points.map((q) => [round(q.x / page.width), round(q.y / page.height), round(q.p, 1000)]);
}

export function pathLengthPx(points: InkPoint[], page: PageSize): number {
  const pts = toPx(points, page);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

// ── 직선 보정 ─────────────────────────────────────────────

/** 끝점을 시작점 기준 수평·수직·45°에 가까우면(±snapDeg) 붙인다 (길이는 그대로). 화면 px */
export function snapLineEnd(sx: number, sy: number, ex: number, ey: number, snapDeg = 4): { x: number; y: number } {
  const len = Math.hypot(ex - sx, ey - sy);
  if (len < 1) return { x: ex, y: ey };
  const deg = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
  const near = Math.round(deg / 45) * 45;
  if (Math.abs(deg - near) > snapDeg) return { x: ex, y: ey };
  const t = (near * Math.PI) / 180;
  return { x: sx + Math.cos(t) * len, y: sy + Math.sin(t) * len };
}

/** 시작점에서 끝점까지 고른 간격의 직선 (필압은 하나로) */
export function linePoints(start: InkPoint, end: InkPoint, pressure: number, page: PageSize, snap = true): InkPoint[] {
  const sx = start[0] * page.width;
  const sy = start[1] * page.height;
  const e = snap ? snapLineEnd(sx, sy, end[0] * page.width, end[1] * page.height) : { x: end[0] * page.width, y: end[1] * page.height };
  const len = Math.hypot(e.x - sx, e.y - sy);
  const n = Math.max(2, Math.ceil(len / 3) + 1);
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push({ x: sx + (e.x - sx) * t, y: sy + (e.y - sy) * t, p: pressure });
  }
  return toRatio(out, page);
}

/** 획의 평균 필압 (직선으로 바꿀 때 굵기) */
export function averagePressure(points: InkPoint[]): number {
  if (!points.length) return 0.5;
  return points.reduce((s, q) => s + q[2], 0) / points.length;
}

// ── 필기 보정 ─────────────────────────────────────────────

/** 호 길이로 고르게 다시 찍는다 (끝점은 그대로) */
function resample(pts: P[], spacing: number): P[] {
  const out: P[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let seg = dist(a, b);
    while (carry + seg >= spacing && seg > 0) {
      const q = lerp(a, b, (spacing - carry) / seg);
      out.push(q);
      a = q;
      seg = dist(a, b);
      carry = 0;
    }
    carry += seg;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.35) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

/** b에서 꺾인 각도 (도, 0 = 곧게 지나감) */
function turn(a: P, b: P, c: P): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (!lu || !lv) return 0;
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 꺾인 곳(threshold° 넘게) 위치: 처음·끝 포함, 가까운 것은 하나로 */
function findCorners(pts: P[], k: number, threshold: number): number[] {
  const n = pts.length;
  const angle = new Array<number>(n).fill(0);
  for (let i = k; i < n - k; i++) angle[i] = turn(pts[i - k], pts[i], pts[i + k]);
  const out = [0];
  for (let i = k; i < n - k; i++) {
    if (angle[i] < threshold) continue;
    let isMax = true;
    for (let j = Math.max(k, i - k); j <= Math.min(n - k - 1, i + k); j++) {
      if (angle[j] > angle[i] || (angle[j] === angle[i] && j < i)) {
        isMax = false;
        break;
      }
    }
    if (isMax && i - out[out.length - 1] >= k && n - 1 - i >= k) out.push(i);
  }
  out.push(n - 1);
  return out;
}

function maxDeviation(pts: P[], a: number, b: number): number {
  const s = pts[a];
  const e = pts[b];
  const len = dist(s, e);
  let max = 0;
  for (let i = a + 1; i < b; i++) {
    const d = len < 1e-6 ? dist(pts[i], s) : Math.abs((e.x - s.x) * (s.y - pts[i].y) - (s.x - pts[i].x) * (e.y - s.y)) / len;
    if (d > max) max = d;
  }
  return max;
}

export interface BeautifyOptions {
  /** 거의 곧다고 볼 휨 (직선 길이 대비) */
  straightTolerance?: number;
  /** 수평·수직으로 맞출 기울기 (도) */
  axisSnapDeg?: number;
  /** 꺾였다고 볼 각도 (도) */
  cornerDeg?: number;
}

/**
 * 글씨를 반듯하게: 고르게 다시 찍기 → 꺾인 곳은 그대로, 그 사이 거의 곧은 부분은 직선(수평·수직 가까우면 맞춤),
 * 굽은 부분은 부드럽게, 필압은 고르게. 짧은 획은 그대로 돌려준다. widthPx는 펜 굵기(px).
 */
export function beautifyStroke(points: InkPoint[], page: PageSize, widthPx: number, opts: BeautifyOptions = {}): InkPoint[] {
  const { straightTolerance = 0.06, axisSnapDeg = 6, cornerDeg = 45 } = opts;
  if (points.length < 4) return points;
  const raw = toPx(points, page);
  let len = 0;
  for (let i = 1; i < raw.length; i++) len += dist(raw[i - 1], raw[i]);
  if (len < Math.max(8, widthPx * 3)) return points;

  const spacing = Math.max(1.2, Math.min(widthPx * 0.6, len / 12));
  const pts = resample(raw, spacing);
  if (pts.length < 5) return points;
  const k = Math.max(2, Math.round(Math.min(14, Math.max(5, len * 0.08)) / spacing));
  const anchors = findCorners(pts, k, cornerDeg);

  // 필압: 이웃 평균으로 고르게 (뭉치거나 갑자기 가늘어지지 않게)
  const pressure = pts.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(pts.length - 1, i + 3); j++) {
      s += pts[j].p;
      c++;
    }
    return s / c;
  });

  const out: P[] = [];
  let ox = 0;
  let oy = 0;
  for (let s = 0; s < anchors.length - 1; s++) {
    const a = anchors[s];
    const b = anchors[s + 1];
    const start = s === 0 ? { x: pts[a].x, y: pts[a].y } : { x: out[out.length - 1].x, y: out[out.length - 1].y };
    const endOrig = { x: pts[b].x + ox, y: pts[b].y + oy };
    const chord = dist(start, endOrig);
    const seg: P[] = [];
    if (chord >= 4 && maxDeviation(pts, a, b) <= Math.max(widthPx * 0.8, chord * straightTolerance)) {
      // 곧은 부분: 직선, 수평·수직에 가까우면 맞추고 뒷부분도 같이 옮긴다
      let end = endOrig;
      if (chord >= Math.max(10, widthPx * 4)) {
        const deg = (Math.atan2(endOrig.y - start.y, endOrig.x - start.x) * 180) / Math.PI;
        const near = Math.round(deg / 90) * 90;
        if (Math.abs(deg - near) <= axisSnapDeg) {
          const t = (near * Math.PI) / 180;
          end = { x: start.x + Math.cos(t) * chord, y: start.y + Math.sin(t) * chord };
        }
      }
      for (let i = a; i <= b; i++) {
        const t = (i - a) / Math.max(1, b - a);
        seg.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, p: pressure[i] });
      }
      ox = end.x - pts[b].x;
      oy = end.y - pts[b].y;
    } else {
      // 굽은 부분: 양 끝은 두고 안쪽을 부드럽게
      for (let i = a; i <= b; i++) seg.push({ x: pts[i].x + ox, y: pts[i].y + oy, p: pressure[i] });
      seg[0] = { ...seg[0], x: start.x, y: start.y };
      for (let it = 0; it < 3; it++) {
        const prev = seg.map((q) => ({ ...q }));
        for (let i = 1; i < seg.length - 1; i++) {
          seg[i].x = prev[i - 1].x * 0.25 + prev[i].x * 0.5 + prev[i + 1].x * 0.25;
          seg[i].y = prev[i - 1].y * 0.25 + prev[i].y * 0.5 + prev[i + 1].y * 0.25;
        }
      }
    }
    // 이음점은 한 번만
    out.push(...(s === 0 ? seg : seg.slice(1)));
  }
  return toRatio(out, page);
}
