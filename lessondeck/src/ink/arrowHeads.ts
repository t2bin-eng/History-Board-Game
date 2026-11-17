import type { ArrowHead } from "./types";

// 화살촉 모양 (v0.30, SPEC 5장 arrows·도형 획 `head`): 글상자 화살표와 펜 화살표 도형이 같이 쓴다.
// 촉 끝(tip)과 가는 방향(dir, 단위 벡터), 촉 길이(len)로 그릴 선(lines)·채울 면(fills)과 몸통을 끊을 길이(inset)를 낸다.

type P = [number, number];

export const ARROW_HEADS: { id: ArrowHead; label: string }[] = [
  { id: "open", label: "열린 촉" },
  { id: "tri", label: "삼각형" },
  { id: "dot", label: "동그라미" },
  { id: "diamond", label: "마름모" },
  { id: "bar", label: "막대" },
  { id: "none", label: "없음" },
];

export interface HeadParts {
  /** 선으로 그을 것 (몸통과 같은 굵기, 둥근 끝) */
  lines: P[][];
  /** 채울 다각형 */
  fills: P[][];
  /** 몸통을 촉 끝에서 이만큼 안쪽에서 끊는다 (채운 촉 안으로 몸통 끝이 비져나오지 않게) */
  inset: number;
}

/** 열린 V 날개 각도 (펜 화살표의 0.29까지 촉과 같음) */
const OPEN_ANGLE = (25 * Math.PI) / 180;

export function headParts(style: ArrowHead, tip: P, dir: P, len: number, lineW: number): HeadParts {
  const [x, y] = tip;
  const [ux, uy] = dir;
  // 옆 방향 (가는 방향의 왼쪽·오른쪽)
  const px = -uy;
  const py = ux;
  const back = (d: number): P => [x - ux * d, y - uy * d];
  const side = ([bx, by]: P, s: number): P => [bx + px * s, by + py * s];
  switch (style) {
    case "none":
      return { lines: [], fills: [], inset: 0 };
    case "open": {
      const b = back(len * Math.cos(OPEN_ANGLE));
      const s = len * Math.sin(OPEN_ANGLE);
      return { lines: [[side(b, s), tip, side(b, -s)]], fills: [], inset: 0 };
    }
    case "bar": {
      const s = len * 0.55;
      return { lines: [[side(tip, s), side(tip, -s)]], fills: [], inset: 0 };
    }
    case "dot": {
      const r = Math.max(lineW * 1.6, len * 0.38);
      const c = back(r);
      const n = 24;
      const circle = Array.from({ length: n }, (_, i): P => [c[0] + Math.cos((i / n) * Math.PI * 2) * r, c[1] + Math.sin((i / n) * Math.PI * 2) * r]);
      return { lines: [], fills: [circle], inset: r };
    }
    case "diamond": {
      const half = len * 0.42;
      const m = back(len * 0.6);
      return { lines: [], fills: [[tip, side(m, half), back(len * 1.2), side(m, -half)]], inset: len * 0.9 };
    }
    case "tri":
    default: {
      // 0.29까지 글상자 화살표의 촉과 같은 모양 (길이 len, 반폭 0.55 len)
      const b = back(len);
      const half = len * 0.55;
      return { lines: [], fills: [[tip, side(b, half), side(b, -half)]], inset: len * 0.6 };
    }
  }
}

/** 꺾은선의 끝에서 dist만큼 잘라 낸다 (몸통을 촉 안쪽에서 끊기). 남는 길이가 없으면 첫 점만 */
export function trimEnd(poly: P[], dist: number): P[] {
  if (dist <= 0 || poly.length < 2) return poly;
  const out = poly.slice();
  let left = dist;
  while (out.length >= 2) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg > left) {
      const k = (seg - left) / seg;
      out[out.length - 1] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      return out;
    }
    left -= seg;
    out.pop();
  }
  return out;
}

/** 꺾은선의 시작에서 dist만큼 잘라 낸다 */
export function trimStart(poly: P[], dist: number): P[] {
  return trimEnd(poly.slice().reverse(), dist).reverse();
}
