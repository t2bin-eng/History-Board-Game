import { describe, expect, it } from "vitest";
import { applyCrop, clampCrop, framePatch, newSticker, placePasted, POPUP_ICON_W, popupRect, reorderSticker, shownSticker, snapAngle, stickerHeight, togglePopup, visibleAspect } from "./stickers";
import type { Page, Sticker } from "./types";

const base = (extra: Partial<Sticker> = {}): Sticker => ({ id: "s1", asset: "img", x: 0.2, y: 0.3, w: 0.4, ...extra });
const PAGE = { width: 1000, height: 707 };

describe("크기", () => {
  it("높이는 보이는 부분의 그림 비율로 (찌그러지지 않게)", () => {
    // 가로 2:1 그림, 페이지 가로÷세로 = 1000/707
    expect(stickerHeight(base(), 800, 400, 1000 / 707)).toBeCloseTo((0.4 * 1000) / 2 / 707, 5);
    // 왼쪽 절반만 보이면 1:1
    expect(visibleAspect(base({ crop: { x: 0, y: 0, w: 0.5, h: 1 } }), 800, 400)).toBeCloseTo(1);
  });

  it("새 스티커는 페이지 40% 안, 가운데 또는 누른 자리", () => {
    const tall = newSticker("img", 300, 900, 1000 / 707);
    expect(stickerHeight(tall, 300, 900, 1000 / 707)).toBeCloseTo(0.4, 5);
    expect(tall.x + tall.w / 2).toBeCloseTo(0.5, 5);
    const at = newSticker("img", 800, 400, 1000 / 707, { x: 0.3, y: 0.3 });
    expect(at.w).toBeCloseTo(0.4, 5);
    expect(at.x + at.w / 2).toBeCloseTo(0.3, 5);
  });
});

