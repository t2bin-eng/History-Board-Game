import { getStrokeOutlinePoints, getStrokePoints } from "perfect-freehand";
import { describe, expect, it } from "vitest";
import { outlineToSvgPath, strokeOptions, strokeToSvgPath } from "./geometry";
import type { InkPoint, Stroke } from "./types";

// 짧은 획이 덩어리가 되던 문제 (v0.49.1): perfect-freehand가 획 끝 3px 안의 점을 건너뛰어, 3px보다 짧은 획은
// 시작 둥근 끝이 획 길이만 한 반원으로 그려졌다 (작은 글씨의 ㅊ·ㅎ 윗점이 굵기의 몇 배인 덩어리, 쓰는 동안 깜빡임)

const PAGE = { width: 1200, height: 1697 };
type P = [number, number];

/** SVG path(M Q T…Z) → 다각형 */
function pathToPoly(d: string): P[] {
  const nums = d.replace(/[MQTZ]/g, " ").trim().split(/[\s,]+/).map(Number);
  const pts: P[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  if (pts.length < 3) return pts;
  const out: P[] = [pts[0]];
  let ctrl = pts[1];
  let cur = pts[0];
  const quad = (c: P, e: P) => {
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      out.push([(1 - t) * (1 - t) * cur[0] + 2 * (1 - t) * t * c[0] + t * t * e[0], (1 - t) * (1 - t) * cur[1] + 2 * (1 - t) * t * c[1] + t * t * e[1]]);
    }
    cur = e;
  };
  quad(ctrl, pts[2]);
  for (let i = 3; i < pts.length; i++) {
    ctrl = [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]];
    quad(ctrl, pts[i]);
  }
  return out;
}

function winding(poly: P[], x: number, y: number): number {
  let w = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
    if (ay <= y) {
      if (by > y && c > 0) w++;
    } else if (by <= y && c < 0) w--;
  }
  return w;
}

function distToPath(pts: P[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** 칠해진 넓이와, 가운데 선에서 굵기를 넘어 벗어난 넓이 (px²) */
function measure(d: string, center: P[], reach: number, step = 0.06): { ink: number; stray: number } {
  const poly = pathToPoly(d);
  const xs = poly.map((q) => q[0]);
  const ys = poly.map((q) => q[1]);
  let ink = 0;
  let stray = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      if (winding(poly, x, y) === 0) continue;
      ink += step * step;
      if (reach < 50 && distToPath(center, x, y) > reach) stray += step * step;
    }
  return { ink, stray };
}

/** (300, 300)px에서 dir 방향으로 len px, 240Hz 느린 펜 (0.05px/ms) */
function dash(len: number, dir: P, pressure: number): { pts: InkPoint[]; center: P[] } {
  const n = Math.max(2, Math.ceil(len / 0.05 / (1000 / 240)));
  const center: P[] = [];
  for (let k = 0; k <= n; k++) center.push([300 + (dir[0] * len * k) / n, 300 + (dir[1] * len * k) / n]);
  return { pts: center.map(([x, y]) => [x / PAGE.width, y / PAGE.height, pressure]), center };
}

const pen = (points: InkPoint[]): Stroke => ({ id: "s", tool: "pen", color: "#000", width: 2, points, smooth: 2 }) as Stroke;

describe("짧은 획 (v0.49.1)", () => {
  it("3px보다 짧은 획도 굵기만큼만 칠해진다 (방향·필압·쓰는 중·뗀 뒤)", () => {
    const r = (2 * PAGE.width) / 1000 / 2;
    for (const dir of [[0.6, 0.8], [1, 0], [-0.7, 0.7]] as P[]) {
      for (const pressure of [0.3, 0.9]) {
        let prev = 0;
        for (const len of [0.6, 1.2, 1.8, 2.4, 2.9, 3.4, 4.5]) {
          for (const last of [true, false]) {
            const { pts, center } = dash(len, dir, pressure);
            const m = measure(strokeToSvgPath(pen(pts), PAGE, last), center, r * 1.6 + 0.3);
            expect(m.stray, `${len}px ${pressure} ${last}`).toBeLessThan(0.15);
            if (last) {
              // 길수록 조금씩 늘 뿐, 3px 근처에서 갑자기 줄지 않는다 (전에는 2.9px 25px² → 3.5px 15px²)
              expect(m.ink, `${len}px ${pressure}`).toBeGreaterThan(prev * 0.97);
              prev = m.ink;
            }
          }
        }
      }
    }
  }, 60000);

  it("쓰는 동안 짧은 획이 가늘었다 뚱뚱했다 깜빡이지 않는다", () => {
    const { pts } = dash(6, [0.6, 0.8], 0.6);
    let prev = 0;
    for (let n = 2; n <= pts.length; n++) {
      const sub = pts.slice(0, n);
      const center = sub.map((q) => [q[0] * PAGE.width, q[1] * PAGE.height] as P);
      const m = measure(strokeToSvgPath(pen(sub), PAGE, false), center, 1.2 * 1.6 + 0.3);
      expect(m.stray).toBeLessThan(0.15);
      expect(m.ink).toBeGreaterThan(prev * 0.95);
      prev = m.ink;
    }
  }, 60000);

  it("긴 획은 전과 같은 모양 (키워서 계산해도 그대로)", () => {
    const { pts, center } = dash(40, [0.6, 0.8], 0.6);
    const px = center.map(([x, y], i) => [x, y, pts[i][2]] as InkPoint);
    const opts = strokeOptions("pen", 2.4, false, true, true);
    const before = outlineToSvgPath(getStrokeOutlinePoints(getStrokePoints(px, { ...opts, size: 0.01 }), opts));
    const a = measure(before, center, 99, 0.1).ink;
    const b = measure(strokeToSvgPath(pen(pts), PAGE, true), center, 99, 0.1).ink;
    expect(Math.abs(a - b) / a).toBeLessThan(0.02);
  }, 60000);
});
