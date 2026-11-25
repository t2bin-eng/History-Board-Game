import type { InkPoint } from "./types";

// 떨림 거르기·끝 다듬기 (v0.32, SPEC 5장 "떨림 거르기·끝 다듬기 획")
// - 쓰는 동안: 마지막으로 남긴 점에서 아주 가까운 점은 버린다(손 떨림). 단 진행 방향이 크게 꺾이면 남겨 모서리를 지킨다.
// - 그릴 때: 점을 앞뒤 이웃과 고르게 다듬되 끝으로 갈수록 다듬는 폭을 줄여 맨 끝 점은 그대로 둔다.
//   쓰는 동안에는 새 점이 올 때마다 끝 몇 점만 다시 다듬어지고, 이웃이 다 온 앞쪽 점은 더 바뀌지 않는다.
//   그래서 펜 끝을 늦게 따라가게 하는 streamline을 낮춰도 매끄럽다.

/** 이 값을 가진 획만 새 방식으로 그린다 (Stroke.smooth) */
export const SMOOTH_V2 = 2;

/** 떨림으로 보는 거리 (화면 px) */
export const JITTER_PX = 1;
/** 가까워도 남기는 꺾임: 진행 방향이 30° 넘게 바뀜 (cos 30°) */
const CORNER_COS = Math.cos(Math.PI / 6);
/** 자리 다듬기 폭 (앞뒤 점 수) */
const POS_RADIUS = 2;
/** 필압 다듬기 폭 — 자리보다 넓게: 필압이 튀어도 굵기가 출렁이지 않게 */
const PRESSURE_RADIUS = 3;
/** 이만큼(도) 넘게 꺾인 곳은 모서리: 다듬지 않고, 다듬는 폭이 모서리를 넘지 않는다 */
const CORNER_DEG = 70;
/** 꺾임을 잴 때 앞뒤로 이만큼(px) 떨어진 점을 본다 (촘촘한 점의 작은 떨림을 꺾임으로 보지 않게) */
const CORNER_REACH_PX = 4;

// ── 손떨림 보정 세기 (v0.42, SPEC 5장 "손떨림 보정 세기"·`lessondeck.stabilize`) ──

export type StabilizeLevel = 1 | 2 | 3 | 4;
export const STABILIZE_KEY = "lessondeck.stabilize";
/** 세기마다 떨림 거르기 거리(화면 px)와 다듬는 폭(앞뒤 점 수). 보통(2)은 0.32~0.41과 같다 */
export const STABILIZE_LEVELS: readonly { id: StabilizeLevel; label: string; tol: number; radius: number }[] = [
  { id: 1, label: "약하게", tol: 0.6, radius: 1 },
  { id: 2, label: "보통", tol: JITTER_PX, radius: POS_RADIUS },
  { id: 3, label: "강하게", tol: 1.5, radius: 4 },
  { id: 4, label: "최대", tol: 2, radius: 7 },
];

export function stabilizeOf(level: StabilizeLevel | undefined) {
  return STABILIZE_LEVELS.find((l) => l.id === level) ?? STABILIZE_LEVELS[1];
}

export function loadStabilize(): StabilizeLevel {
  try {
    const n = Number(localStorage.getItem(STABILIZE_KEY));
    return STABILIZE_LEVELS.some((l) => l.id === n) ? (n as StabilizeLevel) : 2;
  } catch {
    return 2;
  }
}

export function saveStabilize(level: StabilizeLevel) {
  try {
    localStorage.setItem(STABILIZE_KEY, String(level));
  } catch {
    // 저장하지 못해도 이번에는 쓴다
  }
}

/** 획에 붙은 다듬는 폭 (없거나 이상하면 보통) */
export function strokeSmoothRadius(smoothR: unknown): number {
  return typeof smoothR === "number" && Number.isInteger(smoothR) && smoothR >= 1 && smoothR <= 8 ? smoothR : POS_RADIUS;
}

interface Pt {
  x: number;
  y: number;
}

/** 마지막으로 남긴 점 뒤로 버린 점 중 가장 멀리 간 것 (남기면 지운다) */
export interface Dropped {
  x: number;
  y: number;
  /** 마지막으로 남긴 점에서의 거리 */
  dist: number;
}

