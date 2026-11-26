// 필기감 회귀 시험 (v0.47.2): 실제 S펜 흉내 입력(240Hz, 종 모양 속도, 8~11Hz 손떨림 + 센서 잡음, 필압)을
// 앱과 같은 길(떨림 거르기 → 갈고리 자르기 → 필기 보정 → perfect-freehand)로 그려 모양을 잰다. SPEC 검증 기록 "필기감 회귀 시험"
import { getStrokePoints } from "perfect-freehand";
import { describe, expect, it } from "vitest";
import { beautifyStroke } from "./beautify";
import { guessHoldShape } from "./holdShape";
import { strokeOptions } from "./geometry";
import { keepPoint, SMOOTH_V2, smoothPoints, stabilizeOf, trimHooks, trimSlips, type Dropped } from "./smoothing";
import type { InkPoint, Stroke } from "./types";

const page = { width: 1000, height: 1414 };
type P = [number, number];

// ── 결정적 난수 ──
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gauss = () => {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

/** 기준 길(조밀한 점) → 펜 표본: 240Hz, 속도는 시작·끝에서 느리고 가운데 빠름, 떨림(8~11Hz 흔들림 + 센서 잡음) */
function penSamples(path: P[], opts: { speed: number; tremor: number; noise: number; hz?: number }): { x: number; y: number; t: number; p: number }[] {
  const hz = opts.hz ?? 240;
  const seg: number[] = [0];
  for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const L = seg[seg.length - 1];
  // 속도 모양: sin 종 모양, 평균 speed (px/ms)
  const T = L / opts.speed; // ms
  const out: { x: number; y: number; t: number; p: number }[] = [];
  const phase = rand() * 6;
  for (let t = 0; t <= T + 1e-6; t += 1000 / hz) {
    const u = t / T;
    const s = L * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI)); // 종 모양 속도의 적분
    let k = 1;
    while (k < seg.length - 1 && seg[k] < s) k++;
    const f = (s - seg[k - 1]) / Math.max(1e-9, seg[k] - seg[k - 1]);
    const x = path[k - 1][0] + (path[k][0] - path[k - 1][0]) * f;
    const y = path[k - 1][1] + (path[k][1] - path[k - 1][1]) * f;
    const tr = opts.tremor * Math.sin((2 * Math.PI * 9.5 * t) / 1000 + phase);
    const tr2 = opts.tremor * Math.cos((2 * Math.PI * 8.3 * t) / 1000 + phase * 1.7);
    out.push({ x: x + tr + gauss() * opts.noise, y: y + tr2 + gauss() * opts.noise, t, p: 0.35 + 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.2)) });
  }
  return out;
}

/** InkCanvas와 같은 길: 떨림 거르기(keepPoint) + 뗄 때 남은 점 + 필기 보정 → 획 */
function writeStroke(samples: { x: number; y: number; p: number }[], o: { width?: number; beautify?: boolean; level?: 1 | 2 | 3 | 4; zoom?: number } = {}): Stroke {
  const zoom = o.zoom ?? 1;
  const tol = stabilizeOf(o.level ?? 2).tol;
  const r = stabilizeOf(o.level ?? 2).radius;
  const pts: InkPoint[] = [[samples[0].x / page.width, samples[0].y / page.height, samples[0].p]];
  let dropped: Dropped | null = null;
  let pending: InkPoint | null = null;
  const scr = (q: InkPoint) => ({ x: q[0] * page.width * zoom, y: q[1] * page.height * zoom });
  for (const s of samples.slice(1)) {
    const pt: InkPoint = [s.x / page.width, s.y / page.height, s.p];
    const n = pts.length;
    const judged = keepPoint(n > 1 ? scr(pts[n - 2]) : null, scr(pts[n - 1]), scr(pt), dropped, tol);
    dropped = judged.dropped;
    if (!judged.keep) {
      pending = pt;
      continue;
    }
    pending = null;
    pts.push(pt);
  }
  if (pending) pts.push(pending);
  const scr2 = (q: InkPoint): [number, number] => [q[0] * page.width * zoom, q[1] * page.height * zoom];
  // 앱과 같은 길: 갈고리 자르기 → 미끄러짐 혹 (v0.53)
  const trimmed = trimSlips(trimHooks(pts, scr2), scr2, ((o.width ?? 2) * page.width * zoom) / 1000);
  const stroke: Stroke = { id: "s", tool: "pen", color: "#000", width: o.width ?? 2, points: trimmed, smooth: SMOOTH_V2, ...(r !== 2 ? { smoothR: r } : {}) };
  if (o.beautify !== false) {
    const tidy = beautifyStroke(stroke.points, page, (stroke.width * page.width) / 1000, { minSizePx: 24 / zoom });
    if (tidy !== stroke.points) {
      stroke.points = tidy;
      delete stroke.smooth;
      delete stroke.smoothR;
    }
  }
  return stroke;
}

