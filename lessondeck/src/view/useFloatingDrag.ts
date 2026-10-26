import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** 남는 공간 대비 위치(0~1). 화면 크기·방향이 바뀌어도 같은 자리 근처에 있다. null이면 CSS 기본 자리 */
export type FloatPos = { x: number; y: number } | null;

interface Options {
  /** 위치를 기억할 localStorage 키 (기기별 편의 설정) */
  storageKey: string;
  /** 누른 곳에서 끌기를 시작할지 (손잡이만, 버튼 빼고 등) */
  canStart: (target: Element) => boolean;
  /** 끌지 않고 뗐을 때 */
  onTap?: () => void;
}

/** 이만큼 움직여야 끌기로 본다 (그냥 누른 것과 구분) */
const DRAG_SLOP = 4;

// 페이지 영역 위에 떠 있는 바(넘기기 바, 펜 팔레트)를 끌어 옮긴다.
// 부모(페이지 영역) 밖으로는 못 나가고, 위치는 비율로 저장한다.
export function useFloatingDrag<T extends HTMLElement>({ storageKey, canStart, onTap }: Options) {
  const ref = useRef<T>(null);
  const [pos, setPosState] = useState<FloatPos>(() => loadPos(storageKey));
  const posRef = useRef(pos);
  const setPos = (p: FloatPos) => {
    posRef.current = p;
    setPosState(p);
  };
  const [box, setBox] = useState({ w: 0, h: 0, pw: 0, ph: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight, pw: parent.clientWidth, ph: parent.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const freeW = Math.max(0, box.pw - box.w);
  const freeH = Math.max(0, box.ph - box.h);
  const style: CSSProperties | undefined =
    pos && box.w > 0 && box.pw > 0
      ? { left: Math.round(pos.x * freeW), top: Math.round(pos.y * freeH), right: "auto", bottom: "auto", transform: "none" }
      : undefined;

  const onPointerDown = (e: ReactPointerEvent<T>) => {
    if (e.button > 0 || !canStart(e.target as Element)) return;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const p = el.parentElement!.getBoundingClientRect();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left - p.left, top: r.top - p.top, moved: false };
    // 누른 요소(손잡이)가 잡아 두면 빨리 끌어도 바 밖으로 빠지지 않고, 그냥 누른 경우엔 그 요소의 click도 그대로 난다
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<T>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      d.moved = true;
      setDragging(true);
    }
    const left = clamp(d.left + dx, 0, freeW);
    const top = clamp(d.top + dy, 0, freeH);
    setPos({ x: freeW ? left / freeW : 0.5, y: freeH ? top / freeH : 0.5 });
  };

  const onPointerEnd = (e: ReactPointerEvent<T>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      if (e.type === "pointerup") onTap?.();
      return;
    }
    setDragging(false);
    savePos(storageKey, posRef.current);
    // 끌고 놓은 자리의 버튼이 눌리지 않게 바로 뒤 click 한 번은 버린다
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 80);
  };

  const onClickCapture = (e: ReactMouseEvent<T>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const reset = useCallback(() => {
    posRef.current = null;
    setPosState(null);
    savePos(storageKey, null);
  }, [storageKey]);

  return {
    ref,
    style,
    dragging,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function loadPos(key: string): FloatPos {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.x === "number" && typeof p?.y === "number" ? { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) } : null;
  } catch {
    return null;
  }
}

function savePos(key: string, pos: FloatPos) {
  try {
    if (pos) localStorage.setItem(key, JSON.stringify(pos));
    else localStorage.removeItem(key);
  } catch {
    // 저장이 막혀 있어도 이번 실행에서는 그 자리에 있다
  }
}
