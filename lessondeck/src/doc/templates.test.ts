import { describe, expect, it } from "vitest";
import { CORNELL, GRID_STEP, isTemplate, LINE_STEP, templateLabel, templateShapes, templateSvg, templateUrl } from "./templates";

const A4 = 210 / 297;

describe("빈 페이지 템플릿", () => {
  it("아는 값만 템플릿, 이름", () => {
    expect(["plain", "lined", "grid", "dot", "cornell"].every(isTemplate)).toBe(true);
    expect(isTemplate("music")).toBe(false);
    expect(isTemplate(3)).toBe(false);
    expect(templateLabel("cornell")).toBe("코넬 노트");
  });

  it("백지·모르는 값은 무늬 없음", () => {
    expect(templateSvg("plain", A4)).toBeNull();
    expect(templateSvg("music" as never, A4)).toBeNull();
    expect(templateUrl("plain", A4)).toBeNull();
  });

  it("모눈: 가로 1000을 25 간격 (0.24까지와 같은 칸)", () => {
    const { lines } = templateShapes("grid", A4);
    const vertical = lines.filter(([x1, , x2]) => x1 === x2);
    expect(vertical).toHaveLength(1000 / GRID_STEP - 1);
    expect(vertical[0][0]).toBe(25);
  });

  it("줄 노트: 위 두 줄 띄우고 36 간격, 아래 끝 앞까지", () => {
    const H = 1000 / A4;
    const { lines } = templateShapes("lined", A4);
    expect(lines[0][1]).toBe(72);
    expect(lines[1][1] - lines[0][1]).toBe(LINE_STEP);
    expect(lines.at(-1)![1]).toBeLessThan(H - LINE_STEP / 2);
    expect(lines.every(([x1, , x2]) => x1 === 0 && x2 === 1000)).toBe(true);
  });

  it("점 노트: 점만, 25 간격", () => {
    const { lines, dots } = templateShapes("dot", 1);
    expect(lines).toHaveLength(0);
    expect(dots).toHaveLength(39 * 39);
    expect(dots[1][0] - dots[0][0]).toBe(25);
  });

  it("코넬 노트: 제목·요약 칸 가로선, 단서 칸 세로선, 필기 칸 줄", () => {
    const H = 1000 / A4;
    const { lines } = templateShapes("cornell", A4);
    const thick = lines.filter((l) => l[4] > 2);
    expect(thick).toHaveLength(3);
    expect(thick[0][1]).toBeCloseTo(H * CORNELL.title);
    expect(thick[1][1]).toBeCloseTo(H * (1 - CORNELL.summary));
    expect(thick[2][0]).toBe(CORNELL.cue);
    const rules = lines.filter((l) => l[4] < 2);
    expect(rules.length).toBeGreaterThan(10);
    // 필기 칸 줄은 단서 칸 오른쪽에만
    expect(rules.every(([x1, , x2]) => x1 === CORNELL.cue && x2 === 1000)).toBe(true);
  });

  it("SVG: 페이지 비율의 viewBox, 늘려도 그대로", () => {
    const svg = templateSvg("lined", 0.5)!;
    expect(svg).toContain('viewBox="0 0 1000 2000"');
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(templateUrl("dot", 1)!.startsWith("data:image/svg+xml")).toBe(true);
  });
});