/** 그려지는 가운데 선 (perfect-freehand가 다듬고 streamline을 건 점) */
function centerline(stroke: Stroke, last = true): P[] {
  let pts: InkPoint[] = stroke.points.map(([x, y, p]) => [x * page.width, y * page.height, p]);
  const smoothed = stroke.smooth === SMOOTH_V2;
  if (smoothed) {
    const r = stroke.smoothR ?? 2;
    pts = smoothPoints(pts, r, Math.max(3, r));
  }
  const sizePx = (stroke.width * page.width) / 1000;
  const opts = strokeOptions("pen", sizePx, false, last, smoothed, false, undefined, 0);
  return getStrokePoints(pts, smoothed ? { ...opts, size: 0.01 } : opts).map((q) => q.point as P);
}

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p: P, a: P, b: P) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const polyDist = (p: P, poly: P[]) => {
  let m = Infinity;
  for (let i = 1; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i - 1], poly[i]));
  return poly.length === 1 ? dist(p, poly[0]) : m;
};
const pathLen = (poly: P[]) => poly.slice(1).reduce((s, q, i) => s + dist(q, poly[i]), 0);

/** 기준 길과 그린 선의 차이: 평균·최대 (기준 위 점 → 그린 선), 시작·끝 모자람 */
function fidelity(ref: P[], line: P[]) {
  const d = ref.map((p) => polyDist(p, line));
  return { mean: d.reduce((a, b) => a + b, 0) / d.length, max: Math.max(...d), lenRatio: pathLen(line) / pathLen(ref) };
}

const circle = (cx: number, cy: number, r: number, n = 120, from = -Math.PI / 2): P[] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(from - (i / n) * 2 * Math.PI), cy + r * Math.sin(from - (i / n) * 2 * Math.PI)]);
const lineP = (a: P, b: P, n = 40): P[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);

/** 길이로 고르게 다시 찍기 */
function resample(line: P[], step = 0.5): P[] {
  const out: P[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = dist(a, b);
    let t = step - carry;
    while (t <= d) {
      out.push([a[0] + ((b[0] - a[0]) * t) / d, a[1] + ((b[1] - a[1]) * t) / d]);
      t += step;
    }
    carry = d - (t - step);
  }
  return out;
}

/** 원 모양 고르기: 길이로 고르게 찍은 점의 원 맞춤(중심 = 평균) 반지름 흩어짐 ÷ 반지름 */
function roundness(line0: P[]) {
  const line = resample(line0);
  const cx = line.reduce((s, p) => s + p[0], 0) / line.length;
  const cy = line.reduce((s, p) => s + p[1], 0) / line.length;
  const r = line.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  return sd / m;
}


const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const hand = { tremor: 0.35, noise: 0.25 };

