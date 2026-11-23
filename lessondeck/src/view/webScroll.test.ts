import { describe, expect, it } from "vitest";
import { parseScrollMessage } from "./webScroll";
import { shiftedView, shiftStroke } from "../ink/shift";
import type { Stroke } from "../ink/types";

describe("HTML 페이지 스크롤 (v0.36)", () => {
  it("안내 스크립트 메시지 → 액자 대비 비율", () => {
    expect(parseScrollMessage({ lessondeck: "scroll", x: 0, y: 720, w: 1280, h: 720 })).toEqual({ x: 0, y: 1 });
    expect(parseScrollMessage({ lessondeck: "scroll", x: 640, y: 360, w: 1280, h: 720 })).toEqual({ x: 0.5, y: 0.5 });
  });
  it("다른 메시지·이상한 값은 버린다", () => {
    expect(parseScrollMessage({ type: "other" })).toBeNull();
    expect(parseScrollMessage({ lessondeck: "scroll", x: 0, y: 10, w: 0, h: 720 })).toBeNull();
    expect(parseScrollMessage({ lessondeck: "scroll", x: "1", y: 10, w: 100, h: 720 })).toBeNull();
    expect(parseScrollMessage(null)).toBeNull();
    expect(parseScrollMessage("scroll")).toBeNull();
  });
});

const stroke = (id: string, pts: [number, number][]): Stroke => ({ id, tool: "highlighter", color: "#ff0", width: 20, points: pts.map(([x, y]) => [x, y, 0.5]) });

describe("획 옮기기 (v0.36)", () => {
  it("화면에는 스크롤만큼 위로, 그대로인 획은 원래 획을 돌려준다", () => {
    const a = stroke("a", [[0.1, 1.3], [0.4, 1.3]]);
    const b = stroke("b", [[0.2, 0.2]]);
    const view = shiftedView([a, b], 0, 1);
    expect(view.strokes[0].points[0]).toEqual([0.1, 0.3, 0.5]);
    expect(view.strokes[1].points[0]).toEqual([0.2, -0.8, 0.5]);
    // 새 획은 화면 좌표 → 문서 좌표로
    const c = stroke("c", [[0.5, 0.5]]);
    const back = view.back([view.strokes[0], view.strokes[1], c]);
    expect(back[0]).toBe(a);
    expect(back[1]).toBe(b);
    expect(back[2].points[0]).toEqual([0.5, 1.5, 0.5]);
  });
  it("지우개로 하나를 지우면 나머지는 원래 획 그대로", () => {
    const a = stroke("a", [[0.1, 1.3]]);
    const b = stroke("b", [[0.2, 0.2]]);
    const view = shiftedView([a, b], 0, 0.5);
    expect(view.back([view.strokes[1]])).toEqual([b]);
    expect(view.back([view.strokes[1]])[0]).toBe(b);
  });
  it("스크롤이 없으면 그대로", () => {
    const a = stroke("a", [[0.1, 0.3]]);
    const view = shiftedView([a], 0, 0);
    expect(view.strokes[0]).toBe(a);
  });
  it("도형 획은 중심도 옮긴다", () => {
    const s: Stroke = { ...stroke("s", [[0.1, 0.1]]), shape: { kind: "rect", cx: 0.3, cy: 1.2, w: 0.1, h: 0.1, rot: 0 } };
    const moved = shiftStroke(s, 0, -1);
    expect(moved.shape?.cy).toBeCloseTo(0.2);
    expect(moved.shape?.cx).toBe(0.3);
  });
});
