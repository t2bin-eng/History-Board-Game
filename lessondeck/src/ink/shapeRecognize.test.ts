import { describe, expect, it } from "vitest";
import { recognizeShape, type Pt } from "./shapeRecognize";

// 손으로 그린 듯한 점: 꼭짓점 사이를 촘촘히 잇고 떨림을 더한다 (같은 결과가 나오게 고정된 난수)
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
}

function drawn(vertices: Pt[], { closed = true, jitter = 2.5, seed = 7, step = 4 } = {}): Pt[] {
  const r = rng(seed);
  const loop = closed ? [...vertices, vertices[0]] : vertices;
  const out: Pt[] = [];
  for (let i = 1; i < loop.length; i++) {
    const [a, b] = [loop[i - 1], loop[i]];
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n + r() * jitter, a[1] + ((b[1] - a[1]) * k) / n + r() * jitter]);
  }
  out.push(loop[loop.length - 1]);
  return out;
}

function ellipsePts(cx: number, cy: number, a: number, b: number, rotDeg = 0, startDeg = 30, sweep = 370): Pt[] {
  const t = (rotDeg * Math.PI) / 180;
  const out: Pt[] = [];
  for (let d = startDeg; d <= startDeg + sweep; d += 4) {
    const s = (d * Math.PI) / 180;
    const x = Math.cos(s) * a;
    const y = Math.sin(s) * b;
    out.push([cx + x * Math.cos(t) - y * Math.sin(t), cy + x * Math.sin(t) + y * Math.cos(t)]);
  }
  return drawn(out, { closed: false, jitter: 3 });
}

describe("손으로 그린 도형 알아보기", () => {
  it("원 (시작점을 조금 지나쳐도)", () => {
    const g = recognizeShape(ellipsePts(300, 300, 100, 96))!;
    expect(g.kind).toBe("ellipse");
    expect(g.w).toBeCloseTo(g.h, 5);
    expect(g.w).toBeGreaterThan(180);
    expect(g.w).toBeLessThan(220);
    expect(Math.abs(g.cx - 300)).toBeLessThan(8);
  });

  it("기운 타원", () => {
    const g = recognizeShape(ellipsePts(300, 300, 160, 70, 30))!;
    expect(g.kind).toBe("ellipse");
    expect(g.w / g.h).toBeGreaterThan(1.8);
    expect(Math.abs(g.rot - 30)).toBeLessThan(6);
  });

  it("사각형·정사각형·기운 사각형", () => {
    const rect = recognizeShape(drawn([[100, 100], [400, 100], [400, 260], [100, 260]]))!;
    expect(rect).toMatchObject({ kind: "rect", rot: 0 });
    expect(Math.abs(rect.w - 300)).toBeLessThan(12);
    expect(Math.abs(rect.h - 160)).toBeLessThan(12);
    const sq = recognizeShape(drawn([[100, 100], [300, 104], [296, 300], [102, 296]]))!;
    expect(sq.kind).toBe("rect");
    expect(sq.w).toBeCloseTo(sq.h, 5);
    const t = (20 * Math.PI) / 180;
    const rot = (x: number, y: number): Pt => [300 + x * Math.cos(t) - y * Math.sin(t), 300 + x * Math.sin(t) + y * Math.cos(t)];
    const tilted = recognizeShape(drawn([rot(-150, -80), rot(150, -80), rot(150, 80), rot(-150, 80)]))!;
    expect(tilted.kind).toBe("rect");
    expect(Math.abs(tilted.rot - 20)).toBeLessThan(4);
  });

  it("삼각형: 바로 선 이등변은 triangle, 그 밖은 꼭짓점 그대로", () => {
    const iso = recognizeShape(drawn([[250, 100], [400, 330], [100, 332]]))!;
    expect(iso).toMatchObject({ kind: "triangle", rot: 0 });
    const any = recognizeShape(drawn([[120, 120], [420, 200], [180, 360]]))!;
    expect(any.kind).toBe("polygon");
    expect(any.pts).toHaveLength(3);
  });

  it("마름모·오각형·육각형·별", () => {
    expect(recognizeShape(drawn([[250, 80], [380, 250], [250, 420], [120, 250]]))!.kind).toBe("diamond");
    const poly = (n: number, start: number, R = 140, radii = [1]) =>
      Array.from({ length: n }, (_, i): Pt => {
        const a = ((start + (360 / n) * i) * Math.PI) / 180;
        const r = R * radii[i % radii.length];
        return [300 + Math.cos(a) * r, 300 + Math.sin(a) * r];
      });
    const penta = recognizeShape(drawn(poly(5, -90)))!;
    expect(penta).toMatchObject({ kind: "pentagon", rot: 0 });
    expect(Math.abs(penta.cy - 300 + 0.0955 * 140)).toBeLessThan(10);
    expect(recognizeShape(drawn(poly(6, 0)))!).toMatchObject({ kind: "hexagon", rot: 0 });
    // 한 번에 그리는 별(오각별): 꼭짓점을 하나 건너 이어서
    const p5 = poly(5, -90);
    const star = recognizeShape(drawn([p5[0], p5[2], p5[4], p5[1], p5[3]]))!;
    expect(star).toMatchObject({ kind: "star", rot: 0 });
    // 테두리로 그린 별(꼭짓점 10개)
    expect(recognizeShape(drawn(poly(10, -90, 140, [1, 0.42])))!.kind).toBe("star");
  });

  it("화살표 (한 번에 그린 줄기 + 날개), 열린 선은 null", () => {
    const g = recognizeShape(drawn([[100, 300], [400, 300], [350, 270], [400, 300], [352, 334]], { closed: false }))!;
    expect(g.kind).toBe("arrow");
    expect(Math.abs(g.w - 300)).toBeLessThan(10);
    expect(Math.abs(g.rot)).toBeLessThan(3);
    expect(recognizeShape(drawn([[100, 300], [250, 320], [400, 300]], { closed: false }))).toBeNull();
    expect(recognizeShape(drawn([[100, 100], [300, 100], [300, 300]], { closed: false }))).toBeNull();
  });

  it("떨림이 큰 손그림도 (여러 번)", () => {
    const kinds = { ellipse: 0, rect: 0, tri: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const r = rng(seed * 13);
      const circle: Pt[] = [];
      for (let d = 0; d <= 365; d += 5) {
        const a = (d * Math.PI) / 180;
        const rr = 90 + r() * 10;
        circle.push([200 + Math.cos(a) * rr + r() * 4, 200 + Math.sin(a) * rr + r() * 4]);
      }
      if (recognizeShape(circle)?.kind === "ellipse") kinds.ellipse++;
      if (recognizeShape(drawn([[100, 100], [330, 106], [326, 250], [96, 246]], { jitter: 6, seed }))?.kind === "rect") kinds.rect++;
      const tri = recognizeShape(drawn([[220, 90], [360, 300], [80, 296]], { jitter: 6, seed }));
      if (tri && (tri.kind === "triangle" || tri.pts?.length === 3)) kinds.tri++;
    }
    expect(kinds.ellipse).toBeGreaterThanOrEqual(19);
    expect(kinds.rect).toBeGreaterThanOrEqual(18);
    expect(kinds.tri).toBeGreaterThanOrEqual(18);
  });
});
