import type { BlankBackground } from "./types";

// 빈 페이지 템플릿 (v0.45, SPEC 5장 blank의 background): 백지 · 줄 노트 · 모눈 · 점 노트 · 코넬 노트.
// 무늬는 페이지 가로를 1000으로 본 SVG 하나로 만들어 화면(벡터라 확대해도 또렷)·페이지 바 썸네일·표지 그림(캔버스)이 같이 쓴다.

export const TEMPLATES: { id: BlankBackground; label: string; short: string }[] = [
  { id: "plain", label: "빈 페이지", short: "빈" },
  { id: "lined", label: "줄 노트", short: "줄" },
  { id: "grid", label: "모눈 페이지", short: "모눈" },
  { id: "dot", label: "점 노트", short: "점" },
  { id: "cornell", label: "코넬 노트", short: "코넬" },
];

export const TEMPLATE_IDS: readonly BlankBackground[] = TEMPLATES.map((t) => t.id);

export function templateLabel(bg: BlankBackground): string {
  return TEMPLATES.find((t) => t.id === bg)?.label ?? "빈 페이지";
}

/** 저장된 값이 아는 템플릿인지 (모르는 값은 백지로) */
export function isTemplate(v: unknown): v is BlankBackground {
  return typeof v === "string" && (TEMPLATE_IDS as readonly string[]).includes(v);
}

/** 모눈 칸 · 점 간격 (페이지 가로 1000 기준, 0.24까지의 모눈과 같음) */
const BASE_GRID = 25;
export const GRID_STEP = BASE_GRID;
/** 줄 노트·코넬 노트 줄 간격 */
const BASE_LINE = 36;
export const LINE_STEP = BASE_LINE;
const GRID_COLOR = "#dfe6ea";
const LINE_COLOR = "#c9d6e3";
/** 코넬 노트: 단서 칸 폭 · 제목 칸 높이(세로 비율) · 요약 칸 높이(세로 비율) */
export const CORNELL = { cue: 300, title: 0.1, summary: 0.2 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 템플릿 무늬의 선들 (페이지 가로 1000 · 세로 1000/aspect 좌표). 백지면 빈 목록 */
export function templateShapes(
  bg: BlankBackground,
  aspect: number,
  /** 작은 그림(고르기 단추)용: 간격을 이만큼 넓게 */
  spacing = 1,
): { lines: [number, number, number, number, number][]; dots: [number, number][]; color: string } {
  const H = 1000 / (aspect > 0 ? aspect : 1);
  const GRID_STEP = BASE_GRID * spacing;
  const LINE_STEP = BASE_LINE * spacing;
  const lines: [number, number, number, number, number][] = [];
  const dots: [number, number][] = [];
  if (bg === "grid") {
    for (let x = GRID_STEP; x < 1000; x += GRID_STEP) lines.push([x, 0, x, H, 1]);
    for (let y = GRID_STEP; y < H; y += GRID_STEP) lines.push([0, y, 1000, y, 1]);
    return { lines, dots, color: GRID_COLOR };
  }
  if (bg === "dot") {
    for (let y = GRID_STEP; y < H; y += GRID_STEP) for (let x = GRID_STEP; x < 1000; x += GRID_STEP) dots.push([x, y]);
    return { lines, dots, color: LINE_COLOR };
  }
  if (bg === "lined") {
    for (let y = LINE_STEP * 2; y < H - LINE_STEP / 2; y += LINE_STEP) lines.push([0, y, 1000, y, 1.2]);
    return { lines, dots, color: LINE_COLOR };
  }
  if (bg === "cornell") {
    const top = H * CORNELL.title;
    const bottom = H * (1 - CORNELL.summary);
    lines.push([0, top, 1000, top, 2.4], [0, bottom, 1000, bottom, 2.4], [CORNELL.cue, top, CORNELL.cue, bottom, 2.4]);
    for (let y = top + LINE_STEP; y < bottom - LINE_STEP / 3; y += LINE_STEP) lines.push([CORNELL.cue, y, 1000, y, 1.2]);
    return { lines, dots, color: LINE_COLOR };
  }
  return { lines, dots, color: LINE_COLOR };
}

/** 템플릿 무늬 SVG (viewBox 0 0 1000 H, 늘려도 비율 그대로). 백지면 null */
export function templateSvg(bg: BlankBackground, aspect: number, icon?: { stroke: number; spacing: number }): string | null {
  if (bg === "plain" || !isTemplate(bg)) return null;
  const H = r1(1000 / (aspect > 0 ? aspect : 1));
  const { lines, dots, color: base } = templateShapes(bg, aspect, icon?.spacing ?? 1);
  const k = icon?.stroke ?? 1;
  // 작은 그림은 조금 진하게
  const color = icon ? "#9fb3c8" : base;
  let body = "";
  // 굵기마다 path 하나로 묶는다
  const byWidth = new Map<number, string>();
  for (const [x1, y1, x2, y2, w] of lines) byWidth.set(w * k, (byWidth.get(w * k) ?? "") + `M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}`);
  for (const [w, d] of byWidth) body += `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none"/>`;
  if (dots.length) body += `<path d="${dots.map(([x, y]) => `M${r1(x)} ${r1(y)}h0`).join("")}" stroke="${color}" stroke-width="${3.2 * k}" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${H}" preserveAspectRatio="none">${body}</svg>`;
}

/** CSS·img에 쓰는 data URL */
export function templateUrl(bg: BlankBackground, aspect: number, icon?: { stroke: number; spacing: number }): string | null {
  const svg = templateSvg(bg, aspect, icon);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}
