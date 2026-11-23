import { describe, expect, it } from "vitest";
import { capPrediction, keepPoint, smoothPoints } from "./smoothing";
import { strokeToSvgPath } from "./geometry";
import type { InkPoint, Stroke } from "./types";

const P = (x: number, y: number) => ({ x, y });

describe("keepPoint (떨림 거르기)", () => {
  const D = (x: number, y: number, dist: number) => ({ x, y, dist });
  it("1px 넘게 떨어지면 남긴다", () => {
    expect(keepPoint(P(0, 0), P(10, 0), P(11.2, 0), null).keep).toBe(true);
    expect(keepPoint(P(0, 0), P(10, 0), P(11.2, 0), D(10.5, 0, 0.5)).keep).toBe(true);
  });
  it("1px 안이면 버리고, 버린 점 중 가장 멀리 간 것을 기억한다", () => {
    const a = keepPoint(P(0, 0), P(10, 0), P(10.5, 0.2), null);
    expect(a.keep).toBe(false);
    expect(a.dropped?.dist).toBeCloseTo(Math.hypot(0.5, 0.2), 6);
    // 조금 더 나아감 → 또 버리고, 더 멀리 간 점으로 바꿔 기억
    const b = keepPoint(P(0, 0), P(10, 0), P(10.55, 0.25), a.dropped);
    expect(b.keep).toBe(false);
    expect(b.dropped?.dist).toBeCloseTo(Math.hypot(0.55, 0.25), 6);
    // 덜 나아간 점 (되돌아오지도 않음) → 버리고, 기억은 그대로
    const c = keepPoint(P(0, 0), P(10, 0), P(10.5, 0.27), b.dropped);
    expect(c.keep).toBe(false);
    expect(c.dropped).toEqual(b.dropped);
  });
  it("남긴 바로 다음 점은 꺾여도 버린다 (촘촘한 떨림을 모서리로 보지 않게)", () => {
    expect(keepPoint(P(0, 0), P(10, 0), P(10, 0.8), null).keep).toBe(false);
  });
  it("버린 점이 있은 뒤 30° 넘게 꺾이면 남긴다 (모서리)", () => {
    const dropped = D(10.3, 0, 0.3);
    expect(keepPoint(P(0, 0), P(10, 0), P(10.3, 0.6), dropped).keep).toBe(true); // 약 63°
    expect(keepPoint(P(0, 0), P(10, 0), P(10, 0.8), dropped).keep).toBe(true); // 90°
    expect(keepPoint(P(0, 0), P(10, 0), P(10.8, 0.3), dropped).keep).toBe(false); // 약 20°
  });
  it("0.2px 안은 버린다 (꺾여도)", () => {
    expect(keepPoint(P(0, 0), P(10, 0), P(10, 0.15), D(10.1, 0, 0.1)).keep).toBe(false);
  });
  it("멀리 갔다가 되돌아오면 남긴다 (작은 갈고리)", () => {
    // 오른쪽으로 0.9px 갔다가(버림) 왼쪽으로 돌아옴
    expect(keepPoint(P(0, 0), P(10, 0), P(10.4, 0.05), D(10.9, 0, 0.9)).keep).toBe(true);
    // 계속 나아가면 버림
    expect(keepPoint(P(0, 0), P(10, 0), P(10.95, 0.05), D(10.9, 0, 0.9)).keep).toBe(false);
  });
  it("앞 점이 없어도(획 처음) 1px 안은 버린다", () => {
    expect(keepPoint(null, P(10, 0), P(10, 0.8), D(10, 0.5, 0.5)).keep).toBe(false);
  });
  it("위아래로 촘촘히 떨며 나아가는 점은 덜 남는다", () => {
    const kept: { x: number; y: number }[] = [P(0, 0)];
    let dropped = null;
    for (let i = 1; i <= 150; i++) {
      const c = P(i * 0.4, i % 2 ? 0.3 : -0.3);
      const r = keepPoint(kept.length > 1 ? kept[kept.length - 2] : null, kept[kept.length - 1], c, dropped);
      dropped = r.dropped;
      if (r.keep) kept.push(c);
    }
    expect(kept.length).toBeLessThan(100);
    expect(kept.length).toBeGreaterThan(30);
  });
  it("한 방향으로 아주 천천히 (0.3px씩) 나아가면 1px마다 하나", () => {
    const kept: { x: number; y: number }[] = [P(0, 0)];
    let dropped = null;
    for (let i = 1; i <= 100; i++) {
      const c = P(i * 0.3, 0);
      const r = keepPoint(kept.length > 1 ? kept[kept.length - 2] : null, kept[kept.length - 1], c, dropped);
      dropped = r.dropped;
      if (r.keep) kept.push(c);
    }
    expect(kept.length).toBeGreaterThan(20);
    expect(kept.length).toBeLessThan(35);
  });
});

