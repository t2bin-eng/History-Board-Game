import { useEffect, useState } from "react";
import { palmActive, pointerKind } from "./inputState";

// S펜이 화면 가까이 있는지 (v0.35, SPEC 6장 "펜은 판서, 손가락은 조작").
// 안드로이드 앱이 S펜이 화면 위에 뜨거나(호버) 닿으면 near: true, 멀어지면 near: false를 알린다 (lessondeckpen, PenInput.java).
// 웹 페이지 판서 모드는 펜이 가까울 때만 필기층이 입력을 받고, 멀면 필기층을 비켜 손가락이 웹앱을 바로 조작하게 한다.

/** "멂"을 받은 뒤에도 이만큼은 가까운 것으로 본다: 펜을 댈 때 안드로이드가 "띄움 끝"을 먼저 보내고 곧 "닿음"을 보내며,
 *  쓰다가 잠깐 들어 올린 사이에 손이 웹앱을 누르지 않게 */
export const NEAR_HOLD_MS = 400;
/** 손바닥이 닿아 있으면 이 간격으로 다시 보고, 손바닥을 뗄 때까지 비키지 않는다 */
const PALM_RECHECK_MS = 200;

let near = false;
/** 안드로이드가 알려 준 가까움 */
let nativeNear = false;
/** 이 화면이 받은 펜 닿음 (알림이 늦거나 없어도 쓰는 동안은 비키지 않게) */
const penDown = new Set<number>();
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(near: boolean) => void>();

function set(v: boolean) {
  if (near === v) return;
  near = v;
  for (const fn of listeners) fn(v);
}

function release() {
  clearTimeout(timer);
  timer = setTimeout(function check() {
    // 손바닥이 아직 닿아 있으면 비키지 않는다 (펜을 들어도 손은 화면에 얹혀 있을 수 있다)
    if (palmActive()) {
      timer = setTimeout(check, PALM_RECHECK_MS);
      return;
    }
    set(false);
  }, NEAR_HOLD_MS);
}

function update() {
  if (nativeNear || penDown.size) {
    clearTimeout(timer);
    set(true);
  } else if (near) {
    release();
  }
}

/** 안드로이드가 알려 준 가까움 (lessondeckpen) */
export function reportPenNear(v: boolean) {
  nativeNear = v;
  // 안드로이드가 "멂"이라면 펜은 닿아 있지 않다: 뗌을 놓쳐 남은 펜 닿음 때문에 필기층이 계속 받는 일이 없게
  if (!v) penDown.clear();
  update();
}

/** 지금 S펜이 가까운지 */
export function penNear(): boolean {
  return near;
}

export function onPenNear(fn: (near: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 앱을 켤 때부터 듣는다: 웹 페이지를 여는 순간 이미 펜이 떠 있어도 알고 있게
if (typeof window !== "undefined") {
  window.addEventListener("lessondeckpen", (e) => reportPenNear(!!(e as Event & { near?: boolean }).near));
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (pointerKind(e) !== "pen") return;
      penDown.add(e.pointerId);
      update();
    },
    true,
  );
  const up = (e: PointerEvent) => {
    if (!penDown.delete(e.pointerId)) return;
    update();
  };
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
}

/** 켜져 있을 때만 S펜이 가까운지 지켜본다 (꺼져 있으면 늘 false) */
export function usePenNear(enabled: boolean): boolean {
  const [v, setV] = useState(() => enabled && near);
  useEffect(() => {
    if (!enabled) {
      setV(false);
      return;
    }
    setV(near);
    return onPenNear(setV);
  }, [enabled]);
  return enabled && v;
}
