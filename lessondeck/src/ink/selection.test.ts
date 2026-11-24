import { describe, expect, it } from "vitest";
import { makeShapeStroke, lineEnds } from "./shapes";
import {
  applyAffine,
  frameAffine,
  frameOf,
  insideRatio,
  lassoSelect,
  pasteAffine,
  pointInPolygon,
  recolorStrokes,
  reorderStrokes,
  resizeFrame,
  rewidthStrokes,
  rotateFrame,
  strokeAtPx,
  transformStrokes,
  type Pt,
  type SelFrame,
} from "./selection";
import type { Stroke } from "./types";

const page = { width: 1000, height: 1400 };
const line = (id: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<Stroke> = {}): Stroke => ({
  id,
  tool: "pen",
  color: "#111111",
  width: 2,
  points: Array.from({ length: 11 }, (_, i) => [(x0 + ((x1 - x0) * i) / 10) / page.width, (y0 + ((y1 - y0) * i) / 10) / page.height, 0.5]),
  ...extra,
});
const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const close = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("올가미 고르기", () => {
  it("다각형 안팎", () => {
    const sq = square(0, 0, 10, 10);
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
    // 오목한 ㄷ자 안쪽 빈 곳은 밖
    const c: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 3],
      [3, 3],
      [3, 7],
      [10, 7],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon(6, 5, c)).toBe(false);
    expect(pointInPolygon(1, 5, c)).toBe(true);
  });

  it("절반 넘게 든 획만 고른다 (길이 기준)", () => {
    const inside = line("a", 120, 120, 180, 180);
    const half = line("b", 150, 300, 350, 300); // 100~200 안: 50/200 = 25%
    const most = line("c", 110, 250, 230, 250); // 110~200 안: 90/120 = 75%
    const out = line("d", 500, 500, 600, 600);
    const poly = square(100, 100, 200, 400);
    expect(insideRatio(half, poly, page)).toBeLessThan(0.3);
    expect(insideRatio(most, poly, page)).toBeGreaterThan(0.7);
    expect(lassoSelect([inside, half, most, out], poly, page)).toEqual(["a", "c"]);
  });

  it("점 하나짜리 획·도형도", () => {
    const dot: Stroke = { id: "dot", tool: "pen", color: "#000", width: 3, points: [[0.15, 0.15, 0.5]] };
    const rect = makeShapeStroke("r", { kind: "rect", cx: 0.15, cy: 0.15, w: 0.05, h: 0.05, rot: 0 }, { tool: "pen", color: "#000", width: 2 }, page);
    expect(lassoSelect([dot, rect], square(100, 150, 220, 260), page)).toEqual(["dot", "r"]);
  });

  it("점이 셋보다 적은 올가미는 아무것도 고르지 않는다", () => {
    expect(lassoSelect([line("a", 0, 0, 10, 10)], [[0, 0], [5, 5]], page)).toEqual([]);
  });

  it("톡: 그 자리의 맨 위 획", () => {
    const a = line("a", 100, 100, 300, 100);
    const b = line("b", 100, 104, 300, 104);
    expect(strokeAtPx([a, b], 200, 102, page, 6)?.id).toBe("b");
    expect(strokeAtPx([a, b], 200, 160, page, 6)).toBeNull();
  });
});