describe("필기감 회귀 시험", () => {
  it("작은 ㅇ(반지름 4~20px)은 둥글고 쓴 자리에서 벗어나지 않는다", () => {
    for (const [r, maxRound] of [
      [4, 0.1],
      [6, 0.06],
      [10, 0.04],
      [20, 0.02],
    ] as const) {
      const round: number[] = [];
      const dev: number[] = [];
      for (let trial = 0; trial < 20; trial++) {
        seed = 100 + trial + r * 31;
        const ref = circle(200, 200, r);
        const line = centerline(writeStroke(penSamples(ref, { speed: 0.12 + r * 0.008, ...hand })));
        round.push(roundness(line));
        dev.push(fidelity(ref, line).mean);
      }
      expect(avg(round)).toBeLessThan(maxRound);
      expect(avg(dev)).toBeLessThan(0.4);
    }
  });

  it("짧은 삐침(3~8px)은 사라지거나 줄지 않는다", () => {
    for (const L of [3, 5, 8]) {
      const ratio: number[] = [];
      for (let trial = 0; trial < 20; trial++) {
        seed = 500 + trial + L * 17;
        const ref = lineP([300, 300], [300 + L, 300]);
        ratio.push(pathLen(centerline(writeStroke(penSamples(ref, { speed: 0.06, ...hand })))) / L);
      }
      expect(avg(ratio)).toBeGreaterThan(0.9);
      expect(avg(ratio)).toBeLessThan(1.35);
    }
  });

  it("ㄱ 모서리는 1px 안으로만 깎인다", () => {
    for (const L of [12, 30]) {
      const cut: number[] = [];
      for (let trial = 0; trial < 20; trial++) {
        seed = 900 + trial + L;
        const ref = [...lineP([400, 400], [400 + L, 400]), ...lineP([400 + L, 400], [400 + L, 400 + L]).slice(1)];
        cut.push(polyDist([400 + L, 400], centerline(writeStroke(penSamples(ref, { speed: 0.15, ...hand })))));
      }
      expect(avg(cut)).toBeLessThan(1);
    }
  });

  it("손떨림 보정 세기가 셀수록 느린 줄의 떨림이 줄어든다", () => {
    const wobble = ([1, 2, 3, 4] as const).map((level) => {
      const v: number[] = [];
      for (let trial = 0; trial < 10; trial++) {
        seed = 1300 + trial;
        const ref = lineP([100, 600], [300, 600], 200);
        const line = centerline(writeStroke(penSamples(ref, { speed: 0.08, tremor: 0.8, noise: 0.35 }), { beautify: false, level })).filter((p) => p[0] > 110 && p[0] < 290);
        v.push(Math.sqrt(line.reduce((s, p) => s + (p[1] - 600) ** 2, 0) / line.length));
      }
      return avg(v);
    });
    expect(wobble[1]).toBeLessThan(0.7);
    expect(wobble[3]).toBeLessThan(0.3);
    expect(wobble[3]).toBeLessThan(wobble[2]);
    expect(wobble[2]).toBeLessThan(wobble[1]);
  });

  it("쓰는 중 그린 끝이 펜 끝을 1.5px 안으로 따라온다", () => {
    seed = 77;
    const ref = lineP([100, 800], [600, 800], 500);
    const s = penSamples(ref, { speed: 1.2, tremor: 0.2, noise: 0.2 });
    for (let n = 20; n < s.length - 5; n += 5) {
      const line = centerline(writeStroke(s.slice(0, n), { beautify: false }), false);
      expect(dist(line[line.length - 1], [s[n - 1].x, s[n - 1].y])).toBeLessThan(1.5);
    }
  });

  it("뗄 때 갈고리(2·4px)와 댈 때 미끄러짐을 잘라 낸다 (v0.47.2 — 전에는 갈고리만큼 그대로)", () => {
    for (const hook of [2, 4]) {
      const side: number[] = [];
      for (let trial = 0; trial < 20; trial++) {
        seed = 2000 + trial + hook;
        const smp = penSamples(lineP([100, 1000], [140, 1000], 40), { speed: 0.25, ...hand });
        const last = smp[smp.length - 1];
        for (let k = 1; k <= 3; k++) smp.push({ x: last.x + 0.4 * k, y: last.y + (hook * k) / 3, t: last.t + k * 4, p: 0.25 - 0.07 * k });
        const line = centerline(writeStroke(smp));
        side.push(Math.abs(line[line.length - 1][1] - 1000));
      }
      expect(avg(side)).toBeLessThan(0.6);
    }
    const slip: number[] = [];
    for (let trial = 0; trial < 20; trial++) {
      seed = 2500 + trial;
      const smp = penSamples(lineP([100, 1100], [130, 1100], 30), { speed: 0.2, ...hand });
      const first = smp[0];
      const headPts = [1, 2, 3].map((k) => ({ x: first.x - 0.5 * k, y: first.y - 2.5 * Math.sin((k / 3) * Math.PI) - 0.3, t: 0, p: 0.08 * k }));
      const line = centerline(writeStroke([{ ...first, y: first.y - 0.2, p: 0.05 }, ...headPts, ...smp]));
      slip.push(Math.max(...line.slice(0, 8).map((p) => Math.abs(p[1] - 1100))));
    }
    expect(avg(slip)).toBeLessThan(0.8);
  });

  it("일부러 짧게 꺾은 끝(작은 ㄴ·ㅁ·2)은 끝에서 힘을 빼도 자르지 않는다", () => {
    const shapes: P[][] = [
      [...lineP([500, 500], [500, 508], 16), ...lineP([500, 508], [504, 508], 8).slice(1)],
      [...lineP([600, 500], [600, 506], 12), ...lineP([600, 506], [606, 506], 12).slice(1), ...lineP([606, 506], [606, 500], 12).slice(1), ...lineP([606, 500], [601, 500], 10).slice(1)],
    ];
    for (const ref of shapes) {
      for (let trial = 0; trial < 30; trial++) {
        seed = 4000 + trial;
        const smp = penSamples(ref, { speed: 0.08, ...hand });
        const k0 = Math.floor(smp.length * 0.75);
        for (let k = k0; k < smp.length; k++) smp[k].p = Math.min(smp[k].p, 0.5 - (0.4 * (k - k0)) / Math.max(1, smp.length - 1 - k0));
        const line = centerline(writeStroke(smp, { beautify: false }));
        expect(dist(line[line.length - 1], ref[ref.length - 1])).toBeLessThan(1.5);
      }
    }
  });
});

