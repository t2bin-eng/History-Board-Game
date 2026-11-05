// 도형 획 (SPEC 5장 "도형 획"): 도형 정보(ShapeSpec)에서 선을 만들고, 고른 굵기·둥근 이음으로 그린다.
// 그리기는 선분마다 직사각형, 꼭짓점마다 원을 같은 방향으로 이어 붙인 외곽선(nonzero로 채우면 합쳐진 모양)이라
// 겹치는 곳에 구멍이 생기지 않고, 화살표처럼 떨어진 선도 한 번에 채운다.

import { PAGE_UNITS, type InkPoint, type InkTool, type ShapeKind, type ShapeSpec, type Stroke } from "./types";

type P = [number, number];
interface Size {
  width: number;
  height: number;
}

/** 도형 고르기 창의 차례와 이름 */
export const SHAPE_KINDS: { kind: Exclude<ShapeKind, "polygon">; label: string }[] = [
  { kind: "line", label: "선" },
  { kind: "arrow", label: "화살표" },
  { kind: "arrow2", label: "양쪽 화살표" },
  { kind: "ellipse", label: "원" },
  { kind: "rect", label: "사각형" },
  { kind: "roundrect", label: "둥근 사각형" },
  { kind: "triangle", label: "삼각형" },
  { kind: "rtriangle", label: "직각삼각형" },
  { kind: "diamond", label: "마름모" },
  { kind: "pentagon", label: "오각형" },
  { kind: "hexagon", label: "육각형" },
  { kind: "star", label: "별" },
  { kind: "heart", label: "하트" },
];

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  ...(Object.fromEntries(SHAPE_KINDS.map((s) => [s.kind, s.label])) as Record<Exclude<ShapeKind, "polygon">, string>),
  polygon: "다각형",
};

/** 도형 모드: 고른 도형을 펜으로 끌어 그리기, auto는 그린 획을 뗄 때 알아본 도형으로 */
export type ShapeTool = Exclude<ShapeKind, "polygon"> | "auto";

/** 반듯해 보이는 세로/가로 비율 (끌어 그릴 때 이 비율 ±10%면 딱 맞춘다) */
const REGULAR_ASPECT: Record<Exclude<ShapeKind, "polygon">, number> = {
  line: 0,
  arrow: 0,
  arrow2: 0,
  ellipse: 1,
  rect: 1,
  roundrect: 1,
  diamond: 1,
  rtriangle: 1,
  triangle: Math.sqrt(3) / 2,
  pentagon: (1 + Math.cos(Math.PI / 5)) / (2 * Math.sin((2 * Math.PI) / 5)),
  hexagon: Math.sqrt(3) / 2,
  star: (1 + Math.cos(Math.PI / 5)) / (2 * Math.sin((2 * Math.PI) / 5)),
  heart: 0.9,
};

/**
 * 끌어 그리기: 펜을 댄 곳(start)에서 지금 자리(end)까지 (페이지 px).
 * 선·화살표는 두 끝(가로·세로·45° 근처 붙음), 그 밖은 두 점을 맞모서리로 한 상자(반듯한 비율 ±10%면 딱 맞춤)
 */
export function dragShape(kind: Exclude<ShapeKind, "polygon">, start: P, end: P, page: Size): ShapeSpec {
  if (isLineShape(kind)) {
    const len = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const deg = (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
    const near = Math.round(deg / 45) * 45;
    const t = ((Math.abs(deg - near) <= 4 ? near : deg) * Math.PI) / 180;
    return lineSpec(kind, start, [start[0] + Math.cos(t) * len, start[1] + Math.sin(t) * len], page);
  }
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const w = Math.max(4, Math.abs(dx));
  let h = Math.max(4, Math.abs(dy));
  const ratio = REGULAR_ASPECT[kind];
  if (Math.abs(h / w - ratio) < ratio * 0.1) h = w * ratio;
  const cx = start[0] + (dx < 0 ? -w : w) / 2;
  const cy = start[1] + (dy < 0 ? -h : h) / 2;
  return { kind, cx: cx / page.width, cy: cy / page.height, w: w / page.width, h: h / page.width, rot: 0 };
}

/** 선처럼 두 끝으로 고치는 도형 */
export function isLineShape(kind: ShapeKind): boolean {
  return kind === "line" || kind === "arrow" || kind === "arrow2";
}

/** 굵기 단위 → px */
function widthPx(units: number, page: Size): number {
  return (units * page.width) / PAGE_UNITS;
}

/** 꼭짓점들을 상자 -0.5~0.5에 꽉 차게 */
function fitUnit(pts: P[]): P[] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1;
  const h = Math.max(...ys) - minY || 1;
  return pts.map(([x, y]) => [(x - minX) / w - 0.5, (y - minY) / h - 0.5]);
}

function regular(n: number, startDeg: number, radii: number[] = [1]): P[] {
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    const r = radii[i % radii.length];
    out.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return fitUnit(out);
}

