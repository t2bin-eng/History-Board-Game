// 필기 데이터 구조 (SPEC.md 5장)
// - 좌표는 페이지 크기 대비 0~1 비율: x = 가로 비율, y = 세로 비율
// - width는 "페이지 가로 = 1000" 기준 단위라서 화면 크기가 바뀌어도 굵기 비율이 유지된다

export type InkTool = "pen" | "highlighter";
export type Tool = InkTool | "eraser";

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
}

export interface PenPreset {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
}

/** 페이지 가로 1000 기준 굵기 단위를 CSS 픽셀로 바꾼다 */
export const PAGE_UNITS = 1000;
