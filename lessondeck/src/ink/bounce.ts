import type { InkPoint, Stroke } from "./types";

// 펜이 잠깐 튄 자국 잇기 (v0.53, SPEC 5장 "펜이 잠깐 튄 획 잇기")
// 빠르게 쓰면 S펜 끝이 화면에서 아주 잠깐(수십 ms) 떨어졌다 다시 닿아, 한 획이 둘로 끊기고 그 사이(펜이 떠서 간 자리)가 빠졌다.
// 닿는 순간 튀면 첫 획은 점 하나로 남아 다음 획 시작에 점처럼 붙었다.
// 그래서 획을 마무리할 때: 바로 앞 펜 획이 아주 짧은 사이를 두고 끝났고, 이번 획이 그 끝에서 움직이던 방향으로 이어지면 하나로 잇고,
// 바로 앞 획이 점이고 이번 획이 그 자리에서 시작하면 점을 버린다.

/** 펜을 뗀 뒤 이 시간(ms) 안에 다시 닿아야 이어 쓴 것으로 본다 (손으로 들었다 놓는 데는 이보다 오래 걸린다) */
export const BOUNCE_JOIN_MS = 40;
/** 닿는 순간 튄 점: 이 시간(ms) 안에 다시 닿으면 */
export const BOUNCE_DOT_MS = 80;
/** 뗄 때 이만큼(화면 px/ms) 넘게 움직이고 있었어야 (멈춰서 뗀 것은 일부러 뗀 것) */
const MIN_SPEED = 0.25;
/** 다시 닿은 자리가 움직이던 방향에서 벗어나도 되는 각 */
const MAX_TURN_DEG = 40;

/** 뗀 획의 기록 (화면 px, ms) */
export interface PenLift {
  id: string;
  /** 갈고리 자르기 등 하기 전의 점 */
  raw: InkPoint[];
  t: number;
  end: [number, number];
  /** 뗄 때 속도 (화면 px/ms) */
  vel: [number, number];
  /** 획 길이 (화면 px) */
  len: number;
  /** 같은 펜인지 */
  style: string;
}

/** 이을 수 있는 같은 펜 */
export function penStyleKey(s: Stroke): string {
  return [s.tool, s.color, s.width, s.fixedWidth ? 1 : 0, s.nib ?? "", s.opacity ?? 1, s.simulatePressure ? 1 : 0].join("|");
}

/**
 * 이번 획(시작 시각 t, 첫 자리 first — 화면 px)과 바로 앞 획(prev)의 관계.
 * "join": 앞 획에 이어 하나로, "dropDot": 앞의 점을 버림, null: 따로.
 */
export function bounceRelation(prev: PenLift | null, t: number, first: [number, number], style: string, widthPx: number): "join" | "dropDot" | null {
  if (!prev || prev.style !== style) return null;
  const dt = t - prev.t;
  if (dt < 0) return null;
  const gx = first[0] - prev.end[0];
  const gy = first[1] - prev.end[1];
  const gap = Math.hypot(gx, gy);
  // 닿는 순간 튄 점: 아주 짧은 앞 획이 이번 시작 자리 가까이
  if (dt <= BOUNCE_DOT_MS && prev.len <= Math.max(2, widthPx * 1.2) && gap <= Math.max(3, widthPx * 1.5)) return "dropDot";
  if (dt > BOUNCE_JOIN_MS) return null;
  const speed = Math.hypot(prev.vel[0], prev.vel[1]);
  if (speed < MIN_SPEED) return null;
  // 그동안 움직였을 자리에서 가까워야
  const ex = prev.end[0] + prev.vel[0] * dt;
  const ey = prev.end[1] + prev.vel[1] * dt;
  if (Math.hypot(first[0] - ex, first[1] - ey) > Math.max(4, 0.5 * speed * dt + 2)) return null;
  // 움직이던 방향으로
  if (gap > 2) {
    const cos = (gx * prev.vel[0] + gy * prev.vel[1]) / (gap * speed);
    if (cos < Math.cos((MAX_TURN_DEG * Math.PI) / 180)) return null;
  }
  return "join";
}

/** 최근 표본(화면 px, ms)으로 끝 속도: 마지막 표본에서 window ms 안의 첫 표본까지 */
export function endVelocity(samples: { x: number; y: number; t: number }[], window = 12): [number, number] {
  if (samples.length < 2) return [0, 0];
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i];
    if (last.t - samples[i].t >= window) break;
  }
  const dt = last.t - first.t;
  return dt > 0 ? [(last.x - first.x) / dt, (last.y - first.y) / dt] : [0, 0];
}
