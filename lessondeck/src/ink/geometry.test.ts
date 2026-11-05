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

describe("도형 획", () => {
  const page = { width: 1000, height: 1400 };
  it("원은 고른 굵기 외곽선(같은 방향 조각들)으로 그리고, 선에 가까운 지우개만 닿는다", async () => {
    const { makeShapeStroke } = await import("./shapes");
    const s = makeShapeStroke("s1", { kind: "ellipse", cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, rot: 0 }, { tool: "pen", color: "#000", width: 3 }, page);
    const d = strokeToSvgPath(s, page);
    expect(d.startsWith("M")).toBe(true);
    expect(d.split("Z").length).toBeGreaterThan(72);
    // 원 위(가장 오른쪽 점 500+100, 700)는 닿고, 한가운데는 닿지 않는다
    expect(strokeHitsCircle(s, 600, 700, 4, page)).toBe(true);
    expect(strokeHitsCircle(s, 500, 700, 20, page)).toBe(false);
    // 옛 버전용 points도 원 위
    expect(s.points.every(([x, y]) => Math.abs(Math.hypot(x * 1000 - 500, y * 1400 - 700) - 100) < 0.5)).toBe(true);
  });

  it("회전·화살표: 끝점과 날개", async () => {
    const { lineEnds, lineSpec, shapePathsPx } = await import("./shapes");
    const spec = lineSpec("arrow", [100, 100], [300, 300], page);
    expect(spec.rot).toBeCloseTo(45, 5);
    const [a, b] = lineEnds(spec, page);
    expect(a[0]).toBeCloseTo(100, 3);
    expect(b[1]).toBeCloseTo(300, 3);
    const paths = shapePathsPx(spec, page, 3);
    expect(paths).toHaveLength(2);
    // 날개의 가운데 점이 화살 끝
    expect(paths[1][1][0]).toBeCloseTo(300, 3);
    expect(paths[1][1][1]).toBeCloseTo(300, 3);
  });
});
