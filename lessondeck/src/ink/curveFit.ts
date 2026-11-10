// 손으로 그은 곡선 → 매끈한 곡선 (긋다가 멈추면, v0.24, SPEC 6장 "도형 보정").
// 0.23까지는 알아보지 못한 획을 모두 직선으로 바꿔서, 휘어지게 그은 선(밑줄 그은 곳을 가리키는 휜 화살표 등)도 곧아졌다.
// 이제 곧지 않은 획은 두 끝을 지나는 3차 베지어 곡선 하나로 맞춰 본다(Schneider의 곡선 맞추기: 길이 비율로 t를 정하고
// 최소제곱으로 두 조절점을 구한 뒤 뉴턴법으로 t를 다듬음). 끝에서 되꺾인 짧은 날개가 있으면 휜 화살표.
// 곡선 하나로 맞지 않는 획(글씨·낙서)은 null → 그리던 쪽이 예전처럼 직선으로.

export type Pt = [number, number];

export interface CurveGuess {
  kind: "line" | "arrow";
  /** 시작·끝 (페이지 px) */
  a: Pt;
  b: Pt;
  /** 3차 베지어 조절점 (페이지 px). 곧으면 곧은 선의 1/3·2/3 자리 */
  c1: Pt;
  c2: Pt;
  /** 거의 곧음 (직선·곧은 화살표로) */
  straight: boolean;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function smooth(pts: Pt[]): Pt[] {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
}

function cumulative(pts: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + dist(pts[i - 1], pts[i]));
  return out;
}

/** 직선 위 점에서 부호 있는 거리 */
function side(p: Pt, a: Pt, b: Pt): number {
  const l = dist(a, b) || 1;
  return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l;
}

export function bezier(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return [b0 * p0[0] + b1 * c1[0] + b2 * c2[0] + b3 * p3[0], b0 * p0[1] + b1 * c1[1] + b2 * c2[1] + b3 * p3[1]];
}

function bezierD1(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0]),
    3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1]),
  ];
}

function bezierD2(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    6 * u * (c2[0] - 2 * c1[0] + p0[0]) + 6 * t * (p3[0] - 2 * c2[0] + c1[0]),
    6 * u * (c2[1] - 2 * c1[1] + p0[1]) + 6 * t * (p3[1] - 2 * c2[1] + c1[1]),
  ];
}

/** 두 끝을 고정하고 t에 맞는 두 조절점 (최소제곱) */
function fitControls(pts: Pt[], ts: number[], p0: Pt, p3: Pt): [Pt, Pt] {
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  const r1: Pt = [0, 0];
  const r2: Pt = [0, 0];
  pts.forEach((q, i) => {
    const t = ts[i];
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    a11 += b1 * b1;
    a12 += b1 * b2;
    a22 += b2 * b2;
    for (const k of [0, 1]) {
      const r = q[k] - b0 * p0[k] - b3 * p3[k];
      r1[k] += b1 * r;
      r2[k] += b2 * r;
    }
  });
  const det = a11 * a22 - a12 * a12;
  const third = (k: number): Pt => [p0[0] + ((p3[0] - p0[0]) * k) / 3, p0[1] + ((p3[1] - p0[1]) * k) / 3];
  if (Math.abs(det) < 1e-9) return [third(1), third(2)];
  return [
    [(a22 * r1[0] - a12 * r2[0]) / det, (a22 * r1[1] - a12 * r2[1]) / det],
    [(a11 * r2[0] - a12 * r1[0]) / det, (a11 * r2[1] - a12 * r1[1]) / det],
  ];
}

/** 점에서 곡선까지 가장 가까운 거리 (곡선을 촘촘히 찍어 잼) */
function nearest(q: Pt, p0: Pt, c1: Pt, c2: Pt, p3: Pt): number {
  let best = Infinity;
  for (let i = 0; i <= 64; i++) best = Math.min(best, dist(q, bezier(p0, c1, c2, p3, i / 64)));
  return best;
}

/** 점들을 지나는 3차 베지어 하나 (끝 고정). 가장 먼 점까지의 어긋남도 */
export function fitCubic(pts: Pt[]): { c1: Pt; c2: Pt; error: number } {
  const p0 = pts[0];
  const p3 = pts[pts.length - 1];
  const cum = cumulative(pts);
  const total = cum[cum.length - 1] || 1;
  const ts = cum.map((c) => c / total);
  let [c1, c2] = fitControls(pts, ts, p0, p3);
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 1; i < pts.length - 1; i++) {
      const t = ts[i];
      const b = bezier(p0, c1, c2, p3, t);
      const d1 = bezierD1(p0, c1, c2, p3, t);
      const d2 = bezierD2(p0, c1, c2, p3, t);
      const dx = b[0] - pts[i][0];
      const dy = b[1] - pts[i][1];
      const den = d1[0] * d1[0] + d1[1] * d1[1] + dx * d2[0] + dy * d2[1];
      if (Math.abs(den) > 1e-9) ts[i] = Math.min(1, Math.max(0, t - (dx * d1[0] + dy * d1[1]) / den));
    }
    [c1, c2] = fitControls(pts, ts, p0, p3);
  }
  let error = 0;
  pts.forEach((q, i) => (error = Math.max(error, dist(q, bezier(p0, c1, c2, p3, ts[i])))));
  return { c1, c2, error };
}

