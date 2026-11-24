import { describe, expect, it } from "vitest";
import { makeShapeStroke } from "./shapes";
import { clampSpace, shiftDown, spaceLimits, strokesBelow } from "./spacing";
import type { Stroke } from "./types";

const page = { width: 1000, height: 1000 };
const line = (id: string, y0: number, y1: number, width = 2): Stroke => ({
  id,
  tool: "pen",
  color: "#000",
  width,
  points: [
    [0.1, y0 / 1000, 0.5],
    [0.3, y1 / 1000, 0.5],
  ],
});

describe("여백 넣기", () => {
  it("줄 아래에서 시작하는 획만 (걸친 획은 그대로)", () => {
    const above = line("a", 100, 150);
    const across = line("b", 280, 340);
    const below = line("c", 320, 400);
    expect(strokesBelow([above, across, below], 300, page).map((s) => s.id)).toEqual(["c"]);
    // 굵기 절반까지 본다: 굵기 20(10px) 획의 맨 위는 줄 위
    expect(strokesBelow([line("d", 305, 400, 20)], 300, page)).toHaveLength(0);
  });

  it("범위: 위로는 줄까지, 아래로는 페이지 끝까지", () => {
    const moving = [line("c", 320, 400), line("e", 500, 900)];
    const lim = spaceLimits(moving, 300, page);
    expect(lim.up).toBeCloseTo(-19);
    expect(lim.down).toBeCloseTo(99);
    expect(clampSpace(500, lim)).toBeCloseTo(99);
    expect(clampSpace(-50, lim)).toBeCloseTo(-19);
    expect(spaceLimits([], 300, page)).toEqual({ up: 0, down: 0 });
  });

  it("위아래로만 옮긴다 (도형도, 굵기 그대로)", () => {
    const rect = makeShapeStroke("r", { kind: "rect", cx: 0.5, cy: 0.6, w: 0.1, h: 0.1, rot: 0 }, { tool: "pen", color: "#000", width: 2 }, page);
    const [s, r] = shiftDown([line("c", 320, 400), rect], 50, page);
    expect(s.points[0][1]).toBeCloseTo(0.37);
    expect(s.points[0][0]).toBeCloseTo(0.1);
    expect(s.width).toBe(2);
    expect(r.shape!.cy).toBeCloseTo(0.65);
    expect(r.shape!.cx).toBeCloseTo(0.5);
    const same = [line("c", 320, 400)];
    expect(shiftDown(same, 0, page)).toBe(same);
  });
});
