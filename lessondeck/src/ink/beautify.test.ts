import { describe, expect, it } from "vitest";
import { averagePressure, beautifyStroke, linePoints, pathLengthPx, snapLineEnd } from "./beautify";
import type { InkPoint } from "./types";

const PAGE = { width: 1000, height: 1000 };
/** 화면 px로 적은 점 → 비율 */
const pt = (x: number, y: number, p = 0.5): InkPoint => [x / 1000, y / 1000, p];
/** 늘 같은 흔들림 (시험이 매번 같게) */
const wobble = (i: number) => Math.sin(i * 1.7) * 0.8;

describe("직선 보정", () => {
  it("수평·수직·45° 가까우면 붙고, 아니면 그대로", () => {
    const h = snapLineEnd(0, 0, 100, 3);
    expect(h.y).toBeCloseTo(0, 6);
    expect(h.x).toBeCloseTo(Math.hypot(100, 3), 6);
    const d = snapLineEnd(0, 0, 100, 97);
    expect(d.x).toBeCloseTo(d.y, 6);
    expect(snapLineEnd(0, 0, 100, 30)).toEqual({ x: 100, y: 30 });
  });

  it("직선은 고른 간격, 필압 하나", () => {
    const line = linePoints(pt(100, 100, 0.3), pt(400, 104, 0.9), 0.6, PAGE);
    expect(line.length).toBeGreaterThan(50);
    expect(new Set(line.map((q) => q[1])).size).toBe(1);
    expect(line.every((q) => q[2] === 0.6)).toBe(true);
    expect(pathLengthPx(line, PAGE)).toBeCloseTo(Math.hypot(300, 4), 0);
    expect(averagePressure([pt(0, 0, 0.2), pt(1, 1, 0.6)])).toBeCloseTo(0.4);
  });
});

describe("필기 보정", () => {
  it("살짝 기운 떨리는 가로획 → 반듯한 수평", () => {
    const raw = Array.from({ length: 60 }, (_, i) => pt(100 + i * 2, 200 + i * 0.07 + wobble(i)));
    const out = beautifyStroke(raw, PAGE, 3);
    const ys = out.map((q) => q[1] * 1000);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.2);
    expect(out[0][0]).toBeCloseTo(raw[0][0], 4);
  });

  it("ㄱ: 꺾인 곳은 살리고 가로는 수평, 세로는 수직으로 이어진다", () => {
    const raw: InkPoint[] = [];
    for (let i = 0; i <= 40; i++) raw.push(pt(100 + i * 2, 100 + i * 0.05 + wobble(i) * 0.6));
    for (let i = 1; i <= 40; i++) raw.push(pt(180 + i * 0.06 + wobble(i) * 0.6, 102 + i * 2));
    const out = beautifyStroke(raw, PAGE, 3).map(([x, y]) => [x * 1000, y * 1000]);
    // 꺾인 점 가까이에 점이 있다
    const corner = out.reduce((best, q) => (Math.hypot(q[0] - 180, q[1] - 102) < Math.hypot(best[0] - 180, best[1] - 102) ? q : best));
    expect(Math.hypot(corner[0] - 180, corner[1] - 102)).toBeLessThan(4);
    const horizontal = out.filter((q) => q[0] < corner[0] - 4);
    const vertical = out.filter((q) => q[1] > corner[1] + 4);
    expect(Math.max(...horizontal.map((q) => q[1])) - Math.min(...horizontal.map((q) => q[1]))).toBeLessThan(0.2);
    expect(Math.max(...vertical.map((q) => q[0])) - Math.min(...vertical.map((q) => q[0]))).toBeLessThan(0.2);
  });

  it("ㅇ: 굽은 획은 부드럽게, 모양은 그대로", () => {
    const raw = Array.from({ length: 80 }, (_, i) => {
      const t = (i / 79) * Math.PI * 2;
      const r = 40 + wobble(i);
      return pt(500 + Math.cos(t) * r, 500 + Math.sin(t) * r);
    });
    const out = beautifyStroke(raw, PAGE, 3).map(([x, y]) => Math.hypot(x * 1000 - 500, y * 1000 - 500));
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    const before = raw.map(([x, y]) => Math.hypot(x * 1000 - 500, y * 1000 - 500));
    expect(spread(out)).toBeLessThan(spread(before));
    expect(Math.abs(out.reduce((s, v) => s + v, 0) / out.length - 40)).toBeLessThan(2);
  });

  it("짧은 점·획은 그대로, 대각선은 맞추지 않는다", () => {
    const dot = [pt(10, 10), pt(11, 11), pt(12, 11), pt(12, 12)];
    expect(beautifyStroke(dot, PAGE, 3)).toBe(dot);
    const diag = Array.from({ length: 40 }, (_, i) => pt(100 + i * 2, 100 + i * 1.2 + wobble(i) * 0.3));
    const out = beautifyStroke(diag, PAGE, 3);
    const last = out[out.length - 1];
    expect(last[0] * 1000).toBeCloseTo(178, 0);
    expect(last[1] * 1000).toBeCloseTo(100 + 39 * 1.2 + wobble(39) * 0.3, 0);
  });
});
