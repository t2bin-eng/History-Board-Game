import { describe, expect, it } from "vitest";
import { clampView, identity, zoomAt } from "./viewport";

const page = { width: 500, height: 700 };
const area = { width: 1000, height: 800 };

describe("clampView", () => {
  it("배율 1에서는 항상 가운데", () => {
    expect(clampView({ z: 1, tx: 300, ty: -200 }, page, area)).toEqual({ z: 1, tx: 0, ty: 0 });
  });
  it("배율은 1~5로 제한한다", () => {
    expect(clampView({ z: 0.5, tx: 0, ty: 0 }, page, area).z).toBe(1);
    expect(clampView({ z: 9, tx: 0, ty: 0 }, page, area).z).toBe(5);
  });
  it("확대한 페이지는 가장자리 여백까지만 끌 수 있다", () => {
    // 세로 700×2 = 1400 > 800 → 위쪽 끝: -base + 24, base = 50
    const v = clampView({ z: 2, tx: 0, ty: 9999 }, page, area);
    expect(v.ty).toBe(-50 + 24);
    // 가로 500×2 = 1000 = 영역 폭 → 가운데 정렬
    expect(v.tx).toBe((1000 - 1000) / 2 - 250);
  });
});

describe("zoomAt", () => {
  it("두 손가락 가운데 점 아래의 페이지 위치가 그대로 유지된다", () => {
    const focus = { x: 500, y: 400 };
    const v = zoomAt(identity, focus, focus, 2, page, area);
    // 페이지 안의 점: 화면 (500,400) = 기준 (250,50) + P → P = (250, 350)
    // 확대 후 화면 = 250 + tx + 2×250 = 500 → tx = -250
    expect(v).toEqual({ z: 2, tx: -250, ty: 400 - 50 - 700 });
  });
  it("손가락을 옮기면 페이지도 함께 이동한다", () => {
    const v = zoomAt({ z: 2, tx: -250, ty: -350 }, { x: 500, y: 400 }, { x: 520, y: 420 }, 2, page, area);
    // 세로는 20px 따라 내려오고, 가로는 페이지 폭이 영역과 같아서 가운데에 고정된다
    expect(v).toEqual({ z: 2, tx: -250, ty: -330 });
  });
});
