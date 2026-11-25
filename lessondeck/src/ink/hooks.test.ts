import { describe, expect, it } from "vitest";
import { trimHooks } from "./smoothing";
import type { InkPoint } from "./types";

// 화면 px 그대로인 점 (x, y, 필압)
const scr = (p: InkPoint): [number, number] => [p[0], p[1]];
const line = (n: number, y = 100, p = 0.5): InkPoint[] => Array.from({ length: n }, (_, i) => [100 + i * 2, y, p]);

describe("댈 때·뗄 때 갈고리 자르기 (v0.47.2)", () => {
  it("뗄 때 옆으로 튀고 필압이 떨어진 꼬리를 뗀다", () => {
    const body = line(20);
    const last = body[body.length - 1];
    const hook: InkPoint[] = [
      [last[0] + 0.5, last[1] + 1.2, 0.3],
      [last[0] + 0.8, last[1] + 2.4, 0.2],
      [last[0] + 1, last[1] + 3.5, 0.1],
    ];
    const out = trimHooks([...body, ...hook], scr);
    expect(out).toHaveLength(20);
    expect(out[out.length - 1]).toEqual(last);
  });

  it("필압을 유지하며 일부러 꺾은 끝은 그대로 (ㄱ의 끝)", () => {
    const body = line(20);
    const last = body[body.length - 1];
    const flick: InkPoint[] = [1, 2, 3].map((k) => [last[0], last[1] + k * 1.5, 0.5]);
    const pts = [...body, ...flick];
    expect(trimHooks(pts, scr)).toBe(pts);
  });

  it("같은 방향으로 끝나며 필압만 떨어지면 그대로", () => {
    const body = line(20);
    const last = body[body.length - 1];
    const fade: InkPoint[] = [1, 2, 3].map((k) => [last[0] + k * 1.5, last[1], 0.5 - k * 0.13]);
    const pts = [...body, ...fade];
    expect(trimHooks(pts, scr)).toBe(pts);
  });

  it("5px보다 긴 꼬리는 갈고리가 아니다", () => {
    const body = line(20);
    const last = body[body.length - 1];
    const tail: InkPoint[] = [1, 2, 3, 4].map((k) => [last[0], last[1] + k * 2, 0.2]);
    const pts = [...body, ...tail];
    expect(trimHooks(pts, scr)).toBe(pts);
  });

  it("댈 때 미끄러진 머리를 뗀다", () => {
    const body = line(20);
    const first = body[0];
    const head: InkPoint[] = [
      [first[0] - 1, first[1] - 2.5, 0.1],
      [first[0] - 0.6, first[1] - 1.5, 0.2],
    ];
    const out = trimHooks([...head, ...body], scr);
    expect(out[0]).toEqual(first);
    expect(out).toHaveLength(20);
  });

  it("댈 때 옆으로 미끄러졌다 돌아오면 돌아온 점부터", () => {
    const body = line(20);
    const first = body[0];
    const slip: InkPoint[] = [
      [first[0] - 1.5, first[1] - 0.2, 0.05],
      [first[0] - 1, first[1] - 2.4, 0.1],
      [first[0] - 0.5, first[1] - 2.4, 0.15],
      [first[0] - 0.2, first[1] - 0.3, 0.2],
    ];
    const out = trimHooks([...slip, ...body], scr);
    expect(out[0]).toEqual(slip[3]);
    expect(out).toHaveLength(21);
  });

  it("짧은 획·점이 적은 획은 그대로", () => {
    const short: InkPoint[] = [
      [100, 100, 0.5],
      [102, 100, 0.5],
      [104, 100, 0.5],
      [106, 100, 0.5],
      [107, 102, 0.1],
      [108, 104, 0.1],
    ];
    expect(trimHooks(short, scr)).toBe(short);
    const few = line(4);
    expect(trimHooks(few, scr)).toBe(few);
  });
});
