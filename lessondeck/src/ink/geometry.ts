import { getStroke, type StrokeOptions } from "perfect-freehand";
import { PAGE_UNITS, type InkPoint, type InkTool, type Stroke } from "./types";

export interface PageSize {
  width: number;
  height: number;
}

/** 페이지 단위 굵기를 CSS 픽셀로 */
export function unitsToPx(units: number, page: PageSize): number {
  return (units * page.width) / PAGE_UNITS;
}

export function strokeOptions(
  tool: InkTool,
  sizePx: number,
  simulatePressure: boolean,
  last: boolean,
): StrokeOptions {
  if (tool === "highlighter") {
    return {
      size: sizePx,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.3,
      simulatePressure: false,
      last,
    };
  }
  return {
    size: sizePx,
    thinning: 0.6,
    smoothing: 0.55,
    // streamline이 클수록 획이 펜 끝을 늦게 따라온다. 지연 체감을 줄이려고 낮게 둔다.
    streamline: 0.32,
    simulatePressure,
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
  const pts = toPagePx(extra.length ? stroke.points.concat(extra) : stroke.points, page);
  const outline = getStroke(pts, strokeOptions(stroke.tool, unitsToPx(stroke.width, page), !!stroke.simulatePressure, last));
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
