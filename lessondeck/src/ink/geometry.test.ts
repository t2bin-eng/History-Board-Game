import { describe, expect, it } from "vitest";
import { distToSegment, fitPage, outlineToSvgPath, strokeHitsCircle, strokeToSvgPath, unitsToPx } from "./geometry";
import type { Stroke } from "./types";

const page = { width: 800, height: 1000 };
const line: Stroke = {
  id: "s1",
  tool: "pen",
  color: "#000",
  width: 2.5,
  points: [
    [0.1, 0.5, 0.5],
    [0.5, 0.5, 0.6],
    [0.9, 0.5, 0.4],
  ],
};

describe("unitsToPx", () => {
  it("페이지 가로 1000 단위를 CSS 픽셀로 비례 변환한다", () => {
    expect(unitsToPx(10, page)).toBe(8);
    expect(unitsToPx(10, { width: 1600, height: 2000 })).toBe(16);
  });
});

describe("distToSegment", () => {
  it("선분 안쪽 투영과 끝점 거리를 구한다", () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBe(5);
    expect(distToSegment(1, 1, 2, 2, 2, 2)).toBeCloseTo(Math.SQRT2);
  });
});

describe("strokeHitsCircle", () => {
  it("지우개 원이 획 근처에 있으면 닿은 것으로 본다", () => {
    // 획은 y=500px 수평선, 굵기 2px → 반경 5 지우개는 y=506까지 닿는다
    expect(strokeHitsCircle(line, 400, 505, 5, page)).toBe(true);
    expect(strokeHitsCircle(line, 400, 520, 5, page)).toBe(false);
    expect(strokeHitsCircle(line, 50, 500, 5, page)).toBe(false);
  });

  it("점 하나짜리 획(탭)도 지울 수 있다", () => {
    const dot: Stroke = { ...line, points: [[0.5, 0.5, 0.5]] };
    expect(strokeHitsCircle(dot, 402, 500, 2, page)).toBe(true);
    expect(strokeHitsCircle(dot, 420, 500, 2, page)).toBe(false);
  });
});

describe("fitPage", () => {
  it("세로 문서는 높이에 맞춘다", () => {
    expect(fitPage(1200, 800, 210 / 297, 0)).toEqual({ width: 565, height: 800 });
  });
  it("가로가 좁으면 너비에 맞춘다", () => {
    expect(fitPage(400, 1000, 210 / 297, 0)).toEqual({ width: 400, height: 565 });
  });
  it("여백을 뺀다", () => {
    expect(fitPage(432, 1000, 1, 16)).toEqual({ width: 400, height: 400 });
  });
});

describe("svg path", () => {
  it("외곽선을 닫힌 path로 만든다", () => {
    expect(outlineToSvgPath([])).toBe("");
    const d = strokeToSvgPath(line, page);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});
