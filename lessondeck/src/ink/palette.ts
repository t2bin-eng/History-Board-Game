import type { InkTool, PenPreset } from "./types";

// 펜 색: 교실 TV·프로젝터에서도 흐려 보이지 않게 진하고 쨍한 색 (v0.19)
// 검정 · 흰색 · 빨강 · 파랑 · 초록 · 주황 / 노랑 · 보라 · 분홍 · 하늘 · 청록 · 갈색
export const PEN_COLORS = [
  "#111111",
  "#ffffff",
  "#ff1e1e",
  "#0050ff",
  "#00a844",
  "#ff7b00",
  "#ffc800",
  "#8f2bff",
  "#ff2d95",
  "#00a6ff",
  "#00b3a6",
  "#9a5a1c",
];
// 형광펜: 형광 노랑 · 연두 · 하늘 · 분홍 · 주황 · 보라
// 노랑은 v0.23부터 더 밝은 레몬빛 형광 노랑 (0.22까지 #ffe600)
export const HIGHLIGHTER_COLORS = ["#fff200", "#7dff3a", "#3fd5ff", "#ff5ccd", "#ffa31a", "#b388ff"];
/** 예전 기본 형광펜 색 → 지금 색 (저장된 획은 그대로 두고 칠할 때만 바꿔 보여 준다) */
export const LEGACY_HIGHLIGHTER: Record<string, string> = { "#ffe600": "#fff200" };

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
  { id: "preset-red", tool: "pen", color: PEN_COLORS[2], width: WIDTH_LEVELS.pen[1] },
  { id: "preset-blue", tool: "pen", color: PEN_COLORS[3], width: WIDTH_LEVELS.pen[1] },
];

/**
 * 형광펜 층의 진하기 (v0.23). 형광펜은 펜 아래 한 층에 모아 페이지와 곱하기로 섞으므로
 * 글자(어두운 곳)는 그대로이고 종이(밝은 곳)만 이만큼 물든다. 0.22까지는 0.38로 글자 위에 덮었다.
 */
export const HIGHLIGHTER_ALPHA = 0.75;