describe("자르기", () => {
  it("그대로 두면 제자리", () => {
    const s = base({ rotation: 30, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } });
    const r = applyCrop(s, s.crop!, PAGE, 800, 600);
    expect(r.x).toBeCloseTo(s.x, 6);
    expect(r.y).toBeCloseTo(s.y, 6);
    expect(r.w).toBeCloseTo(s.w, 6);
  });

  it("오른쪽 절반만 남기면 틀이 오른쪽 절반 자리로 (돌리지 않음)", () => {
    const s = base();
    const r = applyCrop(s, { x: 0.5, y: 0, w: 0.5, h: 1 }, PAGE, 800, 600);
    expect(r.w).toBeCloseTo(0.2, 6);
    expect(r.x).toBeCloseTo(0.4, 6);
    expect(r.y).toBeCloseTo(0.3, 6);
    expect(r.crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it("180° 돌린 스티커는 반대쪽으로", () => {
    const s = base({ rotation: 180 });
    const r = applyCrop(s, { x: 0.5, y: 0, w: 0.5, h: 1 }, PAGE, 800, 600);
    expect(r.x).toBeCloseTo(0.2, 6);
  });

  it("전체로 되돌리면 crop을 지운다, 범위는 그림 안", () => {
    const s = base({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
    expect(applyCrop(s, { x: 0, y: 0, w: 1, h: 1 }, PAGE, 800, 600).crop).toBeUndefined();
    expect(clampCrop({ x: 0.9, y: -0.2, w: 0.5, h: 0.01 })).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.05 });
  });
});

describe("돌리기·순서·붙이기", () => {
  it("15° 가까이면 붙는다", () => {
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(80)).toBe(80);
    expect(snapAngle(270)).toBe(-90);
    expect(snapAngle(-181)).toBe(180);
  });

  it("맨 앞·맨 뒤", () => {
    const page: Page = { id: "p", kind: "blank", background: "plain", aspect: 1, stickers: [base({ id: "a" }), base({ id: "b" }), base({ id: "c" })] };
    expect(reorderSticker([page], "p", "a", "front")[0].stickers!.map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(reorderSticker([page], "p", "c", "back")[0].stickers!.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("붙이면 새 id, 겹치면 비켜서, 바뀐 원본 id, 누른 자리에 가운데", () => {
    const existing = [base()];
    const [p1] = placePasted(existing, [base()], { img: "img-2" });
    expect(p1.id).not.toBe("s1");
    expect(p1.asset).toBe("img-2");
    expect(p1.x).toBeCloseTo(0.23, 6);
    const [p2] = placePasted([], [base()], {}, { x: 0.5, y: 0.5 }, [0.2]);
    expect(p2.x + p2.w / 2).toBeCloseTo(0.5, 6);
    expect(p2.y + 0.1).toBeCloseTo(0.5, 6);
  });
});

describe("팝업 그림 (v0.27)", () => {
  const ASPECT = 1000 / 707;
  it("페이지에는 정사각형 아이콘: 보이는 부분 가운데 정사각형, 기본 둥근·흰 테두리·그림자", () => {
    const s = base({ popup: { w: 0.07 }, crop: { x: 0.1, y: 0, w: 0.8, h: 1 } });
    const icon = shownSticker(s, 800, 400);
    expect(icon.w).toBe(0.07);
    // 보이는 부분 640×400 → 가운데 400×400 = 그림 대비 가로 0.5
    expect(visibleAspect(icon, 800, 400)).toBeCloseTo(1, 6);
    expect(icon.crop!.w).toBeCloseTo(0.5, 6);
    expect(icon.crop!.x).toBeCloseTo(0.25, 6);
    expect(icon).toMatchObject({ shape: "rounded", border: { color: "#ffffff" }, shadow: true });
    // 직접 고른 모양·테두리는 그대로, 팝업이 아니면 그대로
    expect(shownSticker(base({ popup: { w: 0.1 }, shape: "circle" }), 800, 400).shape).toBe("circle");
    expect(shownSticker(base(), 800, 400)).toEqual(base());
  });

  it("켜고 끄기: 가운데 같은 자리, 끄면 원래 크기, popup 값이 빠짐", () => {
    const s = base();
    const cy = s.y + stickerHeight(s, 800, 400, ASPECT) / 2;
    const on = togglePopup(s, true, 800, 400, ASPECT);
    expect(on.popup).toEqual({ w: POPUP_ICON_W });
    expect(on.w).toBe(0.4);
    expect(on.x + POPUP_ICON_W / 2).toBeCloseTo(0.4, 6);
    expect(on.y + (POPUP_ICON_W * ASPECT) / 2).toBeCloseTo(cy, 6);
    const off = togglePopup(on, false, 800, 400, ASPECT);
    expect("popup" in off).toBe(false);
    expect(off.x).toBeCloseTo(s.x, 6);
    expect(off.y).toBeCloseTo(s.y, 6);
    expect(off.w).toBe(0.4);
  });

  it("틀 고치기: 팝업이면 크기는 아이콘 폭으로(0.03~0.5), 크게 볼 때는 원래 비율로 페이지 안에 가장 크게", () => {
    const icon = base({ popup: { w: 0.07 } });
    expect(framePatch(icon, { x: 0.1, y: 0.2, w: 0.12, rotation: 10 })).toEqual({ x: 0.1, y: 0.2, rotation: 10, popup: { w: 0.12 } });
    expect(framePatch(icon, { x: 0, y: 0, w: 0.9 }).popup).toEqual({ w: 0.5 });
    expect(framePatch(base(), { x: 0.1, y: 0.2, w: 0.3 })).toEqual({ x: 0.1, y: 0.2, w: 0.3 });
    // 가로 2:1 그림, 페이지 1000×707 → 폭 920(가로 92%), 높이 460, 가운데
    const r = popupRect(icon, 800, 400, PAGE);
    expect(r.width).toBeCloseTo(920, 3);
    expect(r.height).toBeCloseTo(460, 3);
    expect(r.top).toBeCloseTo((707 - 460) / 2, 3);
    // 세로로 긴 그림은 세로 88%
    const t = popupRect(icon, 300, 900, PAGE);
    expect(t.height).toBeCloseTo(707 * 0.88, 3);
    expect(t.left + t.width / 2).toBeCloseTo(500, 3);
  });
});