/**
 * 새 점 cand를 남길지 (삼성노트의 떨림 허용 범위와 같은 생각). last는 마지막으로 남긴 점, prev는 그 앞에 남긴 점(없으면 null),
 * dropped는 last 뒤로 버린 점 중 가장 멀리 간 것(없으면 null). 모두 화면 px.
 * - last에서 tol 넘게 떨어지면 남긴다
 * - 이미 버린 점이 있고 tol/5 넘게 움직였는데 진행 방향(prev→last 대비 last→cand)이 30° 넘게 꺾였으면 남긴다(모서리)
 * - 멀리 갔던 점에서 되돌아오는 중이면(작은 갈고리) 남긴다
 * - 그 밖은 버린다. 버리면 dropped를 고쳐 돌려준다 (남기면 null)
 */
export function keepPoint(prev: Pt | null, last: Pt, cand: Pt, dropped: Dropped | null, tol = JITTER_PX): { keep: boolean; dropped: Dropped | null } {
  const dx = cand.x - last.x;
  const dy = cand.y - last.y;
  const d = Math.hypot(dx, dy);
  const keep = { keep: true, dropped: null };
  if (d > tol) return keep;
  const small = tol / 5;
  // 버린 점이 쌓인 뒤의 꺾임: 바로 다음 점은 보지 않는다 (촘촘히 떨리는 점을 모두 모서리로 보지 않게)
  if (dropped && d > small && prev) {
    const px = last.x - prev.x;
    const py = last.y - prev.y;
    const pl = Math.hypot(px, py);
    if (pl > 0 && (px * dx + py * dy) / (pl * d) < CORNER_COS) return keep;
  }
  // 멀리 갔던 점에서 되돌아옴
  if (dropped && dropped.dist > small) {
    const bx = cand.x - dropped.x;
    const by = cand.y - dropped.y;
    if (Math.hypot(bx, by) > small && bx * (dropped.x - last.x) + by * (dropped.y - last.y) < 0) return keep;
  }
  const far = !dropped || d > dropped.dist ? { x: cand.x, y: cand.y, dist: d } : dropped;
  return { keep: false, dropped: far };
}

/** i번 점에서 앞뒤로 reach px 넘게 떨어진 점까지 보고 꺾인 각(도). 양쪽 중 하나라도 그만큼 떨어진 점이 없으면 0 */
function turnDeg(pts: InkPoint[], i: number, reach: number): number {
  const [x, y] = pts[i];
  let a = -1;
  for (let j = i - 1; j >= 0; j--) {
    if (Math.hypot(pts[j][0] - x, pts[j][1] - y) >= reach) {
      a = j;
      break;
    }
  }
  let b = -1;
  for (let j = i + 1; j < pts.length; j++) {
    if (Math.hypot(pts[j][0] - x, pts[j][1] - y) >= reach) {
      b = j;
      break;
    }
  }
  if (a < 0 || b < 0) return 0;
  const ux = x - pts[a][0];
  const uy = y - pts[a][1];
  const vx = pts[b][0] - x;
  const vy = pts[b][1] - y;
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * 점을 고르게 다듬는다 (페이지 px 점, 새 배열). 첫 점·끝 점은 그대로, 끝에 가까울수록 다듬는 폭이 줄어든다.
 * 무게는 가운데가 무거운 삼각형(폭 2면 1·2·3·2·1). 크게 꺾인 모서리는 그대로 두고 그 너머 점과는 섞지 않는다.
 */
export function smoothPoints(pts: InkPoint[], posRadius = POS_RADIUS, pressureRadius = PRESSURE_RADIUS): InkPoint[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  // 모서리 찾기: 다듬는 폭이 모서리를 넘지 않게 앞뒤로 가장 가까운 모서리 번호를 둔다
  const corner: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n - 1; i++) corner[i] = turnDeg(pts, i, CORNER_REACH_PX) > CORNER_DEG;
  const prevCorner: number[] = new Array(n);
  const nextCorner: number[] = new Array(n);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (corner[i]) c = i;
    prevCorner[i] = c;
  }
  c = n - 1;
  for (let i = n - 1; i >= 0; i--) {
    if (corner[i]) c = i;
    nextCorner[i] = c;
  }
  const out: InkPoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (corner[i]) {
      out[i] = [pts[i][0], pts[i][1], smoothValue(pts, i, Math.min(pressureRadius, i, n - 1 - i))];
      continue;
    }
    // 끝(또는 모서리)까지 남은 점 수만큼만 → 양쪽이 같은 폭이라 끝 점은 그대로, 끝으로 갈수록 덜 다듬는다
    const k = Math.min(posRadius, i - prevCorner[i], nextCorner[i] - i);
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let j = -k; j <= k; j++) {
      const w = k + 1 - Math.abs(j);
      sx += pts[i + j][0] * w;
      sy += pts[i + j][1] * w;
      sw += w;
    }
    out[i] = [sx / sw, sy / sw, smoothValue(pts, i, Math.min(pressureRadius, i, n - 1 - i))];
  }
  return out;
}

