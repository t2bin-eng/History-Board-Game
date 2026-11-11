import { debugStats, pushLog, recordNativePen } from "./debugStore";
import { isNativeApp } from "./platform";

// 화면 전체에서 공유하는 펜 입력 상태.
// - 닿은 것이 S펜인지 손인지 (pointerKind): 웹뷰가 넘기는 pointerType만 믿지 않고, 앱이면 안드로이드에 직접 묻는다
// - 펜을 마지막으로 쓴(또는 띄워 둔) 시각: 그 직후의 터치는 손바닥으로 보고 무시한다
// - S펜 사이드 버튼(또는 PC 마우스 오른쪽 버튼)을 누르고 있는지: 누르는 동안 지우개로 바뀐다
// - 화면에 닿아 있는 손가락 수: 두 손가락 이상이면 필기가 아니라 확대·이동

/** 펜 사용 직후 이 시간 동안은 터치를 손바닥으로 본다 */
const PALM_GUARD_MS = 800;

let lastPenTime = -Infinity;
let sideButton = false;
/** S펜 버튼을 마지막으로 뗀 시각 */
let lastSideUp = -Infinity;
/** 안드로이드 앱이 S펜 버튼 상태를 직접 알려 주는지 (lessondecksidebutton 이벤트, PenInput.java) */
let nativeSide = false;
const touches = new Set<number>();
const listeners = new Set<(down: boolean) => void>();
const penDownListeners = new Set<() => void>();

/** 필기·제스처가 보는 입력 종류. 손가락·손바닥·종류를 알 수 없는 접촉은 모두 "touch" */
export type PointerKind = "pen" | "mouse" | "touch";

/** 펜이라고 왔어도 접촉이 이만큼(CSS px) 넘게 굵으면 손가락으로 본다 (S펜 촉은 1~2px) */
const FINGER_SIZE_CSS = 16;

/** 닿을 때 정한 포인터별 종류 (뗀 뒤 그 이벤트 처리가 끝나면 지운다) */
const kinds = new Map<number, { kind: PointerKind }>();

/**
 * 이 포인터가 S펜(pen)·마우스(mouse)·손(touch) 중 무엇인지.
 * 닿는 순간(pointerdown) 한 번 정해 뗄 때까지 그대로 쓴다. 정하기 전(펜을 띄운 채 움직임 등)은 pointerType으로.
 */
export function pointerKind(e: PointerEvent): PointerKind {
  return kinds.get(e.pointerId)?.kind ?? kindByType(e.pointerType);
}

/** pointerType만으로: "pen"·"mouse"가 아니면("touch", 알 수 없음 "" 등) 손으로 본다 */
function kindByType(type: string): PointerKind {
  if (type === "pen") return "pen";
  if (type === "mouse") return "mouse";
  return "touch";
}

/**
 * 닿는 순간의 판정.
 * 1) 앱: 안드로이드에 "이 자리에 닿은 것이 S펜인가"를 묻는다. S펜은 터치 화면과 따로 있는 펜 감지판으로 들어오므로
 *    안드로이드의 답(stylus / finger)이 가장 확실하다. 손가락이 펜으로 오거나 펜이 손가락으로 와도 바로잡는다.
 * 2) 앱이 모르면(브라우저 등) pointerType, 단 펜이라도 접촉이 굵으면(손가락 크기) 손으로 본다.
 */
function classify(e: PointerEvent): { kind: PointerKind; why: string } {
  if (e.pointerType === "mouse") return { kind: "mouse", why: "마우스" };
  const pen = nativePen();
  if (pen?.toolAt) {
    let answer = "";
    try {
      const dpr = window.devicePixelRatio || 1;
      answer = String(pen.toolAt(e.clientX * dpr, e.clientY * dpr));
    } catch {
      answer = "";
    }
    const [tool, ...rest] = answer.split(" ");
    const size = rest[rest.length - 1] ?? "";
    if (tool === "stylus") return { kind: "pen", why: `앱: S펜 (접촉 ${size}px)` };
    if (tool === "finger") return { kind: "touch", why: `앱: 손가락 (접촉 ${size}px)` };
    if (tool === "other") return { kind: "touch", why: `앱: 기타 도구 ${rest[0]} (접촉 ${size}px)` };
  }
  const size = Math.max(e.width || 0, e.height || 0);
  if (e.pointerType === "pen" && size >= FINGER_SIZE_CSS) return { kind: "touch", why: `펜으로 왔지만 굵음 ${size.toFixed(0)}px → 손` };
  const kind = kindByType(e.pointerType);
  return { kind, why: `${e.pointerType || "알 수 없음"} → ${kind === "pen" ? "펜" : "손"}` };
}

/** S펜이 닿을 때마다 (펜 모드: 손가락 필기를 끈다) */
export function onPenDown(fn: () => void): () => void {
  penDownListeners.add(fn);
  return () => penDownListeners.delete(fn);
}

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

/** S펜 버튼을 누르고 있거나 막(0.7초 안) 뗐는지. 블루투스 S펜은 버튼을 누르면 페이지 넘김 키를 보내기도 한다 */
export function penButtonRecently(): boolean {
  return sideButton || performance.now() - lastSideUp < 700;
}

