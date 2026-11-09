import { describe, expect, it } from "vitest";
import { BOX_COLORS } from "./boxes";
import { autoBackground, contrast } from "./colors";
import { HIGHLIGHTER_COLORS, PEN_COLORS } from "../ink/palette";

describe("글상자 배경 자동", () => {
  it("검정·파랑 글자는 옅은 바탕, 흰색·노랑 글자는 짙은 바탕", () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(autoBackground("#111111"))).toBeGreaterThan(650);
    expect(lum(autoBackground("#0050ff"))).toBeGreaterThan(650);
    expect(lum(autoBackground("#ffffff"))).toBeLessThan(160);
    expect(lum(autoBackground("#ffc800"))).toBeLessThan(150);
  });

  it("글자색 어느 것이든 대비 3 이상 (큰 글자 기준), 검정·파랑은 4.5 이상", () => {
    for (const c of [...BOX_COLORS, ...PEN_COLORS]) expect(contrast(c, autoBackground(c))).toBeGreaterThanOrEqual(3);
    expect(contrast("#111111", autoBackground("#111111"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#0050ff", autoBackground("#0050ff"))).toBeGreaterThanOrEqual(4.5);
  });

  it("펜·형광펜 색은 진하고 쨍하게 (흐린 색 없음)", () => {
    expect(PEN_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(HIGHLIGHTER_COLORS.length).toBeGreaterThanOrEqual(6);
    // 기본 파랑은 흰 종이 위에서 대비 4.5 이상
    expect(contrast(PEN_COLORS[3], "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
