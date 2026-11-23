import { getStroke, getStrokeOutlinePoints, getStrokePoints, type StrokeOptions } from "perfect-freehand";
import { hasShape, shapeDistance, shapeStrokePath } from "./shapes";
import { SMOOTH_V2, smoothPoints } from "./smoothing";
import { PAGE_UNITS, type InkPoint, type InkTool, type Stroke } from "./types";

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
  const opts = strokeOptions(stroke.tool, unitsToPx(stroke.width, page), !!stroke.simulatePressure, last, smoothed, !!stroke.fixedWidth);
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
