import { getStroke, getStrokeOutlinePoints, getStrokePoints, type StrokeOptions } from "perfect-freehand";
import { hasShape, shapeDistance, shapeStrokePath } from "./shapes";
import { SMOOTH_V2, smoothPoints } from "./smoothing";
import { PAGE_UNITS, type InkPoint, type InkTool, type PenNib, type Stroke } from "./types";

export interface PageSize {
  width: number;
  height: number;
}

/** 페이지 단위 굵기를 CSS 픽셀로 */
export function unitsToPx(units: number, page: PageSize): number {
  return (units * page.width) / PAGE_UNITS;
}

/** getStrokePoints가 처음 이만큼(px)의 점을 건너뛴다 — 사실상 건너뛰지 않음 */
const NO_MIN_LENGTH = 0.01;

/** smooth: 2 획(v0.32)은 점을 미리 다듬어 두므로 streamline(펜 끝을 늦게 따라감)을 낮게 */
const STREAMLINE_V2 = 0.12;

export function strokeOptions(
  tool: InkTool,
  sizePx: number,
  simulatePressure: boolean,
  last: boolean,
  smoothed = false,
  fixedWidth = false,
  nib?: PenNib,
  lengthPx = 0,
): StrokeOptions {
  if (tool === "highlighter") {
    return {
      size: sizePx,
      thinning: 0,
      smoothing: 0.5,
      streamline: smoothed ? STREAMLINE_V2 : 0.3,
      simulatePressure: false,
      last,
    };
  }
  const streamline = smoothed ? STREAMLINE_V2 : 0.32;
  const pressure = fixedWidth ? false : simulatePressure;
  if (nib === "fountain") {
    // 만년필 (v0.41): 필압에 더 크게 반응하고, 시작은 짧게·끝은 길게 가늘어진다 (펜을 떼며 잉크가 빠지듯)
    return {
      size: sizePx,
      thinning: fixedWidth ? 0 : 0.75,
      smoothing: 0.6,
      streamline,
      simulatePressure: pressure,
      start: { taper: Math.min(sizePx * 1.5, lengthPx * 0.2), cap: true },
      end: { taper: Math.min(sizePx * 4, lengthPx * 0.35), cap: true },
      last,
    };
  }
  if (nib === "pencil") {
    // 연필 (v0.41): 조금 가늘고 필압 반응은 약하게. 결은 칠할 때 (inkPaint)
    return { size: sizePx * 0.9, thinning: fixedWidth ? 0 : 0.45, smoothing: 0.5, streamline, simulatePressure: pressure, last };
  }
  return {
    size: sizePx,
    // 고른 굵기(v0.33): 필압·속도로 굵기가 바뀌지 않게
    thinning: fixedWidth ? 0 : 0.6,
    smoothing: 0.55,
    // streamline이 클수록 획이 펜 끝을 늦게 따라온다. 지연 체감을 줄이려고 낮게 둔다.
    streamline: smoothed ? STREAMLINE_V2 : 0.32,
    simulatePressure: fixedWidth ? false : simulatePressure,
    last,
  };
}

/** 0~1 비율 좌표를 CSS 픽셀 좌표로 */
export function toPagePx(points: InkPoint[], page: PageSize): InkPoint[] {
  return points.map(([x, y, p]) => [x * page.width, y * page.height, p]);
}

