import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

interface Props {
  /** 페이지 영역 크기 (바를 그 안에서만 움직인다) */
  area: { width: number; height: number };
  label: string;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (delta: 1 | -1) => void;
  /** 바 오른쪽에 붙는 버튼들 (강의 모드 도구) */
  extra?: ReactNode;
}

/** 남는 공간 대비 위치(0~1). 화면 크기·방향이 바뀌어도 같은 자리 근처에 있다. null이면 아래 가운데 */
type NavPos = { x: number; y: number } | null;

const POS_KEY = "lessondeck.pageNavPos";
/** 이만큼 움직여야 끌기로 본다 (그냥 누른 것과 구분) */
const DRAG_SLOP = 4;
const DOUBLE_TAP_MS = 350;

// 이전/다음 페이지 바. 버튼이 아닌 곳(손잡이·쪽수)을 잡고 끌어 원하는 자리로 옮긴다.
export function PageNav({ area, label, hasPrev, hasNext, onNavigate, extra }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<NavPos>(loadPos);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const freeW = Math.max(0, area.width - size.width);
  const freeH = Math.max(0, area.height - size.height);
  const placed = pos && size.width > 0 && area.width > 0;
  const style = placed ? { left: Math.round(pos.x * freeW), top: Math.round(pos.y * freeH), bottom: "auto", transform: "none" } : undefined;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button") || e.button > 0) return;
    const el = ref.current!;
    const box = el.getBoundingClientRect();
    const parent = (el.offsetParent ?? el.parentElement!).getBoundingClientRect();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: box.left - parent.left, top: box.top - parent.top, moved: false };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
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
    setPos({ x: freeW ? left / freeW : 0.5, y: freeH ? top / freeH : 1 });
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (d.moved) {
      if (pos) savePos(pos);
      return;
    }
    // 손잡이를 두 번 톡톡 → 원래 자리(아래 가운데)
    const now = performance.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      setPos(null);
      savePos(null);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  return (
    <div
      ref={ref}
      className={`page-nav${dragging ? " dragging" : ""}`}
      style={style}
      data-no-gesture
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <span className="page-nav-grip" title="끌어서 옮기기 · 두 번 누르면 원래 자리" aria-hidden="true">
        <GripVertical size={18} />
      </span>
      <button aria-label="이전 페이지" disabled={!hasPrev} onClick={() => onNavigate(-1)}>
        <ChevronLeft size={22} />
      </button>
      <span className="page-nav-count">{label}</span>
      <button aria-label="다음 페이지" disabled={!hasNext} onClick={() => onNavigate(1)}>
        <ChevronRight size={22} />
      </button>
      {extra}
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function loadPos(): NavPos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.x === "number" && typeof p?.y === "number" ? { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) } : null;
  } catch {
    return null;
  }
}

function savePos(pos: NavPos) {
  try {
    if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    else localStorage.removeItem(POS_KEY);
  } catch {
    // 저장이 막혀 있어도 이번 실행에서는 그 자리에 있다
  }
}
