import type { Stroke } from "./types";

// 지우개가 지울 것 (v0.32, SPEC 5장 기기 설정 lessondeck.eraserTarget · 6장 지우개)
// 판서 위에 그은 형광펜만 걷어 내거나, 형광펜은 두고 펜 글씨만 지울 때. 도형 획은 그 도구(펜·형광펜)를 따른다.

export type EraserTarget = "all" | "pen" | "highlighter";

export const ERASER_TARGET_KEY = "lessondeck.eraserTarget";

export const ERASER_TARGETS: { id: EraserTarget; label: string; clearLabel: string }[] = [
  { id: "all", label: "전부", clearLabel: "필기 지우기" },
  { id: "pen", label: "펜만", clearLabel: "펜 필기 모두 지우기" },
  { id: "highlighter", label: "형광펜만", clearLabel: "형광펜 모두 지우기" },
];

/** 이 지우개가 이 획을 지울 수 있는지 */
export function eraserTakes(target: EraserTarget, stroke: Stroke): boolean {
  if (target === "all") return true;
  return stroke.tool === target;
}

/** 기기에 기억한 값 (없거나 읽지 못하면 전부) */
export function loadEraserTarget(): EraserTarget {
  try {
    const v = localStorage.getItem(ERASER_TARGET_KEY);
    if (v === "pen" || v === "highlighter") return v;
  } catch {
    // 기억을 못 읽으면 기본값
  }
  return "all";
}

export function saveEraserTarget(target: EraserTarget) {
  try {
    localStorage.setItem(ERASER_TARGET_KEY, target);
  } catch {
    // 기억하지 못해도 이번 실행 동안은 된다
  }
}
