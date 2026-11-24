import { describe, expect, it } from "vitest";
import {
  clampScroll,
  currentSlot,
  layoutStrip,
  maxScrollY,
  scrollToSlot,
  slotAt,
  slotsToRender,
  STRIP_GAP,
  STRIP_TAIL,
  STRIP_TOP,
  stripWidth,
  zoomScrollAt,
} from "./scrollLayout";

const area = { width: 1000, height: 800 };
const pages = [
  { id: "a", aspect: 0.5 }, // 1000 × 2000 (폭 1000이면)
  { id: "b", aspect: 2 }, // 1000 × 500
  { id: "c", aspect: 1 }, // 1000 × 1000
];

describe("이어 보기 띠", () => {
  it("폭은 영역 − 여백, 상한", () => {
    expect(stripWidth(area, 16)).toBe(968);
    expect(stripWidth({ width: 3000, height: 800 }, 16)).toBe(1280);
  });

  it("페이지를 세로로 이어 놓는다", () => {
    const l = layoutStrip(pages, 1000);
    expect(l.slots.map((s) => [s.id, s.top, s.height])).toEqual([
      ["a", STRIP_TOP, 2000],
      ["b", STRIP_TOP + 2000 + STRIP_GAP, 500],
      ["c", STRIP_TOP + 2500 + STRIP_GAP * 2, 1000],
    ]);
    expect(l.total).toBe(STRIP_TOP + 3500 + STRIP_GAP * 2 + STRIP_TAIL);
  });

  it("스크롤 범위: 위 0, 아래는 띠 끝까지, 좁으면 가로 가운데", () => {
    const l = layoutStrip(pages, 800);
    const c = clampScroll({ z: 1, x: 500, y: -50 }, l, area);
    expect(c).toEqual({ z: 1, x: -100, y: 0 });
    const d = clampScroll({ z: 1, x: 0, y: 1e6 }, l, area);
    expect(d.y).toBe(maxScrollY(l, area, 1));
    expect(d.y).toBe(l.total - 800);
    // 확대하면 가로로 끌 수 있다 (가장자리 여백까지)
    const e = clampScroll({ z: 2, x: 1e6, y: 0 }, l, area);
    expect(e.x).toBeCloseTo(800 - 500 + 12);
    expect(clampScroll({ z: 9, x: 0, y: 0 }, l, area).z).toBe(4);
    expect(clampScroll({ z: 0.1, x: 0, y: 0 }, l, area).z).toBe(0.5);
  });

  it("두 손가락 확대: 가운데 점이 손가락을 따라간다", () => {
    const l = layoutStrip(pages, 1000);
    const v = zoomScrollAt({ z: 1, x: 0, y: 1000 }, { x: 500, y: 400 }, { x: 500, y: 400 }, 2, l, area);
    // 띠 (500, 1400)이 화면 (500, 400)에 그대로
    expect(v.z).toBe(2);
    expect(v.x + 500 / 2).toBeCloseTo(500);
    expect(v.y + 400 / 2).toBeCloseTo(1400);
    // 가운데를 위로 100 옮기면 띠는 아래로
    const w = zoomScrollAt({ z: 1, x: 0, y: 1000 }, { x: 500, y: 400 }, { x: 500, y: 300 }, 1, l, area);
    expect(w.y).toBeCloseTo(1100);
  });

  it("y의 페이지, 틈이면 가까운 쪽", () => {
    const l = layoutStrip(pages, 1000);
    expect(slotAt(l, 100)?.id).toBe("a");
    expect(slotAt(l, STRIP_TOP + 2000 + 5)?.id).toBe("a");
    expect(slotAt(l, STRIP_TOP + 2000 + STRIP_GAP - 2)?.id).toBe("b");
    expect(slotAt(l, 1e6)?.id).toBe("c");
  });

  it("지금 페이지: 화면 위에서 35%", () => {
    const l = layoutStrip(pages, 1000);
    expect(currentSlot(l, { z: 1, x: 0, y: 0 }, area)?.id).toBe("a");
    // b 위 끝이 화면 위 35%보다 위로 올라오면 b
    const bTop = l.slots[1].top;
    expect(currentSlot(l, { z: 1, x: 0, y: bTop - 800 * 0.35 + 1 }, area)?.id).toBe("b");
    expect(currentSlot(l, { z: 1, x: 0, y: bTop - 800 * 0.35 - 30 }, area)?.id).toBe("a");
  });

  it("그릴 페이지: 보이는 것과 위아래 반 화면, 가운데부터", () => {
    const l = layoutStrip(pages, 1000);
    expect(slotsToRender(l, { z: 1, x: 0, y: 0 }, area)).toEqual(["a"]);
    expect(slotsToRender(l, { z: 1, x: 0, y: 1000 }, area).sort()).toEqual(["a", "b"]);
    // 줄이면 더 많이
    expect(slotsToRender(l, { z: 0.5, x: 0, y: 1000 }, area).sort()).toEqual(["a", "b", "c"]);
    expect(slotsToRender(l, { z: 0.5, x: 0, y: 1000 }, area, 0.5, 2)).toHaveLength(2);
  });

  it("페이지로 가기: 위 끝이 화면 위에", () => {
    const l = layoutStrip(pages, 1000);
    expect(scrollToSlot(l, { z: 1, x: 0, y: 0 }, area, "b").y).toBe(l.slots[1].top - STRIP_TOP);
    // 끝 페이지는 범위 안으로
    expect(scrollToSlot(l, { z: 1, x: 0, y: 0 }, area, "c").y).toBe(Math.min(l.slots[2].top - STRIP_TOP, maxScrollY(l, area, 1)));
    expect(scrollToSlot(l, { z: 1, x: 0, y: 5 }, area, "zz").y).toBe(5);
  });
});