export function onSideButtonChange(fn: (down: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 안드로이드 앱이 웹 화면에 붙여 주는 S펜 창구 (android/.../PenInput.java JsBridge) */
interface NativePen {
  strokeErase(): boolean;
  /** 0.17부터: 웹뷰 기준 화면 px 자리에 닿은 것 ("stylus 크기", "finger 크기", "other 번호 크기", "none") */
  toolAt?(x: number, y: number): string;
  /** 0.26부터: S펜이 화면에 닿아 있는지 (띄운 채 버튼만 누르면 false) */
  stylusTouching?(): boolean;
}

function nativePen(): NativePen | undefined {
  return isNativeApp ? (window as unknown as { LessonDeckPen?: NativePen }).LessonDeckPen : undefined;
}

/**
 * 이 펜 획을 S펜 버튼을 누른 채 시작했는지 = 지우개 획인지.
 * 안드로이드 앱은 웹뷰가 버튼 상태를 제대로 넘기지 못해(삼성 동작 번호, 글자 고르기 가로채기) 앱이 펜 이벤트를 다듬고
 * 닿는 순간의 버튼을 기억해 둔다. 그 답을 window.LessonDeckPen으로 바로 받는다
 * (대화창(prompt)으로 묻던 0.16.1은 그동안 웹뷰가 터치를 버려 손가락·확대가 꼬였다). 앱의 답은 다음 획이 닿을 때까지 그대로다.
 */
export function penStrokeErasing(e: PointerEvent): boolean {
  const kind = pointerKind(e);
  if (kind === "touch") return false;
  if (hasSideButton(e)) return true;
  // 브라우저(PC 마우스 오른쪽 버튼, 버튼 신호가 이벤트에 실리는 펜): 지금 버튼 상태
  const pen = kind === "pen" ? nativePen() : undefined;
  if (!pen) return sideButton;
  try {
    return pen.strokeErase() === true;
  } catch {
    // 물을 수 없으면 버튼 신호(lessondecksidebutton)만 따른다
    return sideButton;
  }
}

/**
 * 펜 이벤트가 정말 화면에 닿은 것인지 안드로이드에 묻는다 (0.26).
 * 웹뷰는 펜을 띄운 채 S펜 버튼을 누르면 "왼쪽 버튼을 누른 채 닿음"처럼 넘겨서, 닿지 않았는데 글씨가 써졌다.
 * 앱이 아니거나 물을 수 없으면 true (이벤트만 보고 정한다)
 */
export function penTouching(e: PointerEvent): boolean {
  if (pointerKind(e) !== "pen") return true;
  const pen = nativePen();
  if (!pen?.stylusTouching) return true;
  try {
    return pen.stylusTouching() !== false;
  } catch {
    return true;
  }
}

/** 사이드 버튼(2) 또는 S펜 지우개 끝(32)이 눌린 이벤트인지 */
export function hasSideButton(e: PointerEvent): boolean {
  if (e.pointerType === "pen") return !!(e.buttons & 2 || e.buttons & 32 || e.button === 5);
  if (e.pointerType === "mouse") return !!(e.buttons & 2);
  return false;
}

function setSide(down: boolean) {
  if (down === sideButton) return;
  if (!down) lastSideUp = performance.now();
  sideButton = down;
  for (const fn of listeners) fn(down);
}

function track(e: PointerEvent) {
  if (e.type === "pointerdown") {
    const { kind, why } = classify(e);
    const entry = { kind };
    kinds.set(e.pointerId, entry);
    debugStats.lastJudgement = why;
    pushLog(`판정 ${why}`);
    if (kind === "pen") for (const fn of penDownListeners) fn();
  }
  const kind = pointerKind(e);
  if (e.type === "pointerup" || e.type === "pointercancel") {
    // 이 이벤트를 다른 곳(필기·제스처)이 다 처리한 뒤에 지운다
    const entry = kinds.get(e.pointerId);
    setTimeout(() => {
      if (kinds.get(e.pointerId) === entry) kinds.delete(e.pointerId);
    }, 0);
  }
  if (kind === "touch") {
    if (e.type === "pointerdown") {
      // 첫 손가락인데 남은 손가락이 있으면 그 뗌을 놓친 것이다 (남겨 두면 한 손가락도 두 손가락으로 센다)
      if (e.isPrimary) touches.clear();
      touches.add(e.pointerId);
    } else if (e.type === "pointerup" || e.type === "pointercancel") touches.delete(e.pointerId);
    return;
  }
  if (kind === "pen") lastPenTime = performance.now();
  // 앱이 버튼 상태를 알려 주면 그것을 따른다 (펜을 띄운 채 누를 때는 웹 이벤트에 버튼이 실리지 않음)
  if (nativeSide && kind === "pen") {
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
  // 입력 디버그: 키 (S펜 버튼·리모컨·키보드가 보내는 페이지 넘김 키를 찾으려고)
  window.addEventListener(
    "keydown",
    (e) => pushLog(`키 ${e.key || e.code}${e.repeat ? " (반복)" : ""}`),
    { capture: true },
  );
  window.addEventListener("lessondeckkey", (e) => {
    const d = e as Event & { key?: string; device?: string; repeat?: number };
    pushLog(`앱 키 ${d.key ?? "?"} · ${d.device || "장치 모름"}${d.repeat ? ` · 반복 ${d.repeat}` : ""}`);
  });
  window.addEventListener("lessondecksidebutton", (e) => {
    nativeSide = true;
    const detail = e as Event & { down?: boolean; info?: string };
    recordNativePen(`${detail.down ? "버튼 누름" : "버튼 뗌"} ${detail.info ?? ""}`);
    setSide(!!detail.down);
  });
}
