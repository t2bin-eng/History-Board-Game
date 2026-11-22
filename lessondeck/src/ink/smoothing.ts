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
