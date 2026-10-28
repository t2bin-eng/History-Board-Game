// 디버그 패널용 입력 통계.
// 필기 중 React 상태를 건드리면 매 이벤트마다 리렌더가 일어나 지연이 생기므로,
// 여기서는 평범한 객체에 값만 써 두고 패널이 일정 간격으로 읽어 간다.

export interface PointerSnapshot {
  type: string;
  pointerType: string;
  pressure: number;
  buttons: number;
  button: number;
  tiltX: number;
  tiltY: number;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface DebugStats {
  last: PointerSnapshot | null;
  /** 펜 입력에서 관측된 필압 최소·최대 (접촉 중일 때만) */
  penPressureMin: number;
  penPressureMax: number;
  penPressureSamples: number;
  sideButtonSeen: boolean;
  /** 안드로이드 앱이 S펜 버튼 신호를 직접 보냈는지 (PenInput.java) */
  nativeSideSeen: boolean;
  eraserTipSeen: boolean;
  penHoverSeen: boolean;
  /** 펜을 쓰는 중(또는 직후) 손바닥으로 보고 무시한 터치 수 */
  rejectedTouches: number;
  strokesDrawn: number;
  /** 최근 1초간 pointermove 이벤트 수 / 좌표 점 수 */
  moveEventsPerSec: number;
  pointsPerSec: number;
  lastCoalesced: number;
  lastPredicted: number;
  /** 이벤트 발생 → 처리 시작까지 걸린 시간(ms), 최근 평균 */
  inputDelayMs: number;
  /** 획 렌더링에 걸린 시간(ms), 최근 평균 */
  renderMs: number;
  log: string[];
}

export const debugStats: DebugStats = {
  last: null,
  penPressureMin: Infinity,
  penPressureMax: -Infinity,
  penPressureSamples: 0,
  sideButtonSeen: false,
  nativeSideSeen: false,
  eraserTipSeen: false,
  penHoverSeen: false,
  rejectedTouches: 0,
  strokesDrawn: 0,
  moveEventsPerSec: 0,
  pointsPerSec: 0,
  lastCoalesced: 0,
  lastPredicted: 0,
  inputDelayMs: 0,
  renderMs: 0,
  log: [],
};

let windowStart = 0;
let windowMoves = 0;
let windowPoints = 0;

export function recordPointer(e: PointerEvent, coalesced = 0, predicted = 0) {
  const s = debugStats;
  s.last = {
    type: e.type,
    pointerType: e.pointerType,
    pressure: e.pressure,
    buttons: e.buttons,
    button: e.button,
    tiltX: e.tiltX,
    tiltY: e.tiltY,
    width: e.width,
    height: e.height,
    isPrimary: e.isPrimary,
  };
  if (e.pointerType === "pen") {
    if (e.buttons & 2) s.sideButtonSeen = true;
    if (e.buttons & 32 || e.button === 5) s.eraserTipSeen = true;
    if (e.buttons === 0 && e.type === "pointermove") s.penHoverSeen = true;
    if (e.buttons & 1 && e.pressure > 0) {
      s.penPressureMin = Math.min(s.penPressureMin, e.pressure);
      s.penPressureMax = Math.max(s.penPressureMax, e.pressure);
      s.penPressureSamples++;
    }
  }
  if (e.type === "pointermove") {
    s.lastCoalesced = coalesced;
    s.lastPredicted = predicted;
    const now = performance.now();
    if (now - windowStart >= 1000) {
      s.moveEventsPerSec = windowMoves;
      s.pointsPerSec = windowPoints;
      windowStart = now;
      windowMoves = 0;
      windowPoints = 0;
    }
    windowMoves++;
    windowPoints += Math.max(1, coalesced);
    // e.timeStamp와 performance.now()는 같은 시간 기준을 쓴다
    const delay = now - e.timeStamp;
    if (delay >= 0 && delay < 1000) s.inputDelayMs = s.inputDelayMs * 0.9 + delay * 0.1;
  } else {
    pushLog(`${e.type.replace("pointer", "")} ${e.pointerType} b=${e.buttons} btn=${e.button} p=${e.pressure.toFixed(2)}`);
  }
}

/** 앱이 알려 준 S펜 버튼 (누름·뗌과 원래 동작 번호·버튼·도구) */
export function recordNativePen(line: string) {
  debugStats.nativeSideSeen = true;
  if (line.startsWith("버튼 누름")) debugStats.sideButtonSeen = true;
  pushLog(`앱 S펜 ${line}`);
}

export function recordRender(ms: number) {
  debugStats.renderMs = debugStats.renderMs * 0.9 + ms * 0.1;
}

export function pushLog(line: string) {
  const t = new Date();
  const stamp = `${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
  debugStats.log.unshift(`${stamp} ${line}`);
  if (debugStats.log.length > 12) debugStats.log.length = 12;
}