// ── 흘림·날림 글씨 (v0.51): 이어 쓰고 끝을 날린 한글이 펜을 떼거나 멈춘 뒤 모양이 바뀌지 않는다 ──

/** 손글씨 흉내: 점들을 지나는 부드러운 곡선(Catmull-Rom), sharp 번호의 점은 뾰족하게 */
function cursive(ctrl: P[], sharp: number[], k: number, n = 16): P[] {
  const out: P[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const m1: P = sharp.includes(i) ? [0, 0] : [(p2[0] - p0[0]) / 2, (p2[1] - p0[1]) / 2];
    const m2: P = sharp.includes(i + 1) ? [0, 0] : [(p3[0] - p1[0]) / 2, (p3[1] - p1[1]) / 2];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
      const h10 = t ** 3 - 2 * t ** 2 + t;
      const h01 = -2 * t ** 3 + 3 * t ** 2;
      const h11 = t ** 3 - t ** 2;
      out.push([h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0], h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1]]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out.map(([x, y]) => [300 + x * k, 300 + y * k]);
}

const CURSIVE: [string, P[], number[]][] = [
  ["흘림 가", [[0, 0], [22, 0], [8, 30], [30, -4], [32, 40], [32, 18], [44, 18]], [1, 4]],
  ["흘림 ㄹ", [[0, 0], [22, 1], [21, 9], [1, 9], [0, 18], [24, 18]], []],
  ["흘림 는", [[0, 0], [1, 16], [18, 16], [4, 26], [26, 26], [10, 32], [10, 46], [30, 46]], [1]],
  ["ㅅ 날림", [[14, 0], [6, 14], [0, 24], [8, 20]], [2]],
  ["ㄱ 날림", [[0, 0], [26, 0], [22, 18], [14, 30], [9, 33]], [1]],
  ["ㅣ 삐침", [[0, 0], [0, 36], [-5, 31]], [1]],
  ["흘림 을", [[10, 0], [0, 6], [8, 14], [18, 6], [8, 0], [-4, 20], [30, 20], [6, 28], [26, 28], [26, 34], [6, 34], [6, 40], [30, 40]], []],
  ["살짝 휜 ㅡ", [[0, 0], [30, -3], [60, -2], [90, 3]], []],
];