/**
 * 획(페이지 px)이 매끈한 곡선 하나(끝에 화살촉 날개가 있으면 휜 화살표)인지. 거의 곧은 선은 straight로,
 * 곡선 하나로 맞지 않으면(글씨·낙서·지그재그) null
 */
export function recognizeCurve(input: Pt[]): CurveGuess | null {
  const raw = input.filter((p, i) => i === 0 || dist(p, input[i - 1]) > 0.5);
  if (raw.length < 6) return null;
  const pts = smooth(smooth(raw));
  const cum = cumulative(pts);
  const L = cum[cum.length - 1];
  // 글씨 획처럼 작은 것은 곡선으로 보지 않는다
  if (L < 60) return null;

  // 끝에서 되꺾인 날개 찾기: 뒤쪽 45% 안에서 처음으로 크게(115° 넘게) 꺾인 곳 = 화살촉 끝
  let shaft = pts;
  let kind: CurveGuess["kind"] = "line";
  const h = Math.max(6, L * 0.035);
  const at = (s: number): Pt => {
    let i = cum.findIndex((c) => c >= s);
    if (i < 0) return pts[pts.length - 1];
    if (i === 0) return pts[0];
    const k = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  };
  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] < L * 0.55 || L - cum[i] < h) continue;
    const before = at(cum[i] - h);
    const after = at(cum[i] + h);
    const v1: Pt = [pts[i][0] - before[0], pts[i][1] - before[1]];
    const v2: Pt = [after[0] - pts[i][0], after[1] - pts[i][1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
    if (cos > Math.cos((115 * Math.PI) / 180)) continue;
    // 꺾임은 창(±h) 때문에 조금 일찍 잡히므로, 그 근처에서 줄기 방향으로 가장 멀리 나간 점을 촉 끝으로
    const l1 = Math.hypot(...v1) || 1;
    let k = i;
    for (let j = i; j < pts.length && cum[j] <= cum[i] + 2 * h; j++) {
      const ahead = ((pts[j][0] - before[0]) * v1[0] + (pts[j][1] - before[1]) * v1[1]) / l1;
      const best = ((pts[k][0] - before[0]) * v1[0] + (pts[k][1] - before[1]) * v1[1]) / l1;
      if (ahead > best) k = j;
    }
    if (k >= pts.length - 2) break;
    // 날개: 촉 끝 근처에 머물고(줄기의 45% 안), 줄기가 끝나는 방향의 뒤쪽으로, 한쪽이라도 벌어짐
    const tip = pts[k];
    const head = pts.slice(k + 1);
    const stem = pts.slice(0, k + 1);
    const stemLen = cum[k];
    const back = at(Math.max(0, cum[k] - Math.max(h * 2, stemLen * 0.12)));
    const reach = Math.max(...head.map((p) => dist(p, tip)));
    const behind = head.filter((p) => (p[0] - tip[0]) * (back[0] - tip[0]) + (p[1] - tip[1]) * (back[1] - tip[1]) > 0);
    const wing = Math.max(...head.map((p) => Math.abs(side(p, back, tip))));
    if (reach <= 0.45 * stemLen && reach >= 10 && behind.length >= head.length * 0.6 && wing >= Math.max(6, 0.03 * stemLen)) {
      shaft = stem;
      kind = "arrow";
    }
    break;
  }

  const a = shaft[0];
  const b = shaft[shaft.length - 1];
  const chord = dist(a, b);
  if (chord < 40) return null;
  const shaftLen = cumulative(shaft)[shaft.length - 1];
  // 너무 많이 돌아가는 것(고리·소용돌이)은 곡선 하나가 아님
  if (shaftLen > 2.6 * chord) return null;
  const dev = Math.max(...shaft.map((p) => Math.abs(side(p, a, b))));
  const third = (k: number): Pt => [a[0] + ((b[0] - a[0]) * k) / 3, a[1] + ((b[1] - a[1]) * k) / 3];
  if (dev < 0.06 * chord) return { kind, a, b, c1: third(1), c2: third(2), straight: true };
  const fit = fitCubic(shaft);
  // 다듬기 전 점들도 곡선 가까이 있어야 (지그재그를 다듬어 곡선처럼 만든 것 막기)
  const rawShaft = raw.slice(0, shaft.length);
  const rawErr = Math.max(...rawShaft.map((q) => nearest(q, a, fit.c1, fit.c2, b)));
  const limit = Math.max(5, 0.07 * chord);
  if (fit.error > limit || rawErr > limit * 1.4) return null;
  // 맞춘 곡선이 곧은 선에서 거의 벗어나지 않으면(물결·손떨림이 평균으로 사라짐) 곧은 선으로
  let bulge = 0;
  for (let i = 1; i < 32; i++) bulge = Math.max(bulge, Math.abs(side(bezier(a, fit.c1, fit.c2, b, i / 32), a, b)));
  if (bulge < 0.08 * chord) return { kind, a, b, c1: third(1), c2: third(2), straight: true };
  return { kind, a, b, c1: fit.c1, c2: fit.c2, straight: false };
}
