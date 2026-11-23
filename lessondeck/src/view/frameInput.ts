// 웹 페이지 액자 안의 손가락·펜 (v0.38~0.39, SPEC 6장 "웹 페이지 두 손가락 확대·스포트라이트").
// 액자 안의 터치는 앱(바깥 문서)에 오지 않는다.
// - HTML 파일 페이지: 액자 안 안내 스크립트(htmlFrame.ts)가 알려 준 것을 앱 화면 좌표로 바꿔 넘긴다.
// - 다른 사이트(웹 주소·유튜브) 페이지: 스크립트를 넣을 수 없으므로 안드로이드 앱이 터치를 먼저 보고 알려 준다
//   (WebGestures.java: lessondeckpinch·lessondeckpointer, 웹뷰 CSS px = 앱 화면 좌표). 브라우저(웹 버전)에서는 안 된다.
// 두 손가락 → 페이지 확대·축소(PageView), 펜·손가락 자리 → 스포트라이트(부탁했을 때만).

/** 앱 화면(client) 좌표 */
export interface ClientPoint {
  x: number;
  y: number;
}

/** [screenX, screenY, 액자 안 clientX, clientY] */
type Raw = [number, number, number, number];

export interface PinchMessage {
  phase: "start" | "move" | "end";
  a?: Raw;
  b?: Raw;
  /** 두 손가락 중 더 큰 접촉 반지름 (액자 CSS px) */
  r: number;
}

const isRaw = (v: unknown): v is Raw => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));

export function parsePinchMessage(data: unknown): PinchMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { lessondeck?: unknown; phase?: unknown; a?: unknown; b?: unknown; r?: unknown };
  if (d.lessondeck !== "pinch") return null;
  if (d.phase === "end") return { phase: "end", r: 0 };
  if (d.phase !== "start" && d.phase !== "move") return null;
  if (!isRaw(d.a) || !isRaw(d.b)) return null;
  return { phase: d.phase, a: d.a, b: d.b, r: typeof d.r === "number" && Number.isFinite(d.r) ? d.r : 0 };
}

export function parsePointerMessage(data: unknown): Raw | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { lessondeck?: unknown; s?: unknown };
  return d.lessondeck === "pointer" && isRaw(d.s) ? d.s : null;
}

/** 손바닥으로 보는 접촉 크기 (지름, 앱 CSS px) — inputState와 같은 값 */
const PALM_SIZE_CSS = 64;

export interface FramePinch {
  pageId: string;
  phase: "start" | "move" | "end";
  a?: ClientPoint;
  b?: ClientPoint;
}

const pinchListeners = new Set<(p: FramePinch) => void>();
const pointerListeners = new Set<(p: ClientPoint) => void>();
let tracking = false;
/** 앱이 받은 포인터의 screen − client (액자가 알려 준 screen 좌표를 앱 좌표로 바꿀 때). 모르면 액자 위치로 */
let screenOffset: ClientPoint | null = null;

function frameOf(source: MessageEventSource | null): HTMLIFrameElement | null {
  if (!source) return null;
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(".web-frame[data-page-id] iframe")) {
    if (frame.contentWindow === source) return frame;
  }
  return null;
}

/** 액자가 알려 준 자리 → 앱 화면 좌표. screen 좌표는 페이지 확대와 상관없어 확대하는 동안에도 흔들리지 않는다 */
function toClient(frame: HTMLIFrameElement, [sx, sy, lx, ly]: Raw): ClientPoint {
  if (screenOffset) return { x: sx - screenOffset.x, y: sy - screenOffset.y };
  const r = frame.getBoundingClientRect();
  const k = frame.offsetWidth ? r.width / frame.offsetWidth : 1;
  return { x: r.left + lx * k, y: r.top + ly * k };
}

let pinching: string | null = null;

