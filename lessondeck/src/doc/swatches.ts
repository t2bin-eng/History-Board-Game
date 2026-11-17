// 색 고르기 (v0.29, SPEC 6장 "색 고르기"): 글자·테두리·화살표·펜·스티커 테두리·배경·형광펜이 같은 목록을 쓴다.
// 줄마다 10가지 — 같은 빛깔이 세로로 이어지게 (빨강 아래 짙은 빨강, 그 아래 밝은 빨강).

/** 진한 색 30가지: 쨍한 색(v0.19 펜 색) · 짙은 색 · 밝은 색(짙은 바탕 위 글자) */
export const RICH_COLORS = [
  "#111111", "#ff1e1e", "#ff7b00", "#ffc800", "#00a844", "#00b3a6", "#00a6ff", "#0050ff", "#8f2bff", "#ff2d95",
  "#555555", "#b71c1c", "#9a5a1c", "#8d6e00", "#1b5e20", "#00695c", "#0d47a1", "#1a237e", "#4a148c", "#880e4f",
  "#ffffff", "#9e9e9e", "#ff8a80", "#ffb74d", "#fff176", "#a5d6a7", "#80deea", "#90caf9", "#ce93d8", "#f8bbd0",
];

/** 배경 30가지: 옅은 색 · 밝은 색 · 짙은 색 (v0.19 배경 8가지 포함) */
export const RICH_BG_COLORS = [
  "#ffffff", "#fff4b0", "#ffe9cc", "#ffe1ef", "#f1e4ff", "#dcefff", "#d9f6f7", "#ddf7d8", "#f2f7d4", "#ececec",
  "#ffe600", "#ffc46b", "#ff9a8a", "#ff8fc0", "#c9a2ff", "#7cc2ff", "#5fe0e0", "#8fe08a", "#d4e86a", "#bdbdbd",
  "#1d2433", "#263238", "#3e2723", "#4a148c", "#0d2a6b", "#004d40", "#1b5e20", "#7f1d1d", "#8a3b00", "#000000",
];

/** 형광펜 12가지 (v0.23의 6가지 + 라임·아쿠아·산호·연분홍·연파랑·살구) */
export const RICH_HIGHLIGHTERS = ["#fff200", "#7dff3a", "#3fd5ff", "#ff5ccd", "#ffa31a", "#b388ff", "#ccff00", "#00f5d4", "#ff6b6b", "#ff9ae6", "#8ab4ff", "#ffcf70"];

/** 밝은 색인지 (흰 바탕에서 칸 테두리를 진하게 보이려고) */
export function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.82;
}

/** "#rrggbb"(작은 글자)로, 아니면 null */
export function normalizeHex(v: string | undefined): string | null {
  return v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}
