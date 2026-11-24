// S펜 버튼을 누른 채 쓸 때 할 일 (v0.33, SPEC 5장 기기 설정 lessondeck.penButton · 6장 S펜 버튼).
// 삼성노트처럼 버튼 동작을 고른다. 기본은 0.32까지와 같은 지우개.

export type PenButtonAction = "eraser" | "laser" | "highlighter" | "lasso";

export const PEN_BUTTON_KEY = "lessondeck.penButton";

export const PEN_BUTTON_ACTIONS: { id: PenButtonAction; label: string }[] = [
  { id: "eraser", label: "지우개" },
  { id: "laser", label: "레이저 펜" },
  { id: "highlighter", label: "형광펜" },
  { id: "lasso", label: "올가미" },
];

export function loadPenButton(): PenButtonAction {
  try {
    const v = localStorage.getItem(PEN_BUTTON_KEY);
    if (v === "laser" || v === "highlighter" || v === "lasso") return v;
  } catch {
    // 기억을 못 읽으면 기본값
  }
  return "eraser";
}

export function savePenButton(action: PenButtonAction) {
  try {
    localStorage.setItem(PEN_BUTTON_KEY, action);
  } catch {
    // 기억하지 못해도 이번 실행 동안은 된다
  }
}
