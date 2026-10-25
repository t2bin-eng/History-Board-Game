import type { InkTool, PenPreset } from "./types";

export const PEN_COLORS = ["#1a1a1a", "#e53935", "#1e5bd8", "#14894a", "#f08c00"];
export const HIGHLIGHTER_COLORS = ["#ffe14d", "#9be564", "#7fd3ff", "#ff9ad5", "#ffb74d"];

/** 굵기 3단계 (페이지 가로 1000 기준) */
export const WIDTH_LEVELS: Record<InkTool, number[]> = {
  pen: [2, 3.2, 5],
  highlighter: [12, 20, 30],
};

/** 지우개 반경 3단계 (페이지 가로 1000 기준) */
export const ERASER_LEVELS = [6, 14, 28];

export const DEFAULT_PRESETS: PenPreset[] = [
  { id: "preset-hl", tool: "highlighter", color: HIGHLIGHTER_COLORS[0], width: WIDTH_LEVELS.highlighter[1] },
  { id: "preset-black", tool: "pen", color: PEN_COLORS[0], width: WIDTH_LEVELS.pen[0] },
  { id: "preset-red", tool: "pen", color: PEN_COLORS[1], width: WIDTH_LEVELS.pen[1] },
  { id: "preset-blue", tool: "pen", color: PEN_COLORS[2], width: WIDTH_LEVELS.pen[1] },
];

export const HIGHLIGHTER_ALPHA = 0.38;
