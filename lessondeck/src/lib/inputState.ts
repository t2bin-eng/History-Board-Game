import { recordNativePen } from "./debugStore";
import { isNativeApp } from "./platform";

// 화면 전체에서 공유하는 펜 입력 상태.
// - 펜을 마지막으로 쓴(또는 띄워 둔) 시각: 그 직후의 터치는 손바닥으로 보고 무시한다
// - S펜 사이드 버튼(또는 PC 마우스 오른쪽 버튼)을 누르고 있는지: 누르는 동안 지우개로 바뀐다
// - 화면에 닿아 있는 손가락 수: 두 손가락 이상이면 필기가 아니라 확대·이동

/** 펜 사용 직후 이 시간 동안은 터치를 손바닥으로 본다 */
const PALM_GUARD_MS = 800;

let lastPenTime = -Infinity;
let sideButton = false;
/** 안드로이드 앱이 S펜 버튼 상태를 직접 알려 주는지 (MainActivity: 버튼을 누른 채 쓰는 획은 지우개 끝 입력으로 온다) */
let nativeSide = false;
const touches = new Set<number>();
const listeners = new Set<(down: boolean) => void>();

export function penRecentlyActive(): boolean {
  return performance.now() - lastPenTime < PALM_GUARD_MS;
}

/** 지금 화면에 닿아 있는 손가락 수 */
export function activeTouchCount(): number {
  return touches.size;
}

export function isSideButtonDown(): boolean {
  return sideButton;
}

export function onSideButtonChange(fn: (down: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 앱에 묻는 글 (android/.../PenInput.java QUERY) */
const PEN_QUERY = "lessondeck:pen-stroke";
/** 펜 포인터마다 이번 획이 지우개인지 (닿을 때 한 번 묻고, 뗄 때 지운다) */
const strokeErase = new Map<number, boolean>();

/**
 * 이 펜 획을 S펜 버튼을 누른 채 시작했는지 = 지우개 획인지.
 * 안드로이드 앱은 웹뷰가 버튼 상태를 제대로 넘기지 못해(삼성 동작 번호, 글자 고르기 가로채기) 앱이 펜 이벤트를 다듬고
 * 닿는 순간의 버튼을 기억해 둔다. prompt로 바로 물어 답을 받으므로 이벤트보다 늦을 걱정이 없다. 획마다 한 번만 묻는다.
 */
export function penStrokeErasing(e: PointerEvent): boolean {
  if (e.pointerType === "touch") return false;
  if (hasSideButton(e)) return true;
  // 브라우저(PC 마우스 오른쪽 버튼, 버튼 신호가 이벤트에 실리는 펜): 지금 버튼 상태
  if (e.pointerType !== "pen" || !isNativeApp) return sideButton;
  const known = strokeErase.get(e.pointerId);
  if (known !== undefined) return known;
  let erase = false;
  try {
    erase = window.prompt(PEN_QUERY) === "erase";
  } catch {
    // 물을 수 없으면 버튼 신호(lessondecksidebutton)만 따른다
    erase = sideButton;
  }
  strokeErase.set(e.pointerId, erase);
  return erase;
}

/** 사이드 버튼(2) 또는 S펜 지우개 끝(32)이 눌린 이벤트인지 */
export function hasSideButton(e: PointerEvent): boolean {
  if (e.pointerType === "pen") return !!(e.buttons & 2 || e.buttons & 32 || e.button === 5);
  if (e.pointerType === "mouse") return !!(e.buttons & 2);
  return false;
}

function setSide(down: boolean) {
  if (down === sideButton) return;
  sideButton = down;
  for (const fn of listeners) fn(down);
}

function track(e: PointerEvent) {
  if (e.pointerType === "touch") {
    if (e.type === "pointerdown") touches.add(e.pointerId);
    else if (e.type === "pointerup" || e.type === "pointercancel") touches.delete(e.pointerId);
    return;
  }
  if (e.pointerType === "pen") {
    lastPenTime = performance.now();
    if (e.type === "pointerup" || e.type === "pointercancel") strokeErase.delete(e.pointerId);
  }
  if (e.pointerType !== "pen" && e.pointerType !== "mouse") return;
  // 앱이 버튼 상태를 알려 주면 그것을 따른다 (펜을 띄운 채 누를 때는 웹 이벤트에 버튼이 실리지 않음)
  if (nativeSide && e.pointerType === "pen") {
    if (hasSideButton(e)) setSide(true);
    return;
  }
  setSide(hasSideButton(e));
}

function leave(e: PointerEvent) {
  // 펜이 화면에서 멀어지면 버튼 상태를 알 수 없으므로 풀어 준다
  if (e.pointerType === "pen" && !e.relatedTarget) setSide(false);
}

let installed = false;

export function installInputTracking() {
  if (installed) return;
  installed = true;
  const opts = { capture: true, passive: true } as const;
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) {
    window.addEventListener(type, track, opts);
  }
  window.addEventListener("pointerout", leave, opts);
  window.addEventListener("blur", () => setSide(false));
  window.addEventListener("lessondecksidebutton", (e) => {
    nativeSide = true;
    const detail = e as Event & { down?: boolean; info?: string };
    recordNativePen(`${detail.down ? "버튼 누름" : "버튼 뗌"} ${detail.info ?? ""}`);
    setSide(!!detail.down);
  });
}
