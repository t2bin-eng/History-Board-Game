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
  if (e.pointerType === "pen") lastPenTime = performance.now();
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
    setSide(!!(e as Event & { down?: boolean }).down);
  });
}
