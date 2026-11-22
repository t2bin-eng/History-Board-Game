// 필기 데이터 구조 (SPEC.md 5장)
// - 좌표는 페이지 크기 대비 0~1 비율: x = 가로 비율, y = 세로 비율
// - width는 "페이지 가로 = 1000" 기준 단위라서 화면 크기가 바뀌어도 굵기 비율이 유지된다

export type InkTool = "pen" | "highlighter";
/** laser (v0.33): 레이저 펜 — 그리고 잠깐 뒤 사라짐, 저장 안 함 */
export type Tool = InkTool | "eraser" | "laser";

/** [x, y, pressure] — x·y는 0~1 비율, pressure는 0~1 */
export type InkPoint = [number, number, number];

export interface Stroke {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
  points: InkPoint[];
  /** 펜이 아닌 입력(마우스·손가락)은 실제 필압이 없어서 속도로 필압을 흉내 낸다 */
  simulatePressure?: boolean;
  /** 도형 획 (v0.18): 이 모양에서 다시 만든 선으로 그린다. points에는 그 선의 꼭짓점 */
  shape?: ShapeSpec;
  /** 2 (v0.32): 떨림을 거른 점 — 그릴 때 앞뒤 점으로 고르게 다듬고(끝으로 갈수록 덜) streamline을 낮춘다. 없으면 0.31까지 방식 */
  smooth?: 2;
  /** 고른 굵기 (v0.33): 필압·속도와 상관없이 width 그대로 */
  fixedWidth?: true;
}

/** 화살촉 모양 (v0.30): 열린 V · 채운 삼각형 · 동그라미 · 마름모 · 가로 막대 · 없음 */
export type ArrowHead = "open" | "tri" | "dot" | "diamond" | "bar" | "none";

export type ShapeKind =
  | "line"
  | "arrow"
  | "arrow2"
  | "ellipse"
  | "rect"
  | "roundrect"
  | "triangle"
  | "rtriangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "heart"
  | "polygon";

/** 도형 (SPEC 5장 "도형 획") */
export interface ShapeSpec {
  kind: ShapeKind;
  /** 중심 — 점과 같은 0~1 비율 좌표 */
  cx: number;
  cy: number;
  /** 크기 — 둘 다 페이지 가로 대비 비율. 선·화살표는 w = 길이, h = 0 */
  w: number;
  h: number;
  /** 시계 방향 회전 (도) */
  rot: number;
  /** polygon의 꼭짓점: w×h 상자 안의 -0.5~0.5 좌표 */
  pts?: [number, number][];
  /** 선·화살표 곡선 (v0.24): 3차 베지어 조절점 [u1, v1, u2, v2] — 두 끝을 잇는 곧은 선이 x축(-0.5~0.5), 길이 1 */
  curve?: [number, number, number, number];
  /** 화살촉 모양 (v0.30, arrow·arrow2만). 없으면 열린 V */
  head?: ArrowHead;
}

export interface PenPreset {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
  /** 형광펜: 곧게 긋기 (v0.33) — 댄 곳에서 지금 자리까지 늘 곧은 선 */
  straight?: boolean;
  /** 펜: 필압 안 씀 (v0.33) — 고른 굵기 */
  fixedWidth?: boolean;
}

/** 페이지 가로 1000 기준 굵기 단위를 CSS 픽셀로 바꾼다 */
export const PAGE_UNITS = 1000;
