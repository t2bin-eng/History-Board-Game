import { describe, expect, it } from "vitest";
import { AVOID, placeOnScreen, type Rect } from "./screenFit";

const R = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });
const area = R(140, 130, 470, 620); // 좁은 분할 화면의 페이지 영역
const palette = R(154, 130, 82, 500); // 왼쪽 펜 바

describe("페이지에 붙은 막대를 화면 기준으로 (v0.51.1)", () => {
  it("배율 1, 화면 안, 펜 바와 안 겹치면 제자리", () => {
    const r0 = R(300, 200, 260, 44);
    const at = placeOnScreen(r0, 260, 44, R(302, 252, 120, 30), area, palette);
    expect(at).toEqual({ x: 300, y: 200, clear: true });
  });

  it("4배 확대: 같은 크기로, 상자 위 같은 화면 간격에, 화면 안으로", () => {
    // 막대 260×44가 4배로 1040×176, 상자 왼쪽에 붙어 화면 왼쪽 밖으로 나감
    const box = R(100, 420, 600, 80);
    const r0 = R(-500, 420 - 32 - 176, 1040, 176);
    const at = placeOnScreen(r0, 260, 44, box, area, null);
    expect(at.y).toBe(420 - 32 - 44);
    expect(at.x).toBeGreaterThanOrEqual(area.left);
    expect(at.x + 260).toBeLessThanOrEqual(area.right);
  });

  it("펜 바와 겹치면 펜 바 오른쪽으로 비킨다", () => {
    const r0 = R(160, 200, 300, 44);
    const at = placeOnScreen(r0, 300, 44, R(170, 252, 100, 30), area, palette);
    expect(at.x).toBe(palette.right + AVOID);
    expect(at.clear).toBe(true);
  });

  it("위에 자리가 없으면 아래로, 아래도 없으면 화면 안으로 당긴다", () => {
    const box = R(300, 150, 200, 40);
    const r0 = R(300, 150 - 8 - 90, 260, 90);
    expect(placeOnScreen(r0, 260, 90, box, area, null).y).toBe(190 + 8);
    const tall = R(300, 150 - 8 - 600, 260, 600);
    expect(placeOnScreen(tall, 260, 600, box, area, null).y).toBe(area.top);
  });

  it("상자가 화면 밖으로 밀려나도 막대는 화면 가장자리에 남는다", () => {
    const box = R(700, 900, 200, 40); // 오른쪽 아래 밖
    const r0 = R(700, 900 - 8 - 44, 260, 44);
    const at = placeOnScreen(r0, 260, 44, box, area, null);
    expect(at.x + 260).toBeLessThanOrEqual(area.right);
    expect(at.y + 44).toBeLessThanOrEqual(area.bottom);
  });

  it("펜 바 양옆 모두 자리가 없으면 clear = false (호출하는 쪽이 줄을 접어 다시)", () => {
    const at = placeOnScreen(R(150, 200, 440, 44), 440, 44, R(200, 252, 100, 30), area, palette);
    expect(at.clear).toBe(false);
  });

  it("옮겨진 막대에 붙은 창(스티커 꾸미기)은 그 막대 아래에 쌓는다 — 겹치지 않게", () => {
    // 4배 확대: 창의 원래 자리는 원래 막대(4배) 아래 10px×4, 막대는 화면 기준으로 옮겨짐
    const natural = R(-200, 300, 1400, 184);
    const bar = R(242, 354, 374, 84);
    const r0 = R(-200, 300 + 184 + 40, 1320, 1200);
    const at = placeOnScreen(r0, 330, 300, bar, area, palette, { natural, gapScale: 1 / 4, stack: true });
    expect(at.y).toBe(bar.bottom + 10);
    expect(at.x).toBe(242);
    // 원래 옆자리였으면 아래로(자리가 없으면 위로) 쌓는다
    const side = placeOnScreen(R(900, 300, 1320, 1200), 330, 300, bar, area, palette, { natural, gapScale: 1 / 4, stack: true });
    expect(side.y).toBe(bar.bottom + 8);
  });
});
