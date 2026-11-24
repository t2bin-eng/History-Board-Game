// 보기 (v0.44, SPEC 5장 기기 설정 lessondeck.viewMode): 이어 보기(세로 스크롤, 기본) · 한 장씩

export type ViewMode = "scroll" | "single";

export const VIEW_MODE_KEY = "lessondeck.viewMode";

export function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "single" ? "single" : "scroll";
  } catch {
    return "scroll";
  }
}

export function saveViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // 기억하지 못해도 이번 실행 동안은 된다
  }
}
