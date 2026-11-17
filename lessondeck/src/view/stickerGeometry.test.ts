import { describe, expect, it } from "vitest";
import { anchoredScale, placeStylePanel } from "./stickerGeometry";

const PAGE = { width: 1000, height: 700 };
const PANEL = { width: 330, height: 260 };
const overlaps = (a: { left: number; top: number; width: number; height: number }, b: { left: number; top: number; width: number; height: number }) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

describe("꾸미기 창 자리 (v0.28.3)", () => {
  it("막대가 그림 위이고 위에 자리가 있으면 막대 위로 (그림을 덮지 않음)", () => {
    const frame = { left: 400, top: 400, width: 120, height: 120 };
    const tb = { left: 300, top: 320, width: 380, height: 46 };
    const p = placeStylePanel(frame, tb, PANEL, PAGE);
    expect(p.top + PANEL.height).toBeLessThanOrEqual(tb.top);
    expect(overlaps({ ...p, ...PANEL }, frame)).toBe(false);
  });

  it("위에 자리가 없으면 그림 옆(오른쪽, 안 되면 왼쪽), 막대와도 안 겹침", () => {
    const frame = { left: 300, top: 120, width: 140, height: 140 };
    const tb = { left: 180, top: 40, width: 380, height: 46 };
    const right = placeStylePanel(frame, tb, PANEL, PAGE);
    expect(right.left).toBeGreaterThanOrEqual(frame.left + frame.width);
    expect(overlaps({ ...right, ...PANEL }, frame) || overlaps({ ...right, ...PANEL }, tb)).toBe(false);
    const nearRight = { ...frame, left: 760 };
    const left = placeStylePanel(nearRight, { ...tb, left: 600 }, PANEL, PAGE);
    expect(left.left + PANEL.width).toBeLessThanOrEqual(nearRight.left);
  });

  it("막대가 그림 아래면 막대 아래로, 페이지를 꽉 채운 그림이면 페이지 안에서 가장 덜 겹치게", () => {
    const frame = { left: 400, top: 60, width: 150, height: 150 };
    const tb = { left: 300, top: 224, width: 380, height: 46 };
    const below = placeStylePanel(frame, tb, PANEL, PAGE);
    expect(below.top).toBeGreaterThanOrEqual(tb.top + tb.height);
    const huge = { left: 0, top: 0, width: 1000, height: 700 };
    const p = placeStylePanel(huge, { left: 300, top: 600, width: 380, height: 46 }, PANEL, PAGE);
    expect(p.left).toBeGreaterThanOrEqual(4);
    expect(p.top + PANEL.height).toBeLessThanOrEqual(PAGE.height - 4);
  });
});

describe("스티커 크기 손잡이 (v0.29)", () => {
  const box = { cx: 300, cy: 200, width: 200, height: 100, angle: 0 };
  it("모서리: 맞은편 모서리는 그대로, 비율 유지", () => {
    // 오른쪽 아래를 (600, 350)으로 → 왼쪽 위 (200, 150) 고정, 두 배
    const r = anchoredScale(box, "se", { x: 600, y: 350 }, 10, 5000);
    expect(r.width).toBeCloseTo(400, 6);
    expect(r.height).toBeCloseTo(200, 6);
    expect(r.cx - r.width / 2).toBeCloseTo(200, 6);
    expect(r.cy - r.height / 2).toBeCloseTo(150, 6);
  });
  it("변: 맞은편 변은 그대로 (가운데 줄 유지), 비율 유지", () => {
    const r = anchoredScale(box, "w", { x: 100, y: 999 }, 10, 5000);
    // 왼쪽 변을 100으로 → 오른쪽 변 400 고정, 폭 300
    expect(r.width).toBeCloseTo(300, 6);
    expect(r.cx + r.width / 2).toBeCloseTo(400, 6);
    expect(r.cy).toBeCloseTo(200, 6);
    const n = anchoredScale(box, "n", { x: 0, y: 50 }, 10, 5000);
    expect(n.cy + n.height / 2).toBeCloseTo(250, 6);
    expect(n.height).toBeCloseTo(200, 6);
  });
  it("돌린 틀(90°)도 맞은편이 그대로, 가장 작게 막힘", () => {
    const rot = { ...box, angle: Math.PI / 2 };
    // 90° 돌리면 틀의 "오른쪽(e)"은 화면 아래쪽: 맞은편(틀의 왼쪽 변) = 화면 위 y = 200 - 100
    const r = anchoredScale(rot, "e", { x: 300, y: 500 }, 10, 5000);
    expect(r.cy - r.width / 2).toBeCloseTo(100, 6);
    const tiny = anchoredScale(box, "se", { x: 200, y: 150 }, 30, 5000);
    expect(tiny.width).toBe(30);
  });
});
