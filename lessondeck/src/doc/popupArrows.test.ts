import { describe, expect, it } from "vitest";
import { addArrow, arrowNodeIds, shapeOfArrow, type Rect } from "./arrows";
import { copyBoxes } from "./boxes";
import { planPaste } from "./pageClip";
import { copyStickers, popupIconRectPx, removeSticker } from "./stickers";
import type { Page } from "./types";

// 팝업 그림 화살표 (v0.52, SPEC 5장 arrows): from·to가 같은 페이지 팝업 그림 id일 수 있다
const page: Page = {
  id: "p1",
  kind: "blank",
  background: "plain",
  aspect: 0.7,
  boxes: [{ id: "b1", x: 0.6, y: 0.6, text: "본문", size: 24, color: "#1565c0" }],
  stickers: [
    { id: "pop", asset: "img", x: 0.1, y: 0.1, w: 0.4, popup: { w: 0.08 } },
    { id: "plain", asset: "img", x: 0.5, y: 0.1, w: 0.2 },
  ],
};
const size = { width: 1000, height: 1414 };

describe("팝업 그림 화살표 (v0.52)", () => {
  it("이을 수 있는 것: 상자와 팝업 그림 (팝업이 아닌 스티커는 아님)", () => {
    expect([...arrowNodeIds(page)].sort()).toEqual(["b1", "pop"]);
  });

  it("팝업 → 아무 곳, 팝업 → 상자, 상자 → 팝업은 되고 팝업 아닌 스티커·자기 자신은 안 된다", () => {
    const toAt = addArrow([page], "p1", "pop", [0.4, 0.5], "#111111", "a1");
    expect(toAt.id).toBe("a1");
    expect(toAt.pages[0].arrows).toEqual([{ id: "a1", from: "pop", at: [0.4, 0.5], color: "#111111" }]);
    expect(addArrow([page], "p1", "pop", "b1", "#111111", "a2").pages[0].arrows?.[0].to).toBe("b1");
    expect(addArrow([page], "p1", "b1", "pop", "#111111", "a3").pages[0].arrows?.[0].to).toBe("pop");
    expect(addArrow([page], "p1", "plain", [0.4, 0.5], "#111111").id).toBeNull();
    expect(addArrow([page], "p1", "b1", "plain", "#111111").id).toBeNull();
    expect(addArrow([page], "p1", "pop", "pop", "#111111").id).toBeNull();
  });

  it("아이콘 테두리에서 나가 가리키는 곳에 닿는다", () => {
    const icon = popupIconRectPx(page.stickers![0], size)!;
    expect(icon).toEqual({ x: 100, y: 141.4, w: 80, h: 80 });
    const rects = new Map<string, Rect>([["pop", icon]]);
    // 아이콘 가운데 높이(181.4px)의 오른쪽 점
    const shape = shapeOfArrow({ id: "a", from: "pop", at: [0.4, 181.4 / 1414], color: "#111" }, rects, size, 3)!;
    // 아이콘 오른쪽 변(x 180)에서 조금 띄워 시작, 끝은 가리키는 점
    expect(shape.curve[0][0]).toBeGreaterThan(180);
    expect(shape.curve[0][0]).toBeLessThan(190);
    expect(Math.hypot(shape.tip[0] - 400, shape.tip[1] - 181.4)).toBeLessThan(0.5);
  });

  it("팝업 그림을 지우면 닿은 화살표도 지운다", () => {
    const withArrows: Page = { ...page, arrows: [{ id: "a1", from: "pop", at: [0.4, 0.5], color: "#111" }, { id: "a2", from: "b1", to: "pop", color: "#111" }, { id: "a3", from: "b1", at: [0.1, 0.9], color: "#111" }] };
    const [after] = removeSticker([withArrows], "p1", "pop");
    expect(after.stickers?.map((s) => s.id)).toEqual(["plain"]);
    expect(after.arrows?.map((a) => a.id)).toEqual(["a3"]);
  });

  it("페이지 복제·붙여넣기: 새 스티커 id로 화살표도 함께", () => {
    const withArrows: Page = { ...page, arrows: [{ id: "a1", from: "pop", to: "b1", color: "#111" }] };
    const ids = new Map<string, string>();
    const stickers = copyStickers(withArrows.stickers, {}, ids)!;
    const { boxes, arrows } = copyBoxes(withArrows, ids);
    expect(arrows).toHaveLength(1);
    expect(arrows![0].from).toBe(stickers[0].id);
    expect(arrows![0].to).toBe(boxes![0].id);
    const plan = planPaste({ docId: "d", pages: [withArrows], ink: {}, labels: {}, assets: {} }, "d", []);
    const [p] = plan.pages;
    expect(p.arrows?.[0].from).toBe(p.stickers?.[0].id);
    expect(p.arrows?.[0].to).toBe(p.boxes?.[0].id);
    // 상자 없이 팝업 → 아무 곳 화살표만 있어도
    const only: Page = { ...page, boxes: undefined, arrows: [{ id: "a9", from: "pop", at: [0.5, 0.5], color: "#111" }] };
    const [q] = planPaste({ docId: "d", pages: [only], ink: {}, labels: {}, assets: {} }, "d", []).pages;
    expect(q.arrows?.[0].from).toBe(q.stickers?.[0].id);
  });
});