describe("틀과 변환", () => {
  it("틀은 굵기 절반 + 여백", () => {
    const f = frameOf([line("a", 100, 200, 300, 200)], page)!;
    close(f.cx, 200);
    close(f.cy, 200);
    close(f.w, 200 + 2 + 16);
    // 가로선: 높이는 굵기 + 여백
    close(f.h, 2 + 16);
  });

  it("옮기기: 점이 그만큼 옮겨지고 굵기는 그대로", () => {
    const s = line("a", 100, 200, 300, 200);
    const f0 = frameOf([s], page)!;
    const m = frameAffine(f0, { ...f0, cx: f0.cx + 50, cy: f0.cy - 20 });
    const [t] = transformStrokes([s], m, page);
    close(t.points[0][0] * page.width, 150);
    close(t.points[0][1] * page.height, 180);
    expect(t.width).toBe(2);
    expect(t.id).toBe("a");
  });

  it("고르게 두 배: 굵기도 두 배, 다른 값은 그대로", () => {
    const s = line("a", 100, 200, 300, 200, { smooth: 2, smoothR: 4, nib: "fountain", opacity: 0.6, fixedWidth: true });
    const f0: SelFrame = { cx: 200, cy: 200, w: 200, h: 100, rot: 0 };
    const m = frameAffine(f0, { cx: 200, cy: 200, w: 400, h: 200, rot: 0 });
    const [t] = transformStrokes([s], m, page);
    close(t.points[0][0] * page.width, 0);
    close(t.points[10][0] * page.width, 400);
    expect(t.width).toBe(4);
    expect([t.smooth, t.smoothR, t.nib, t.opacity, t.fixedWidth]).toEqual([2, 4, "fountain", 0.6, true]);
    // 필압 그대로
    expect(t.points[3][2]).toBe(0.5);
  });

  it("90° 돌리기: 가로선이 세로선", () => {
    const s = line("a", 100, 200, 300, 200);
    const f0: SelFrame = { cx: 200, cy: 200, w: 220, h: 20, rot: 0 };
    const m = frameAffine(f0, { ...f0, rot: 90 });
    const [t] = transformStrokes([s], m, page);
    close(t.points[0][0] * page.width, 200);
    close(t.points[0][1] * page.height, 100);
    close(t.points[10][1] * page.height, 300);
  });

  it("돌린 틀을 다시 키워도 틀 축으로", () => {
    const f0: SelFrame = { cx: 0, cy: 0, w: 100, h: 50, rot: 90 };
    // 돌린 틀의 가로(화면 세로)만 두 배
    const m = frameAffine(f0, { ...f0, w: 200 });
    const [x, y] = applyAffine(m, 0, 50); // 틀의 가로 끝 (돌아서 아래)
    close(x, 0);
    close(y, 100);
    const [x2, y2] = applyAffine(m, 25, 0); // 틀의 세로 끝 (돌아서 왼쪽이 아닌 오른쪽) — 그대로
    close(x2, 25);
    close(y2, 0);
  });

  it("도형: 선은 두 끝을, 사각형은 중심·크기·회전을", () => {
    const style = { tool: "pen" as const, color: "#000", width: 2 };
    const ln = makeShapeStroke("l", { kind: "arrow", cx: 0.2, cy: 0.2, w: 0.2, h: 0, rot: 0, head: "tri", curve: [-0.2, 0.3, 0.2, 0.3] }, style, page);
    const rc = makeShapeStroke("r", { kind: "rect", cx: 0.5, cy: 0.5, w: 0.1, h: 0.05, rot: 0 }, style, page);
    const m = frameAffine({ cx: 0, cy: 0, w: 100, h: 100, rot: 0 }, { cx: 0, cy: 0, w: 100, h: 100, rot: 90 });
    const [l2, r2] = transformStrokes([ln, rc], m, page);
    const [a, b] = lineEnds(l2.shape!, page);
    // 도형 값은 소수 넷째 자리로 저장 (0.1~0.2px)
    close(a[0], -280, 0.2);
    close(a[1], 100, 0.2);
    close(b[0], -280, 0.2);
    close(b[1], 300, 0.2);
    expect(l2.shape!.head).toBe("tri");
    expect(l2.shape!.curve).toEqual([-0.2, 0.3, 0.2, 0.3]);
    close(r2.shape!.rot, 90);
    close(r2.shape!.w, 0.1, 1e-4);
    close(r2.shape!.cx * page.width, -700);
    // 점도 새 모양으로 다시 만든다
    expect(r2.points).not.toEqual(rc.points);
  });

  it("도형을 한쪽으로만 늘이면 그 축만 커진다", () => {
    const rc = makeShapeStroke("r", { kind: "ellipse", cx: 0.2, cy: 0.2, w: 0.1, h: 0.1, rot: 0 }, { tool: "pen", color: "#000", width: 2 }, page);
    const m = frameAffine({ cx: 200, cy: 280, w: 100, h: 100, rot: 0 }, { cx: 250, cy: 280, w: 200, h: 100, rot: 0 });
    const [t] = transformStrokes([rc], m, page);
    close(t.shape!.w, 0.2, 1e-4);
    close(t.shape!.h, 0.1, 1e-4);
    close(t.shape!.cx * page.width, 250);
    // 굵기는 넓이 배율의 제곱근 (√2)
    close(t.width, 2 * Math.SQRT2, 0.01);
  });
});

