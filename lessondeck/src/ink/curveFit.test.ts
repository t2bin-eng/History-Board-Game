import { describe, expect, it } from "vitest";
import { bezier, recognizeCurve, type Pt } from "./curveFit";
import { bendCurve, curveMid, curveSpec, lineEnds, shapePathsPx } from "./shapes";

const page = { width: 1000, height: 700 };

/** 흔들림 (같은 값이 나오게 정해진 수열) */
function jitter(pts: Pt[], amp: number): Pt[] {
  return pts.map(([x, y], i) => [x + Math.sin(i * 1.7) * amp, y + Math.cos(i * 2.3) * amp]);
}

/** 중심 c, 반지름 r, 각도 a0→a1(도)의 호 */
function arc(c: Pt, r: number, a0: number, a1: number, n = 60): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  });
}

describe("곡선 보정 (v0.24)", () => {
  it("휘어지게 그은 선 → 매끈한 곡선 하나 (끝은 그대로, 그린 자리를 지남)", () => {
    const drawn = jitter(arc([300, 400], 200, 200, 340), 1.5);
    const g = recognizeCurve(drawn)!;
    expect(g).not.toBeNull();
    expect(g.kind).toBe("line");
    expect(g.straight).toBe(false);
    expect(g.a[0]).toBeCloseTo(drawn[0][0], 0);
    expect(g.b[1]).toBeCloseTo(drawn[drawn.length - 1][1], 0);
    // 곡선 가운데가 호 꼭대기 근처 (300, 200)
    const mid = bezier(g.a, g.c1, g.c2, g.b, 0.5);
    expect(Math.hypot(mid[0] - 300, mid[1] - 200)).toBeLessThan(8);
    // 도형 획으로: 곡선 값이 생기고, 그리는 선이 그 곡선을 따라감
    const spec = curveSpec("line", g.a, g.b, g.c1, g.c2, page);
    expect(spec.curve).toBeDefined();
    const [path] = shapePathsPx(spec, page, 3);
    const top = path.reduce((m, p) => (p[1] < m[1] ? p : m));
    expect(Math.abs(top[1] - 200)).toBeLessThan(8);
    const ends = lineEnds(spec, page);
    expect(ends[0][0]).toBeCloseTo(g.a[0], 0);
  });

  it("S자도 곡선 하나로, 거의 곧은 선은 곧게", () => {
    const s: Pt[] = Array.from({ length: 61 }, (_, i) => [100 + i * 8, 300 + Math.sin((i / 60) * Math.PI * 2) * 60]);
    const g = recognizeCurve(jitter(s, 1))!;
    expect(g?.straight).toBe(false);
    const wobbly: Pt[] = Array.from({ length: 61 }, (_, i) => [100 + i * 8, 300 + Math.sin(i * 0.9) * 4]);
    expect(recognizeCurve(wobbly)?.straight).toBe(true);
    // 물결 획(줄기 길이의 6% 출렁임) → 곧게 (멈춘 뒤 끝이 펜을 따라오는 직선)
    const wave6: Pt[] = Array.from({ length: 21 }, (_, i) => [100 + i * 10, 200 + Math.sin(i) * 12]);
    expect(recognizeCurve(wave6)?.straight ?? true).toBe(true);
  });

  it("글씨·지그재그·고리는 곡선이 아님 (null → 예전처럼 직선)", () => {
    const zig: Pt[] = [];
    for (let i = 0; i <= 8; i++) zig.push([100 + i * 50, i % 2 ? 380 : 300]);
    const dense = zig.flatMap((p, i) => (i ? Array.from({ length: 10 }, (_, k): Pt => [zig[i - 1][0] + ((p[0] - zig[i - 1][0]) * (k + 1)) / 10, zig[i - 1][1] + ((p[1] - zig[i - 1][1]) * (k + 1)) / 10]) : [p]));
    expect(recognizeCurve(dense)).toBeNull();
    const loop = arc([300, 300], 80, 0, 300).concat(arc([300, 300], 80, 300, 330).map(([x, y]): Pt => [x + 150, y]));
    expect(recognizeCurve(arc([300, 300], 80, 0, 340))).toBeNull();
    // 글씨 같은 짧은 지그재그 (자동 도형 모드에서 쓴 그대로 남아야)
    expect(recognizeCurve([[80, 600], [90, 590], [95, 610], [105, 595], [110, 612], [120, 598]])).toBeNull();
    const wave: Pt[] = Array.from({ length: 80 }, (_, i) => [100 + i * 5, 300 + Math.sin(i / 4) * 25]);
    expect(recognizeCurve(wave)).toBeNull();
    expect(recognizeCurve(loop)).toBeNull();
  });

  it("휜 화살표: 끝에서 되꺾인 날개 → 줄기만 곡선, 촉은 곡선이 끝나는 방향", () => {
    const shaft = arc([400, 500], 250, 200, 300, 50);
    const tip = shaft[shaft.length - 1];
    // 줄기 끝 방향 (호의 접선)
    const t = shaft[shaft.length - 1];
    const prev = shaft[shaft.length - 3];
    const d = Math.hypot(t[0] - prev[0], t[1] - prev[1]);
    const ux = (t[0] - prev[0]) / d;
    const uy = (t[1] - prev[1]) / d;
    const wing = (sign: 1 | -1): Pt => [tip[0] - ux * 30 + sign * -uy * 18, tip[1] - uy * 30 + sign * ux * 18];
    const line = (a: Pt, b: Pt, n = 8): Pt[] => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * (i + 1)) / n, a[1] + ((b[1] - a[1]) * (i + 1)) / n]);
    const w1 = wing(1);
    const w2 = wing(-1);
    const drawn = [...shaft, ...line(tip, w1), ...line(w1, tip), ...line(tip, w2)];
    const g = recognizeCurve(drawn)!;
    expect(g.kind).toBe("arrow");
    expect(g.straight).toBe(false);
    expect(Math.hypot(g.b[0] - tip[0], g.b[1] - tip[1])).toBeLessThan(6);
    const spec = curveSpec("arrow", g.a, g.b, g.c1, g.c2, page);
    const [, head] = shapePathsPx(spec, page, 3);
    // 날개 두 점의 가운데가 촉 끝에서 줄기 쪽(뒤)으로
    const back: Pt = [(head[0][0] + head[2][0]) / 2 - g.b[0], (head[0][1] + head[2][1]) / 2 - g.b[1]];
    expect(back[0] * ux + back[1] * uy).toBeLessThan(0);
  });

  it("휘기 손잡이: 곧은 선 가운데를 끌면 그 자리를 지나는 곡선, 다시 제자리면 곧게", () => {
    const spec = curveSpec("arrow", [100, 300], [500, 300], [233, 300], [367, 300], page);
    expect(spec.curve).toBeUndefined();
    expect(curveMid(spec, page)[0]).toBeCloseTo(300, 3);
    const bent = { ...spec, curve: bendCurve(spec, [300, 380], page) };
    expect(bent.curve).toBeDefined();
    const mid = curveMid(bent, page);
    expect(mid[0]).toBeCloseTo(300, 3);
    expect(mid[1]).toBeCloseTo(380, 1);
    expect(bendCurve(bent, [300, 300], page)).toBeUndefined();
  });
});
