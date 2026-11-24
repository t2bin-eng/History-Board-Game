import { describe, expect, it } from "vitest";
import { eraserTakes, eraseStrokeArea } from "./eraser";
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

describe("부분 지우개 (v0.40)", () => {
  const page = { width: 1000, height: 1000 };
  // 굵기 2 단위 = 2px (페이지 1000px)
  const line = (id = "a"): Stroke => ({
    id,
    tool: "pen",
    color: "#000",
    width: 2,
    smooth: 2,
    points: Array.from({ length: 11 }, (_, i) => [(100 + i * 20) / 1000, 0.5, 0.5] as [number, number, number]),
  });
  let n = 0;
  const ids = () => `new-${++n}`;
  const xs = (s: Stroke) => s.points.map((q) => Math.round(q[0] * 1000 * 10) / 10);

  it("닿지 않으면 null (그대로)", () => {
    expect(eraseStrokeArea(line(), 200, 560, 10, page, ids)).toBeNull();
  });

  it("가운데를 문지르면 두 조각: 잘린 끝이 지우개 가장자리(반지름 + 굵기/4)에 맞고, 첫 조각은 원래 id", () => {
    const out = eraseStrokeArea(line(), 200, 500, 10, page, ids)!;
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("a");
    expect(out[1].id).not.toBe("a");
    // 지운 범위: 200 ± 10.5 → 왼쪽 조각 끝은 189.5 근처(바깥), 오른쪽 조각 시작은 210.5 근처
    const leftEnd = xs(out[0]).at(-1)!;
    const rightStart = xs(out[1])[0];
    expect(leftEnd).toBeLessThan(189.5);
    expect(leftEnd).toBeGreaterThan(186);
    expect(rightStart).toBeGreaterThan(210.5);
    expect(rightStart).toBeLessThan(214);
    // 원래 끝점은 그대로, 성질도 그대로
    expect(xs(out[0])[0]).toBe(100);
    expect(xs(out[1]).at(-1)).toBe(300);
    expect(out[0].smooth).toBe(2);
    expect(out[1].color).toBe("#000");
  });

  it("끝을 문지르면 한 조각만 짧아지고, 전부 덮으면 빈 배열", () => {
    const out = eraseStrokeArea(line(), 300, 500, 15, page, ids)!;
    expect(out).toHaveLength(1);
    expect(xs(out[0]).at(-1)!).toBeLessThan(300 - 15);
    expect(eraseStrokeArea(line(), 200, 500, 200, page, ids)).toEqual([]);
  });

  it("점 사이(선분)만 지나가도 닿은 것으로 본다", () => {
    const sparse: Stroke = { ...line(), points: [[0.1, 0.5, 0.5], [0.3, 0.5, 0.5]] };
    const out = eraseStrokeArea(sparse, 200, 500, 5, page, ids)!;
    expect(out).toHaveLength(2);
  });

  it("도형 획이 잘리면 shape를 떼고 고른 굵기 획", () => {
    const rect: Stroke = { ...line(), shape: { kind: "line", cx: 0.2, cy: 0.5, w: 0.2, h: 0, rot: 0 } };
    const out = eraseStrokeArea(rect, 200, 500, 10, page, ids)!;
    expect(out.every((s) => !s.shape && s.fixedWidth === true)).toBe(true);
  });
});
