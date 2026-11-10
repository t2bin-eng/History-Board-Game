import { describe, expect, it } from "vitest";
import { contrast } from "../doc/colors";
import { isHighlighter, strokeColor } from "./inkPaint";
import { DEFAULT_PRESETS, HIGHLIGHTER_ALPHA, HIGHLIGHTER_COLORS } from "./palette";
import type { Stroke } from "./types";

const stroke = (tool: Stroke["tool"], color: string): Stroke => ({ id: "s", tool, color, width: 20, points: [[0, 0, 0.5]] });

/** 흰 종이 위에 곱하기로 진하기 a만큼 칠한 색 */
function onPaper(hex: string, a: number): string {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return "#" + ch.map((c) => Math.round((1 - a + a * c) * 255).toString(16).padStart(2, "0")).join("");
}

describe("형광펜 칠하기 (v0.23)", () => {
  it("예전 기본 노랑으로 그은 형광펜은 새 노랑으로 보이고, 펜·다른 색은 그대로", () => {
    expect(strokeColor(stroke("highlighter", "#ffe600"))).toBe("#fff200");
    expect(strokeColor(stroke("highlighter", "#FFE600"))).toBe("#fff200");
    expect(strokeColor(stroke("highlighter", "#ff5ccd"))).toBe("#ff5ccd");
    expect(strokeColor(stroke("pen", "#ffe600"))).toBe("#ffe600");
    expect(isHighlighter(stroke("highlighter", "#fff200"))).toBe(true);
    expect(isHighlighter(stroke("pen", "#111111"))).toBe(false);
  });

  it("기본 형광펜은 새 형광 노랑, 종이 위에서 쨍하되 검은 글자와 대비가 크다", () => {
    expect(DEFAULT_PRESETS[0]).toMatchObject({ tool: "highlighter", color: "#fff200" });
    const paper = onPaper(HIGHLIGHTER_COLORS[0], HIGHLIGHTER_ALPHA);
    // 0.22까지(0.38로 덮기)의 옅은 노랑 #fff59e보다 진하고(파랑 성분이 적고), 검은 글자 대비는 15 이상
    expect(parseInt(paper.slice(5, 7), 16)).toBeLessThan(0x9e);
    expect(contrast("#111111", paper)).toBeGreaterThanOrEqual(15);
    // 모든 형광펜 색이 종이 위에서 검은 글자와 대비 7 이상 (글자가 잘 읽힘)
    for (const c of HIGHLIGHTER_COLORS) expect(contrast("#111111", onPaper(c, HIGHLIGHTER_ALPHA))).toBeGreaterThanOrEqual(7);
  });
});
