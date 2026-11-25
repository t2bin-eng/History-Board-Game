import { recognizeCurve } from "./curveFit";
import { recognizeShape } from "./shapeRecognize";
import { curveSpec, guessToSpec, nearlyStraight, shapeFits } from "./shapes";
import type { ShapeSpec } from "./types";

// 멈춤·자동 도형 보정이 이 획을 무엇으로 바꿀지 (v0.51, SPEC 6장 "도형 보정"): 도형 → 곡선 → (멈춤만) 곧은 선 → 그대로.
// 알아본 모양이 쓴 획과 서로 가까울 때만 (shapeFits). 0.50까지는 도형·곡선이 아니면 무조건 곧은 선이라,
// 흘려 쓰다 0.5초 멈추면 글자가 직선·네모·화살표로 바뀌었다

type P = [number, number];

export type HoldGuess = { type: "shape"; spec: ShapeSpec } | { type: "curve"; spec: ShapeSpec; straight: boolean } | { type: "line" } | null;

/** px: 페이지 px 점, lineW: 펜 굵기 px. line: 곧은 획이면 곧은 선으로 (멈춤 도형 보정) */
export function guessHoldShape(px: P[], page: { width: number; height: number }, lineW: number, line: boolean): HoldGuess {
  const g = recognizeShape(px);
  if (g) {
    const spec = guessToSpec(g, page);
    if (shapeFits(px, spec, page, lineW)) return { type: "shape", spec };
  } else {
    const c = recognizeCurve(px);
    if (c && (!c.straight || c.kind === "arrow")) {
      const spec = curveSpec(c.kind, c.a, c.b, c.c1, c.c2, page);
      if (shapeFits(px, spec, page, lineW, true)) return { type: "curve", spec, straight: c.straight };
    }
  }
  if (line && nearlyStraight(px)) return { type: "line" };
  return null;
}