/** i번 점의 필압을 앞뒤 k점과 삼각형 무게로 */
function smoothValue(pts: InkPoint[], i: number, k: number): number {
  let s = 0;
  let sw = 0;
  for (let j = -k; j <= k; j++) {
    const w = k + 1 - Math.abs(j);
    s += pts[i + j][2] * w;
    sw += w;
  }
  return s / sw;
}

/**
 * 예측 좌표 줄이기 (v0.36): 브라우저가 내다본 펜 끝(getPredictedEvents)을 마지막 실제 점에서 maxPx(페이지 CSS px)까지만.
 * 빠르게 긋거나 화면이 바쁠 때 예측이 멀리 튀어, 그리는 동안 끝이 늘었다가 놓으면 줄어드는 것처럼 보였다.
 */
export function capPrediction(last: InkPoint | undefined, predicted: InkPoint[], page: { width: number; height: number }, maxPx: number): InkPoint[] {
  if (!last || !predicted.length) return [];
  const out: InkPoint[] = [];
  let px = last[0] * page.width;
  let py = last[1] * page.height;
  let total = 0;
  for (const p of predicted) {
    const x = p[0] * page.width;
    const y = p[1] * page.height;
    total += Math.hypot(x - px, y - py);
    if (total > maxPx) break;
    out.push(p);
    px = x;
    py = y;
  }
  return out;
}

// ── 댈 때·뗄 때 갈고리 자르기 (v0.47.2, SPEC 5장 "댈 때·뗄 때 갈고리 자르기") ──

/** 뗄 때 갈고리: 끝에서 이만큼(화면 px)·점 수 안, 이만큼 넘게 꺾임 */
const HOOK_END_PX = 5;
const HOOK_END_PTS = 5;
const HOOK_END_DEG = 45;
/** 댈 때 미끄러짐: 처음 이만큼(화면 px)·점 수 안, 남길 첫 점은 뒤의 진행 줄에서 이만큼 안 (미끄러졌다 돌아온 자리) */
const HOOK_START_PX = 6;
const HOOK_START_PTS = 5;
const HOOK_START_ONLINE_PX = 1.2;
/** 머리가 진행 줄에서 이만큼(화면 px) 넘게 벗어났으면 미끄러짐 (줄을 따라 되돌아간 것은 꺾임 각도로) */
const HOOK_START_DEV_PX = 1.5;
const HOOK_START_DEG = 60;
/** 꺾임을 잴 때 갈고리 앞(뒤) 진행 방향을 이만큼(화면 px) 본다 */
const HOOK_REF_PX = 6;
/** 갈고리 필압이 그 획 필압 가운데값의 이 비율보다 낮아야 (일부러 꺾은 끝은 필압이 그대로) */
const HOOK_PRESSURE = 0.75;
/** 꺾인 뒤 첫 점의 필압이 가운데 필압의 이만큼보다 낮아야 갈고리 (v0.51, 날려 쓴 끝은 꺾을 때 아직 눌려 있음) */
const HOOK_TURN_PRESSURE = 0.65;
/** 이보다 짧은 획(화면 px)은 그대로 (점·짧은 삐침) */
const HOOK_MIN_STROKE_PX = 12;
/**
 * 꺾이는 점까지는 곧게 와야 갈고리: 꺾인 곳 앞 6px와 그 앞 6px의 방향 차이가 이보다 작아야 한다
 * (작은 ㅇ처럼 고르게 휘는 곳·꼬리 가운데를 꺾인 곳으로 잘못 보지 않게)
 */
const HOOK_STRAIGHT_DEG = 25;

/**
 * 펜을 대고 뗄 때 생긴 갈고리를 잘라 낸 점 (바뀌지 않으면 같은 배열). toScreen: 점 → 화면 px.
 * 끝(뗄 때): 끝에서 5px·5점 안의 꼬리가 앞의 진행 방향에서 45° 넘게 꺾이고 필압이 떨어졌으면 그 꼬리를 뗀다.
 * 시작(댈 때): 처음 6px·5점 안의 머리가 뒤의 진행 방향에서 60° 넘게 꺾이고 필압이 낮으면, 진행 줄로 돌아온 점부터 남긴다.
 */
