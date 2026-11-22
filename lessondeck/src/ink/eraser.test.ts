import { describe, expect, it } from "vitest";
import { eraserTakes } from "./eraser";
import type { Stroke } from "./types";

const stroke = (tool: Stroke["tool"], shape = false): Stroke => ({
  id: tool,
  tool,
  color: "#000",
  width: 2,
  points: [[0, 0, 0.5]],
  ...(shape ? { shape: { kind: "line", cx: 0.5, cy: 0.5, w: 0.2, h: 0, rot: 0 } } : {}),
});

describe("eraserTakes (지울 것)", () => {
  it("전부: 펜·형광펜 모두", () => {
    expect(eraserTakes("all", stroke("pen"))).toBe(true);
    expect(eraserTakes("all", stroke("highlighter"))).toBe(true);
  });
  it("형광펜만: 형광펜 획·형광펜 도형만", () => {
    expect(eraserTakes("highlighter", stroke("pen"))).toBe(false);
    expect(eraserTakes("highlighter", stroke("highlighter"))).toBe(true);
    expect(eraserTakes("highlighter", stroke("highlighter", true))).toBe(true);
  });
  it("펜만: 펜 획·펜 도형만", () => {
    expect(eraserTakes("pen", stroke("pen"))).toBe(true);
    expect(eraserTakes("pen", stroke("pen", true))).toBe(true);
    expect(eraserTakes("pen", stroke("highlighter"))).toBe(false);
  });
});