const UNIT: Partial<Record<ShapeKind, P[]>> = {
  pentagon: regular(5, -90),
  hexagon: regular(6, 0),
  // 정오각별: 안쪽 반지름 = 바깥 × 0.382
  star: regular(10, -90, [1, 0.382]),
  heart: fitUnit(
    Array.from({ length: 64 }, (_, i): P => {
      const t = (i / 64) * Math.PI * 2;
      return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
    }),
  ),
};

const close = (pts: P[]): P[] => [...pts, pts[0]];

/** 회전 전, 중심이 (0,0)인 px 좌표의 선들 */
function localPaths(spec: ShapeSpec, w: number, h: number, lineW: number): P[][] {
  const scale = (pts: P[]): P[] => pts.map(([x, y]) => [x * w, y * h]);
  switch (spec.kind) {
    case "line":
      return [[[-w / 2, 0], [w / 2, 0]]];
    case "arrow":
    case "arrow2": {
      const head = Math.min(w * 0.4, Math.max(lineW * 4, w * 0.18));
      const wing = (tipX: number, dir: 1 | -1): P[] => {
        const a = (25 * Math.PI) / 180;
        return [
          [tipX - dir * head * Math.cos(a), -head * Math.sin(a)],
          [tipX, 0],
          [tipX - dir * head * Math.cos(a), head * Math.sin(a)],
        ];
      };
      const paths: P[][] = [[[-w / 2, 0], [w / 2, 0]], wing(w / 2, 1)];
      if (spec.kind === "arrow2") paths.push(wing(-w / 2, -1));
      return paths;
    }
    case "ellipse":
      return [
        close(
          Array.from({ length: 72 }, (_, i): P => {
            const t = (i / 72) * Math.PI * 2;
            return [(Math.cos(t) * w) / 2, (Math.sin(t) * h) / 2];
          }),
        ),
      ];
    case "rect":
      return [close([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]])];
    case "roundrect": {
      const r = Math.min(w, h) * 0.18;
      const out: P[] = [];
      const corners: [number, number, number][] = [
        [w / 2 - r, -h / 2 + r, -90],
        [w / 2 - r, h / 2 - r, 0],
        [-w / 2 + r, h / 2 - r, 90],
        [-w / 2 + r, -h / 2 + r, 180],
      ];
      for (const [x, y, a0] of corners) {
        for (let k = 0; k <= 6; k++) {
          const t = ((a0 + k * 15) * Math.PI) / 180;
          out.push([x + Math.cos(t) * r, y + Math.sin(t) * r]);
        }
      }
      return [close(out)];
    }
    case "triangle":
      return [close([[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]])];
    case "rtriangle":
      return [close([[-w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]])];
    case "diamond":
      return [close([[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]])];
    case "polygon":
      return spec.pts && spec.pts.length >= 2 ? [close(scale(spec.pts))] : [];
    default: {
      const unit = UNIT[spec.kind];
      return unit ? [close(scale(unit))] : [];
    }
  }
}

/** 도형의 화면(페이지 px) 자리: 중심·크기·회전 */
export function shapeFrame(spec: ShapeSpec, page: Size): { cx: number; cy: number; w: number; h: number; rad: number } {
  return {
    cx: spec.cx * page.width,
    cy: spec.cy * page.height,
    w: spec.w * page.width,
    h: spec.h * page.width,
    rad: (spec.rot * Math.PI) / 180,
  };
}

/** 페이지 px 좌표의 선들 */
export function shapePathsPx(spec: ShapeSpec, page: Size, lineW: number): P[][] {
  const f = shapeFrame(spec, page);
  const cos = Math.cos(f.rad);
  const sin = Math.sin(f.rad);
  return localPaths(spec, f.w, f.h, lineW).map((path) =>
    path.map(([x, y]): P => [f.cx + x * cos - y * sin, f.cy + x * sin + y * cos]),
  );
}

/** 선·화살표의 두 끝 (페이지 px) */
export function lineEnds(spec: ShapeSpec, page: Size): [P, P] {
  const f = shapeFrame(spec, page);
  const dx = (Math.cos(f.rad) * f.w) / 2;
  const dy = (Math.sin(f.rad) * f.w) / 2;
  return [
    [f.cx - dx, f.cy - dy],
    [f.cx + dx, f.cy + dy],
  ];
}