export function trimHooks(points: InkPoint[], toScreen: (p: InkPoint) => [number, number]): InkPoint[] {
  const n = points.length;
  if (n < 6) return points;
  const s = points.map(toScreen);
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  if (total < HOOK_MIN_STROKE_PX) return points;
  const sorted = points.map((p) => p[2]).sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const lowPressure = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i <= to; i++) sum += points[i][2];
    return sum / (to - from + 1) < median * HOOK_PRESSURE;
  };
  /** a → b 와 c → d 방향 사이 각(도) */
  const angle = (a: number, b: number, c: number, d: number) => {
    const ux = s[b][0] - s[a][0];
    const uy = s[b][1] - s[a][1];
    const vx = s[d][0] - s[c][0];
    const vy = s[d][1] - s[c][1];
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (!l) return 0;
    return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / l))) * 180) / Math.PI;
  };
  /** i에서 dir 쪽으로 HOOK_REF_PX 넘게 떨어진 점 (없으면 -1) */
  const reach = (i: number, dir: 1 | -1) => {
    for (let j = i + dir; j >= 0 && j < n; j += dir) if (Math.hypot(s[j][0] - s[i][0], s[j][1] - s[i][1]) >= HOOK_REF_PX) return j;
    return -1;
  };

  // 끝: 가장 긴 꼬리부터 (b = 꼬리가 시작하는 점, 남길 마지막 점)
  let end = n - 1;
  let tail = 0;
  for (let b = n - 2; b >= Math.max(1, n - 1 - HOOK_END_PTS); b--) {
    tail += Math.hypot(s[b + 1][0] - s[b][0], s[b + 1][1] - s[b][1]);
    if (tail > HOOK_END_PX) break;
    const a = reach(b, -1);
    const a2 = a < 0 ? -1 : reach(a, -1);
    if (a2 < 0 || tail < 0.8) continue;
    // 꺾인 자리에서 이미 펜이 들리고 있어야 갈고리 (v0.51): 일부러 날려 쓴 끝(ㅅ·ㅣ 삐침)은 펜을 누른 채 꺾고 나서 힘이 빠진다
    // b가 꺾인 자리 그 점이어야 (v0.51): b는 줄기(a2 → a)를 늘인 줄 위 — 날린 끝 안쪽 점을 모서리로 잡아 끝 절반을 자르지 않게
    const sx = s[a][0] - s[a2][0];
    const sy = s[a][1] - s[a2][1];
    const onStem = Math.abs((s[b][0] - s[a][0]) * sy - (s[b][1] - s[a][1]) * sx) / (Math.hypot(sx, sy) || 1) <= HOOK_START_ONLINE_PX;
    if (
      angle(a2, a, a, b) < HOOK_STRAIGHT_DEG &&
      onStem &&
      angle(a, b, b, n - 1) > HOOK_END_DEG &&
      lowPressure(b + 1, n - 1) &&
      points[b + 1][2] < median * HOOK_TURN_PRESSURE
    )
      end = b;
  }
  // 시작: 가장 긴 머리부터 (h = 머리가 끝나는 점, 남길 첫 점)
  let start = 0;
  let head = 0;
  for (let h = 1; h <= Math.min(HOOK_START_PTS, end - 2); h++) {
    head += Math.hypot(s[h][0] - s[h - 1][0], s[h][1] - s[h - 1][1]);
    if (head > HOOK_START_PX) break;
    const c = reach(h, 1);
    const c2 = c < 0 ? -1 : reach(c, 1);
    if (c2 < 0 || c2 > end || head < 0.8) continue;
    if (angle(h, c, c, c2) >= HOOK_STRAIGHT_DEG || !lowPressure(0, h - 1)) continue;
    // 뒤의 진행 줄(c2 → c를 뒤로 늘인 줄)에서 떨어진 거리
    const lx = s[c][0] - s[c2][0];
    const ly = s[c][1] - s[c2][1];
    const ll = Math.hypot(lx, ly) || 1;
    const off = (i: number) => Math.abs((s[i][0] - s[c][0]) * ly - (s[i][1] - s[c][1]) * lx) / ll;
    let dev = 0;
    for (let i = 0; i < h; i++) dev = Math.max(dev, off(i));
    // 머리가 꺾여 있거나(줄을 따라 되돌아간 것 포함) 옆으로 벗어났고, 남길 첫 점 h는 진행 줄 위 (미끄러진 바깥 점에서 자르지 않게)
    // 진행 줄로 돌아온 첫 점에서 (그 뒤의 제대로 쓴 점까지 자르지 않게)
    if ((angle(0, h, h, c) > HOOK_START_DEG || dev > HOOK_START_DEV_PX) && off(h) <= HOOK_START_ONLINE_PX) {
      start = h;
      break;
    }
  }
  return start === 0 && end === n - 1 ? points : points.slice(start, end + 1);
}