describe("손잡이", () => {
  const f0: SelFrame = { cx: 100, cy: 100, w: 100, h: 50, rot: 0 };
  it("모서리는 비율 그대로, 맞은편 모서리 고정", () => {
    const f = resizeFrame(f0, "se", [250, 160]);
    close(f.w / f.h, 2);
    // 맞은편(nw) 모서리 50, 75 그대로
    close(f.cx - f.w / 2, 50);
    close(f.cy - f.h / 2, 75);
    expect(f.w).toBeGreaterThan(100);
  });
  it("변은 그 방향만", () => {
    const f = resizeFrame(f0, "e", [300, 999]);
    close(f.w, 250);
    close(f.h, 50);
    close(f.cx - f.w / 2, 50);
  });
  it("너무 작아지지 않는다", () => {
    const f = resizeFrame(f0, "se", [0, 0]);
    expect(Math.min(f.w, f.h)).toBeGreaterThanOrEqual(11.99);
  });
  it("돌린 틀의 변 손잡이는 돌린 축으로", () => {
    // 90° 돌린 틀의 가로축은 화면 아래: 맞은편 변(y 50) 고정, 끈 자리(y 250)까지
    const f = resizeFrame({ ...f0, rot: 90 }, "e", [100, 250]);
    close(f.w, 200);
    close(f.h, 50);
    close(f.cx, 100);
    close(f.cy, 150);
  });
  it("돌리기: 위 손잡이를 오른쪽으로 끌면 90°", () => {
    const f = rotateFrame(f0, [300, 100], (d) => d);
    close(f.rot, 90);
  });
});

describe("스타일·순서·붙이기", () => {
  it("순서: 맨 앞·맨 뒤 (고른 것끼리 순서 그대로)", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => line(id, 0, 0, 1, 1));
    expect(reorderStrokes([a, b, c, d], ["c", "a"], "front").map((s) => s.id)).toEqual(["b", "d", "a", "c"]);
    expect(reorderStrokes([a, b, c, d], ["d", "b"], "back").map((s) => s.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("색: 펜 필기가 있으면 펜만, 형광펜만이면 형광펜", () => {
    const pen = line("p", 0, 0, 10, 10);
    const hl = line("h", 0, 0, 10, 10, { tool: "highlighter", color: "#fff200", width: 20 });
    const [p2, h2] = recolorStrokes([pen, hl], "#ff1e1e", page);
    expect(p2.color).toBe("#ff1e1e");
    expect(h2).toBe(hl);
    const [h3] = recolorStrokes([hl], "#7dff3a", page);
    expect(h3.color).toBe("#7dff3a");
  });

  it("굵기: 도구 범위 안에서", () => {
    const [t] = rewidthStrokes([line("a", 0, 0, 1, 1, { width: 50 })], 1.25, page);
    expect(t.width).toBe(60);
    const [u] = rewidthStrokes([line("a", 0, 0, 1, 1, { width: 60 })], 1.25, page);
    expect(u.width).toBe(60);
  });

  it("붙이기: 가로 기준으로 크기를 맞추고 누른 자리에 가운데", () => {
    const s = line("a", 100, 200, 300, 200);
    const to = { width: 500, height: 300 };
    const m = pasteAffine([s], page, to, [250, 150], false);
    const [t] = transformStrokes([s], m, page, to);
    // 가로 절반 크기: 100px 길이, 가운데 250
    close(t.points[0][0] * to.width, 200);
    close(t.points[10][0] * to.width, 300);
    close(t.points[5][1] * to.height, 150);
    // 굵기 단위(페이지 가로 1000 기준)는 그대로
    expect(t.width).toBe(2);
  });

  it("붙이기: 같은 페이지면 조금 비켜서", () => {
    const s = line("a", 100, 200, 300, 200);
    const [t] = transformStrokes([s], pasteAffine([s], page, page, null, true), page);
    close(t.points[0][0] * page.width, 130);
    close(t.points[0][1] * page.height, 230);
  });
});
