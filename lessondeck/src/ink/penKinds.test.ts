import { describe, expect, it } from "vitest";
import { calligraphyPath, strokeOptions, strokeToSvgPath } from "./geometry";
import { strokeOpacity } from "./inkPaint";
import { makeShapeStroke } from "./shapes";
import type { InkPoint, Stroke } from "./types";

// 펜 종류·불투명도 (v0.41, SPEC 5장 "펜 종류·불투명도")

const page = { width: 1000, height: 1000 };

/** path 문자열의 x·y 범위 */
function extent(d: string) {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const line = (x0: number, y0: number, x1: number, y1: number, n = 20, p = 0.5): InkPoint[] =>
  Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1), p] as InkPoint);

describe("캘리그래피 펜: 긋는 방향에 따라 굵기", () => {
  it("세로획이 가로획보다 굵고, 펜촉 방향(오른쪽 위)으로 그으면 아주 가늘다", () => {
    const size = 20;
    const across = (pts: InkPoint[], dir: "h" | "v") => {
      const e = extent(calligraphyPath(pts, size, true));
      return dir === "h" ? e.h : e.w;
    };
    const horizontal = across(line(100, 500, 400, 500), "h");
    const vertical = across(line(500, 100, 500, 400), "v");
    expect(vertical).toBeGreaterThan(horizontal * 1.35);
    // 펜촉과 같은 방향(30° 오른쪽 위): 펜촉에 수직인 폭이 굵기의 1/4도 안 된다
    const a = (-30 * Math.PI) / 180;
    const pts = line(100, 500, 100 + 300 * Math.cos(a), 500 + 300 * Math.sin(a));
    const d = calligraphyPath(pts, size, true);
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    let maxOff = 0;
    for (let i = 0; i < nums.length; i += 2) {
      const dx = nums[i] - 100;
      const dy = nums[i + 1] - 500;
      maxOff = Math.max(maxOff, Math.abs(-Math.sin(a) * dx + Math.cos(a) * dy));
    }
    expect(maxOff * 2).toBeLessThan(size / 4);
  });

  it("필압이 세면 펜촉이 더 넓게 닿는다", () => {
    const light = extent(calligraphyPath(line(500, 100, 500, 400, 20, 0.1), 20, false)).w;
    const hard = extent(calligraphyPath(line(500, 100, 500, 400, 20, 0.9), 20, false)).w;
    expect(hard).toBeGreaterThan(light * 1.3);
  });

  it("점 하나도 보이고, 점이 없으면 빈 path", () => {
    expect(calligraphyPath([[10, 10, 0.5]], 20, true)).toMatch(/^M.*Z$/);
    expect(calligraphyPath([], 20, true)).toBe("");
  });

  it("strokeToSvgPath: 펜만 펜 종류를 따르고, 형광펜은 무시", () => {
    const base: Stroke = { id: "c", tool: "pen", color: "#000", width: 20, points: line(0.1, 0.5, 0.4, 0.5, 10).map(([x, y, p]) => [x, y, p] as InkPoint), nib: "calligraphy" };
    const callig = strokeToSvgPath(base, page);
    expect(callig.split("M").length - 1).toBe(9); // 점 사이마다 다각형 하나
    const hl = strokeToSvgPath({ ...base, tool: "highlighter" }, page);
    expect(hl).not.toBe(callig);
    expect(hl.split("M").length - 1).toBe(1);
  });
});

describe("만년필·연필", () => {
  it("만년필은 필압 반응이 더 크고 시작·끝이 가늘어지며, 연필은 반응이 작다", () => {
    const ball = strokeOptions("pen", 10, false, true);
    const fountain = strokeOptions("pen", 10, false, true, false, false, "fountain", 300);
    const pencil = strokeOptions("pen", 10, false, true, false, false, "pencil", 300);
    expect(fountain.thinning!).toBeGreaterThan(ball.thinning!);
    expect(fountain.start?.taper).toBeGreaterThan(0);
    expect(fountain.end?.taper).toBeGreaterThan(fountain.start!.taper as number);
    expect(pencil.thinning!).toBeLessThan(ball.thinning!);
  });

  it("짧은 만년필 획은 가늘어지는 길이도 짧다 (점이 사라지지 않게)", () => {
    const short = strokeOptions("pen", 10, false, true, false, false, "fountain", 8);
    expect(short.end?.taper as number).toBeLessThanOrEqual(8 * 0.35);
  });

  it("고른 굵기면 필압으로 굵기가 바뀌지 않는다", () => {
    for (const nib of ["fountain", "pencil"] as const) expect(strokeOptions("pen", 10, true, true, false, true, nib, 100).thinning).toBe(0);
  });
});

describe("불투명도", () => {
  const s = (o: number | undefined, tool: Stroke["tool"] = "pen"): Stroke => ({ id: "o", tool, color: "#000", width: 2, points: [[0, 0, 0.5]], opacity: o });
  it("펜만 0.2~1, 없거나 1 이상이면 1", () => {
    expect(strokeOpacity(s(0.6))).toBe(0.6);
    expect(strokeOpacity(s(0.05))).toBe(0.2);
    expect(strokeOpacity(s(undefined))).toBe(1);
    expect(strokeOpacity(s(1.4))).toBe(1);
    expect(strokeOpacity(s(0.6, "highlighter"))).toBe(1);
  });
  it("펜으로 그린 도형도 불투명도를 지닌다 (형광펜 도형은 아님)", () => {
    const spec = { kind: "rect" as const, cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, rot: 0 };
    expect(makeShapeStroke("x", spec, { tool: "pen", color: "#000", width: 2, opacity: 0.4 }, page).opacity).toBe(0.4);
    expect(makeShapeStroke("x", spec, { tool: "pen", color: "#000", width: 2 }, page).opacity).toBeUndefined();
    expect(makeShapeStroke("x", spec, { tool: "highlighter", color: "#ff0", width: 12, opacity: 0.4 }, page).opacity).toBeUndefined();
  });
});