if (typeof window !== "undefined") {
  const calibrate = (e: PointerEvent) => {
    screenOffset = { x: e.screenX - e.clientX, y: e.screenY - e.clientY };
  };
  window.addEventListener("pointerdown", calibrate, { capture: true, passive: true });
  window.addEventListener("pointermove", calibrate, { capture: true, passive: true });
  window.addEventListener("message", (e) => {
    const data = e.data as { lessondeck?: unknown } | null;
    if (!data || typeof data !== "object" || typeof data.lessondeck !== "string") return;
    if (data.lessondeck === "hello") {
      // 새로 열린 액자: 지금 스포트라이트가 켜져 있는지 알려 준다
      (e.source as Window | null)?.postMessage({ lessondeck: "track", on: tracking }, "*");
      return;
    }
    const pointer = parsePointerMessage(data);
    if (pointer) {
      const frame = tracking ? frameOf(e.source) : null;
      if (!frame) return;
      const p = toClient(frame, pointer);
      for (const fn of pointerListeners) fn(p);
      return;
    }
    const pinch = parsePinchMessage(data);
    if (!pinch) return;
    const frame = frameOf(e.source);
    const pageId = frame?.closest<HTMLElement>(".web-frame")?.dataset.pageId;
    if (!frame || !pageId) return;
    const end = () => {
      if (pinching !== pageId) return;
      pinching = null;
      for (const fn of pinchListeners) fn({ pageId, phase: "end" });
    };
    if (pinch.phase === "end") return end();
    // 손바닥이 섞인 두 손가락은 확대가 아니다
    const k = frame.offsetWidth ? frame.getBoundingClientRect().width / frame.offsetWidth : 1;
    if (pinch.r * 2 * k >= PALM_SIZE_CSS) return end();
    const phase = pinching === pageId ? "move" : "start";
    pinching = pageId;
    const a = toClient(frame, pinch.a!);
    const b = toClient(frame, pinch.b!);
    for (const fn of pinchListeners) fn({ pageId, phase, a, b });
  });
}

/** 웹앱 위 두 손가락 (확대·축소) */
export function onFramePinch(fn: (p: FramePinch) => void): () => void {
  installNative();
  pinchListeners.add(fn);
  return () => pinchListeners.delete(fn);
}

/** 웹앱 위 펜·손가락 자리 (setFrameTracking(true)인 동안만) */
export function onFramePointer(fn: (p: ClientPoint) => void): () => void {
  installNative();
  pointerListeners.add(fn);
  return () => pointerListeners.delete(fn);
}

/** 액자들에게(앱이면 안드로이드에도) 펜·손가락 자리를 알려 달라고(또는 그만) 한다 */
export function setFrameTracking(on: boolean) {
  tracking = on;
  try {
    nativeBridge()?.trackPointers?.(on);
  } catch {
    // 옛 앱(0.38 이하 네이티브)은 이 기능이 없다
  }
  // HTML 파일 페이지(srcdoc)에만: 웹 주소 페이지는 다른 사이트라 보내지 않는다
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(".web-frame iframe[srcdoc]")) {
    try {
      frame.contentWindow?.postMessage({ lessondeck: "track", on }, "*");
    } catch {
      // 다른 사이트 액자 등은 그대로
    }
  }
}

// ── 다른 사이트 페이지: 안드로이드 앱이 알려 준다 (v0.39) ──

interface NativeBridge {
  pinchZone?(left: number, top: number, width: number, height: number): void;
  trackPointers?(on: boolean): void;
}

function nativeBridge(): NativeBridge | undefined {
  return (window as unknown as { LessonDeckPen?: NativeBridge }).LessonDeckPen;
}

/** 안드로이드가 보낸 두 손가락 메시지 (웹뷰 CSS px) */
export function parseNativePinch(data: unknown): { phase: "start" | "move" | "end"; a?: ClientPoint; b?: ClientPoint } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { phase?: unknown; ax?: unknown; ay?: unknown; bx?: unknown; by?: unknown };
  if (d.phase === "end") return { phase: "end" };
  if (d.phase !== "start" && d.phase !== "move") return null;
  const n = [d.ax, d.ay, d.bx, d.by];
  if (!n.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [ax, ay, bx, by] = n as number[];
  return { phase: d.phase, a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

/** 두 손가락을 안드로이드가 가져가 확대할 구역 (지금 페이지가 다른 사이트일 때 그 페이지 영역). null이면 끔 */
export function setNativePinchZone(rect: { left: number; top: number; width: number; height: number } | null) {
  try {
    nativeBridge()?.pinchZone?.(rect?.left ?? 0, rect?.top ?? 0, rect?.width ?? 0, rect?.height ?? 0);
  } catch {
    // 옛 앱은 이 기능이 없다
  }
}

let nativeInstalled = false;
/** 안드로이드가 보낸 두 손가락은 "지금 페이지"의 확대 (구역은 다른 사이트 페이지일 때만 켜 둔다) */
export const NATIVE_PAGE = "@native";

function installNative() {
  if (nativeInstalled || typeof window === "undefined") return;
  nativeInstalled = true;
  window.addEventListener("lessondeckpinch", (e) => {
    const p = parseNativePinch(e);
    if (!p) return;
    for (const fn of pinchListeners) fn({ pageId: NATIVE_PAGE, ...p });
  });
  window.addEventListener("lessondeckpointer", (e) => {
    const d = e as Event & { x?: unknown; y?: unknown };
    if (!tracking || typeof d.x !== "number" || typeof d.y !== "number") return;
    for (const fn of pointerListeners) fn({ x: d.x, y: d.y });
  });
}