/** perfect-freehand 외곽선 → SVG path 문자열 (Path2D로 바로 채울 수 있음) */
export function outlineToSvgPath(outline: number[][]): string {
  const len = outline.length;
  if (len === 0) return "";
  if (len < 3) {
    const [x, y] = outline[0];
    return `M${x},${y}Z`;
  }
  let a = outline[0];
  let b = outline[1];
  const c = outline[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0])},${avg(b[1], c[1])} T`;
  for (let i = 2; i < len - 1; i++) {
    a = outline[i];
    b = outline[i + 1];
    d += `${avg(a[0], b[0])},${avg(a[1], b[1])} `;
  }
  return d + "Z";
}

function avg(a: number, b: number): string {
  return ((a + b) / 2).toFixed(2);
}

/** 획 하나의 외곽선 path (CSS 픽셀 기준) */
export function strokeToSvgPath(stroke: Stroke, page: PageSize, last = true, extra: InkPoint[] = []): string {
  if (hasShape(stroke)) return shapeStrokePath(stroke, page);
  const smoothed = stroke.smooth === SMOOTH_V2;
  let pts = toPagePx(extra.length ? stroke.points.concat(extra) : stroke.points, page);
  // v0.32 획: 앞뒤 점으로 다듬는다 (끝 점은 그대로 — 쓰는 동안 끝 몇 점만 다시 다듬어짐)
  if (smoothed) pts = smoothPoints(pts);
  const sizePx = unitsToPx(stroke.width, page);
  const nib = stroke.tool === "pen" ? stroke.nib : undefined;
  // 캘리그래피 펜 (v0.41): 납작한 펜촉 — 긋는 방향에 따라 굵기가 바뀐다
  if (nib === "calligraphy") return calligraphyPath(pts, sizePx * CALLIGRAPHY_NIB, !!stroke.fixedWidth || !!stroke.simulatePressure);
  let lengthPx = 0;
  if (nib === "fountain") for (let i = 1; i < pts.length; i++) lengthPx += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const opts = strokeOptions(stroke.tool, sizePx, !!stroke.simulatePressure, last, smoothed, !!stroke.fixedWidth, nib, lengthPx);
  // v0.32 획(떨림을 이미 거름)은 처음 굵기(size px)만큼의 점을 버리지 않는다 (v0.37): perfect-freehand는 획 처음 size px 안의 점을
  // 건너뛰어 펜을 댈 때의 떨림을 숨기는데, 작은 글씨에서는 ㅐ·ㅔ의 짧은 삐침이나 ㅇ의 시작이 깎여 사라졌다
  const outline = smoothed ? getStrokeOutlinePoints(getStrokePoints(pts, { ...opts, size: NO_MIN_LENGTH }), opts) : getStroke(pts, opts);
  return outlineToSvgPath(outline);
}

/** 점 (px, py)에서 선분 (ax, ay)-(bx, by)까지 거리 */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 지우개 원(CSS 픽셀 중심·반경)이 획에 닿는지 */
export function strokeHitsCircle(stroke: Stroke, cx: number, cy: number, radius: number, page: PageSize): boolean {
  if (hasShape(stroke)) return shapeDistance(stroke, cx, cy, page) <= radius;
  const reach = radius + unitsToPx(stroke.width, page) / 2;
  const pts = stroke.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) {
    return Math.hypot(pts[0][0] * page.width - cx, pts[0][1] * page.height - cy) <= reach;
  }
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0] * page.width;
    const ay = pts[i - 1][1] * page.height;
    const bx = pts[i][0] * page.width;
    const by = pts[i][1] * page.height;
    if (distToSegment(cx, cy, ax, ay, bx, by) <= reach) return true;
  }
  return false;
}

/** 가용 영역 안에 비율을 유지한 채 가장 크게 들어가는 페이지 크기 */
export function fitPage(availWidth: number, availHeight: number, aspect: number, margin = 16): PageSize {
  const w = Math.max(0, availWidth - margin * 2);
  const h = Math.max(0, availHeight - margin * 2);
  if (w / h > aspect) {
    return { width: Math.floor(h * aspect), height: Math.floor(h) };
  }
  return { width: Math.floor(w), height: Math.floor(w / aspect) };
}

// ── 캘리그래피 펜 (v0.41, SPEC 6장 "펜 종류") ──

/** 펜촉 방향: 오른쪽 위 30° (화면 y는 아래로) — 가로획은 가늘고 세로획은 굵다 */
const NIB_ANGLE = (-30 * Math.PI) / 180;
const NIB_X = Math.cos(NIB_ANGLE);
const NIB_Y = Math.sin(NIB_ANGLE);
/** 펜촉 길이 (굵기 대비): 여러 방향으로 쓴 글씨의 평균 굵기가 볼펜과 비슷하게 (평균 |sin| ≈ 0.64) */
const CALLIGRAPHY_NIB = 1.6;
/** 펜촉 두께 (펜촉 길이 대비): 펜촉과 같은 방향으로 그어도 이만큼은 보이게 */
const NIB_THICK = 0.09;

/** 점들(볼록 껍질)을 시계 반대 방향 하나의 다각형으로 */
function hull(points: [number, number][]): [number, number][] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * 납작한 펜촉이 지나간 자리: 점과 점 사이마다 펜촉(길이 = 굵기 × 필압, 두께 NIB_THICK)을 쓸어 만든 볼록 다각형을
 * 같은 방향으로 겹쳐 그린다(nonzero로 칠하면 합쳐진다). constant면 필압과 상관없이 같은 길이.
 */
export function calligraphyPath(pts: InkPoint[], sizePx: number, constant: boolean): string {
  if (!pts.length) return "";
  const half = (q: InkPoint) => (sizePx / 2) * (constant ? 1 : Math.min(1.15, 0.65 + 0.7 * Math.max(0, Math.min(1, q[2]))));
  const thick = Math.max(0.35, sizePx * NIB_THICK);
  // 펜촉에 수직인 방향
  const tx = -NIB_Y;
  const ty = NIB_X;
  const corners = (q: InkPoint): [number, number][] => {
    const h = half(q);
    return [
      [q[0] + NIB_X * h + tx * thick, q[1] + NIB_Y * h + ty * thick],
      [q[0] + NIB_X * h - tx * thick, q[1] + NIB_Y * h - ty * thick],
      [q[0] - NIB_X * h + tx * thick, q[1] - NIB_Y * h + ty * thick],
      [q[0] - NIB_X * h - tx * thick, q[1] - NIB_Y * h - ty * thick],
    ];
  };
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  const poly = (ring: [number, number][]) => `M${ring.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
  if (pts.length === 1) return poly(hull(corners(pts[0])));
  let d = "";
  for (let i = 1; i < pts.length; i++) d += poly(hull([...corners(pts[i - 1]), ...corners(pts[i])]));
  return d;
}
