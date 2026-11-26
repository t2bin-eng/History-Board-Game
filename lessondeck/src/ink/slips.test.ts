import { describe, expect, it } from "vitest";
import { trimSlips } from "./smoothing";
import type { InkPoint } from "./types";

// 화면 px 그대로인 점
const scr = (p: InkPoint): [number, number] => [p[0], p[1]];
/** (x0, y0)에서 아래로 len px, 3px 간격 (빠르게 쓴 획), 필압 0.6 */
const down = (x0: number, y0: number, len: number, step = 3): InkPoint[] => Array.from({ length: Math.floor(len / step) + 1 }, (_, i) => [x0, y0 + i * step, 0.6]);

describe("댈 때 미끄러짐 혹 (v0.53)", () => {
  it("꾹 눌러 닿으며 옆으로 미끄러진 머리는 필압과 상관없이 뗀다", () => {
    const body = down(100, 100, 40);
    const head: InkPoint[] = [
      [102.5, 99.5, 0.6],
      [101.3, 100, 0.6],
    ];
    const out = trimSlips([...head, ...body], scr, 3.2);
    // 남은 첫 점이 줄기(x = 100) 위
    expect(Math.abs(out[0][0] - 100)).toBeLessThan(0.01);
    expect(out[out.length - 1]).toEqual(body[body.length - 1]);
  });

  it("끝은 건드리지 않는다 (일부러 날려 쓴 끝과 구별할 수 없음)", () => {
    const body = down(100, 100, 40);
    const last = body[body.length - 1];
    const tail: InkPoint[] = [
      [last[0] + 1.4, last[1] + 0.8, 0.6],
      [last[0] + 2.6, last[1] + 0.6, 0.6],
    ];
    const pts = [...body, ...tail];
    expect(trimSlips(pts, scr, 3.2)).toBe(pts);
  });

  it("일부러 그은 시작 돌기(1의 깃, 굵기의 2배 넘게)는 그대로", () => {
    const flag: InkPoint[] = [
      [92, 106, 0.6],
      [95, 104, 0.6],
      [98, 102, 0.6],
      [100, 100, 0.6],
    ];
    const pts = [...flag, ...down(100, 100, 40).slice(1)];
    expect(trimSlips(pts, scr, 3.2)).toBe(pts);
  });

  it("곧게 시작한 획, 짧은 획, 고르게 휜 괄호·작은 ㅇ의 시작은 그대로", () => {
    const body = down(100, 100, 40);
    expect(trimSlips(body, scr, 3.2)).toBe(body);
    const short: InkPoint[] = [
      [102, 99, 0.6],
      [100, 100, 0.6],
      [100, 103, 0.6],
      [100, 106, 0.6],
      [100, 109, 0.6],
      [100, 112, 0.6],
    ];
    expect(trimSlips(short, scr, 3.2)).toBe(short);
    for (const r of [5, 8, 12, 20]) {
      // 괄호: 위에서 아래로 반원, 빠르게(4px 간격)
      const n = Math.max(8, Math.round((Math.PI * r) / 4));
      const arc = Array.from({ length: n + 1 }, (_, i): InkPoint => [200 - r * Math.sin((Math.PI * i) / n), 200 - r * Math.cos((Math.PI * i) / n), 0.6]);
      expect(trimSlips(arc, scr, 3.2)).toBe(arc);
    }
  });
});