describe("흘림·날림 글씨 (v0.51)", () => {
  /** 끝 15%에서 힘을 빼며 날려 쓴 펜 표본 */
  const flicked = (ref: P[], k: number, trial: number) => {
    seed = 6000 + trial * 13 + k;
    const smp = penSamples(ref, { speed: 0.35 * k, tremor: 0.25, noise: 0.15 });
    smp.forEach((s, i) => {
      const u = i / smp.length;
      if (u > 0.85) s.p *= Math.max(0.15, 1 - (u - 0.85) * 5);
    });
    return smp;
  };

  it("필기 보정이 이어 쓴 글씨를 비틀지 않는다: 쓴 길과 그린 선의 평균 차이가 보정을 끈 것과 0.25px 안 (0.50까지 흘림 '가' 1.9px·살짝 휜 ㅡ 3.9px)", () => {
    for (const [name, ctrl, sharp] of CURSIVE) {
      for (const k of [1, 2]) {
        const ref = cursive(ctrl, sharp, k);
        const off: number[] = [];
        const on: number[] = [];
        for (let trial = 0; trial < 6; trial++) {
          const smp = flicked(ref, k, trial);
          off.push(fidelity(ref, centerline(writeStroke(smp, { beautify: false }))).mean);
          on.push(fidelity(ref, centerline(writeStroke(smp))).mean);
        }
        expect(avg(on), `${name} ×${k}`).toBeLessThan(avg(off) + 0.25);
      }
    }
  });

  it("끝을 날려 쓴 ㅅ·ㅣ 삐침은 잘리지 않는다 (꺾을 때 아직 눌려 있음)", () => {
    for (const [name, ctrl, sharp] of CURSIVE.filter(([n]) => n.includes("날림") || n.includes("삐침"))) {
      const ref = cursive(ctrl, sharp, 1);
      for (let trial = 0; trial < 10; trial++) {
        const line = centerline(writeStroke(flicked(ref, 1, trial), { beautify: false }));
        expect(dist(line[line.length - 1], ref[ref.length - 1]), `${name} ${trial}`).toBeLessThan(2);
      }
    }
  });

  it("흘려 쓰다 멈춰도 도형·곡선·직선으로 바뀌지 않고, 손그림 도형은 그대로 알아본다", () => {
    for (const [name, ctrl, sharp] of CURSIVE.filter(([n]) => !n.includes("ㅡ"))) {
      for (const k of [1, 2, 3]) {
        seed = 77 + k;
        const px = cursive(ctrl, sharp, k).map(([x, y]) => [x + gauss() * 0.4, y + gauss() * 0.4] as P);
        expect(guessHoldShape(px, page, 2, true), `${name} ×${k}`).toBeNull();
      }
    }
    const jit = (pts: P[]) => {
      seed = 5;
      return pts.map(([x, y]) => [x + gauss() * 0.5, y + gauss() * 0.5] as P);
    };
    const circle = (r: number) => Array.from({ length: 73 }, (_, i): P => {
      const t = (i / 72) * 2 * Math.PI * 1.04;
      return [300 + r * Math.cos(t) * (1 + 0.04 * Math.sin(3 * t)), 300 + r * 0.9 * Math.sin(t)];
    });
    const rect = cursive([[0, 0], [80, 2], [79, 50], [-1, 49], [1, 3]], [1, 2, 3], 1, 12);
    const tri = cursive([[40, 0], [80, 60], [0, 58], [38, 2]], [1, 2], 1, 14);
    const straight = cursive([[0, 0], [60, 2], [120, 1]], [], 1, 20);
    const arrow = [...cursive([[0, 0], [120, 4]], [], 1, 30), ...cursive([[120, 4], [104, -8]], [], 1, 6).slice(1), ...cursive([[104, -8], [120, 4]], [], 1, 6).slice(1), ...cursive([[120, 4], [103, 15]], [], 1, 6).slice(1)];
    const bent = cursive([[0, 40], [50, 0], [110, 30]], [], 1, 20);
    const kind = (h: ReturnType<typeof guessHoldShape>) => (!h ? null : h.type === "line" ? "line" : h.type === "curve" ? `curve-${h.spec.kind}` : h.spec.kind);
    expect(kind(guessHoldShape(jit(circle(40)), page, 2, true))).toBe("ellipse");
    expect(kind(guessHoldShape(jit(circle(80)), page, 2, true))).toBe("ellipse");
    expect(kind(guessHoldShape(jit(rect), page, 2, true))).toBe("rect");
    expect(kind(guessHoldShape(jit(tri), page, 2, true))).toBe("triangle");
    expect(kind(guessHoldShape(jit(straight), page, 2, true))).toBe("line");
    expect(kind(guessHoldShape(jit(arrow), page, 2, true))).toBe("arrow");
    expect(kind(guessHoldShape(jit(bent), page, 2, true))).toBe("curve-line");
  });
});