/** 두 끝(페이지 px)으로 선 모양 */
export function lineSpec(kind: ShapeKind, a: P, b: P, page: Size): ShapeSpec {
  return {
    kind,
    cx: (a[0] + b[0]) / 2 / page.width,
    cy: (a[1] + b[1]) / 2 / page.height,
    w: Math.hypot(b[0] - a[0], b[1] - a[1]) / page.width,
    h: 0,
    rot: round((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, 100),
  };
}

const round = (v: number, k = 10000) => Math.round(v * k) / k;

/** 도형 획의 points: 선들의 꼭짓점 (비율 좌표, 필압 하나). shape를 모르는 옛 버전도 비슷하게 그린다 */
export function shapePoints(spec: ShapeSpec, page: Size, widthUnits: number): InkPoint[] {
  const out: InkPoint[] = [];
  for (const path of shapePathsPx(spec, page, widthPx(widthUnits, page))) {
    for (const [x, y] of path) out.push([round(x / page.width), round(y / page.height), 0.5]);
  }
  return out;
}

/** 도형 획 만들기 */
export function makeShapeStroke(
  id: string,
  spec: ShapeSpec,
  style: { tool: InkTool; color: string; width: number },
  page: Size,
): Stroke {
  const shape: ShapeSpec = { ...spec, cx: round(spec.cx), cy: round(spec.cy), w: round(spec.w), h: round(spec.h), rot: round(spec.rot, 100) };
  return { id, tool: style.tool, color: style.color, width: style.width, points: shapePoints(shape, page, style.width), shape };
}

/** 모양만 바꾼 같은 획 */
export function withShape(stroke: Stroke, spec: ShapeSpec, page: Size): Stroke {
  return makeShapeStroke(stroke.id, spec, stroke, page);
}

/** 고른 굵기 선의 외곽선 path (페이지 px). nonzero로 채운다 */
export function shapeOutlinePath(paths: P[][], lineW: number): string {
  const r = Math.max(0.5, lineW / 2);
  const parts: string[] = [];
  const poly = (pts: P[]) => parts.push(`M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`);
  // 모든 조각을 같은 방향(시계 반대 방향 기준 음수 넓이)으로 그려야 nonzero 채우기가 합집합이 된다
  const disc = (x: number, y: number, n: number) =>
    poly(Array.from({ length: n }, (_, i): P => [x + Math.cos((-i / n) * Math.PI * 2) * r, y + Math.sin((-i / n) * Math.PI * 2) * r]));
  for (const path of paths) {
    if (!path.length) continue;
    const closed = path.length > 2 && path[0][0] === path[path.length - 1][0] && path[0][1] === path[path.length - 1][1];
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      if (!(closed && i === path.length - 1)) {
        // 이음이 거의 곧으면 원을 성기게
        const prev = path[i - 1] ?? (closed ? path[path.length - 2] : undefined);
        const next = path[i + 1];
        let sharp = true;
        if (prev && next) {
          const a1 = Math.atan2(y - prev[1], x - prev[0]);
          const a2 = Math.atan2(next[1] - y, next[0] - x);
          let d = Math.abs(a2 - a1);
          if (d > Math.PI) d = Math.PI * 2 - d;
          sharp = d > 0.35;
        }
        disc(x, y, sharp ? 16 : 8);
      }
      const next = path[i + 1];
      if (!next) continue;
      const dx = next[0] - x;
      const dy = next[1] - y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = (-dy / len) * r;
      const ny = (dx / len) * r;
      poly([
        [x + nx, y + ny],
        [next[0] + nx, next[1] + ny],
        [next[0] - nx, next[1] - ny],
        [x - nx, y - ny],
      ]);
    }
  }
  return parts.join("");
}

/** 도형 획의 외곽선 path (페이지 px) */
export function shapeStrokePath(stroke: Stroke & { shape: ShapeSpec }, page: Size): string {
  const w = widthPx(stroke.width, page);
  return shapeOutlinePath(shapePathsPx(stroke.shape, page, w), w);
}

/** 점에서 선분까지 거리 */
function segDist(px: number, py: number, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** (x, y)(페이지 px)에서 도형 선까지 거리 */
export function shapeDistance(stroke: Stroke & { shape: ShapeSpec }, x: number, y: number, page: Size): number {
  let best = Infinity;
  for (const path of shapePathsPx(stroke.shape, page, widthPx(stroke.width, page))) {
    if (path.length === 1) best = Math.min(best, Math.hypot(x - path[0][0], y - path[0][1]));
    for (let i = 1; i < path.length; i++) best = Math.min(best, segDist(x, y, path[i - 1], path[i]));
  }
  return best - widthPx(stroke.width, page) / 2;
}

export function hasShape(stroke: Stroke): stroke is Stroke & { shape: ShapeSpec } {
  return !!stroke.shape;
}

/** 이 자리(페이지 px)에 있는 도형 획 (위에 그린 것부터), 여유 tol px */
export function shapeAt(strokes: Stroke[], x: number, y: number, page: Size, tol: number): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (hasShape(s) && shapeDistance(s, x, y, page) <= tol) return s;
  }
  return null;
}

/** 새로 넣는 도형의 기본 모양 (페이지 px 자리 at 중심) */
export function defaultShape(kind: Exclude<ShapeKind, "polygon">, at: P, page: Size): ShapeSpec {
  const w = 0.24;
  const tall = kind === "star" || kind === "pentagon" ? 0.95 : kind === "hexagon" ? 0.866 : kind === "heart" ? 0.9 : 1;
  const h = isLineShape(kind) ? 0 : kind === "rect" || kind === "roundrect" ? w * 0.66 : w * tall;
  return { kind, cx: at[0] / page.width, cy: at[1] / page.height, w, h, rot: 0 };
}