/** 떨림 섞인 가로선 */
function wobbly(n: number, amp = 0.6): InkPoint[] {
  return Array.from({ length: n }, (_, i) => [i * 3, 100 + (i % 2 ? amp : -amp), 0.5 + (i % 3 === 0 ? 0.2 : 0)] as InkPoint);
}

describe("smoothPoints (끝 다듬기)", () => {
  it("첫 점·끝 점은 그대로", () => {
    const pts = wobbly(20);
    const out = smoothPoints(pts);
    expect(out[0]).toEqual(pts[0]);
    expect(out[19][0]).toBe(pts[19][0]);
    expect(out[19][1]).toBe(pts[19][1]);
  });
  it("가운데 떨림이 줄어든다 (자리·필압)", () => {
    const pts = wobbly(30, 0.6);
    const out = smoothPoints(pts);
    const dev = (a: InkPoint[]) => Math.max(...a.slice(3, -3).map((p) => Math.abs(p[1] - 100)));
    expect(dev(out)).toBeLessThan(dev(pts) * 0.3);
    const pr = (a: InkPoint[]) => {
      const v = a.slice(4, -4).map((p) => p[2]);
      return Math.max(...v) - Math.min(...v);
    };
    expect(pr(out)).toBeLessThan(pr(pts) * 0.5);
  });
  it("끝에 점이 더 와도 앞쪽 점은 바뀌지 않는다 (끝 몇 점만 다시 다듬음)", () => {
    const pts = wobbly(40);
    const a = smoothPoints(pts.slice(0, 30));
    const b = smoothPoints(pts);
    for (let i = 0; i < 27; i++) expect(b[i]).toEqual(a[i]);
    // 끝 쪽 점은 이웃이 와서 다시 다듬어진다
    expect(b[29]).not.toEqual(a[29]);
  });
  it("크게 꺾인 모서리는 둥글게 뭉개지지 않는다", () => {
    // ㄱ자: 오른쪽으로 가다가 아래로
    const pts: InkPoint[] = [];
    for (let i = 0; i <= 10; i++) pts.push([i * 3, 0, 0.5]);
    for (let i = 1; i <= 10; i++) pts.push([30, i * 3, 0.5]);
    const out = smoothPoints(pts);
    const corner = out[10];
    expect(corner[0]).toBe(30);
    expect(corner[1]).toBe(0);
    // 모서리 바로 옆 점도 모서리 너머와 섞이지 않는다
    expect(out[9][1]).toBeCloseTo(0, 6);
    expect(out[11][0]).toBeCloseTo(30, 6);
  });
  it("점이 둘 이하면 그대로", () => {
    const pts: InkPoint[] = [
      [0, 0, 0.5],
      [5, 5, 0.6],
    ];
    expect(smoothPoints(pts)).toEqual(pts);
  });
});

describe("smooth: 2 획 그리기", () => {
  const page = { width: 800, height: 600 };
  const base: Stroke = {
    id: "s",
    tool: "pen",
    color: "#000",
    width: 3,
    points: wobbly(30).map(([x, y, p]) => [x / 800, y / 600, p] as InkPoint),
  };
  it("smooth가 없으면 0.31까지와 같은 모양, 있으면 다른 모양", () => {
    const legacy = strokeToSvgPath(base, page);
    expect(strokeToSvgPath({ ...base }, page)).toBe(legacy);
    expect(strokeToSvgPath({ ...base, smooth: 2 }, page)).not.toBe(legacy);
  });
});

describe("capPrediction (v0.36 예측 줄이기)", () => {
  const page = { width: 1000, height: 500 };
  it("마지막 점에서 maxPx까지만, 넘는 점부터 버림", () => {
    const last: [number, number, number] = [0.1, 0.1, 0.5];
    const pred: [number, number, number][] = [
      [0.105, 0.1, 0.5], // 5px
      [0.11, 0.1, 0.5], // 10px
      [0.115, 0.1, 0.5], // 15px
    ];
    expect(capPrediction(last, pred, page, 12)).toEqual(pred.slice(0, 2));
    expect(capPrediction(last, pred, page, 100)).toEqual(pred);
    expect(capPrediction(last, pred, page, 3)).toEqual([]);
  });
  it("세로는 페이지 높이로 잰다", () => {
    // y 0.02 = 10px (높이 500)
    expect(capPrediction([0.5, 0.5, 0.5], [[0.5, 0.52, 0.5]], page, 12)).toHaveLength(1);
    expect(capPrediction([0.5, 0.5, 0.5], [[0.5, 0.54, 0.5]], page, 12)).toHaveLength(0);
  });
  it("마지막 점이 없거나 예측이 없으면 빈 배열", () => {
    expect(capPrediction(undefined, [[0.1, 0.1, 0.5]], page, 12)).toEqual([]);
    expect(capPrediction([0.1, 0.1, 0.5], [], page, 12)).toEqual([]);
  });
});
