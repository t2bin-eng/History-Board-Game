import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

// 홈 카드 길게 누르기·끌어서 옮기기.
// 손가락·펜: 길게 누르면 카드가 들리고, 그대로 끌면 옮기기, 움직이지 않고 떼면 메뉴.
// 마우스: 누른 채 움직이면 바로 끌기, 오른쪽 클릭은 메뉴.
// 놓을 곳은 data-drop 속성이 있는 요소 (폴더 id, 맨 위 "내 문서"는 빈 문자열).

export interface CardItem {
  kind: "doc" | "folder";
  id: string;
}

export const itemKey = (item: CardItem) => `${item.kind}:${item.id}`;

export interface DragGhost {
  label: string;
  x: number;
  y: number;
  /** 지금 놓을 수 있는 곳 (null = 내 문서, undefined = 없음) */
  over: string | null | undefined;
}

interface Options {
  onMenu: (item: CardItem, x: number, y: number) => void;
  onDrop: (item: CardItem, target: string | null) => void;
  canDrop: (item: CardItem, target: string | null) => boolean;
  ghostLabel: (item: CardItem) => string;
  /** 끄는 동안 가장자리에서 스크롤할 영역 */
  scroller: () => HTMLElement | null;
}

interface Press {
  item: CardItem;
  pointerId: number;
  type: string;
  x0: number;
  y0: number;
  x: number;
  y: number;
  lifted: boolean;
  dragging: boolean;
  timer: number;
  detach: () => void;
}

const TOUCH_SLOP = 10;
const MOUSE_SLOP = 6;
const HOLD_MS = { touch: 500, pen: 600 } as Record<string, number>;
const EDGE = 56;

export function useCardDrag(options: Options) {
  const opts = useRef(options);
  opts.current = options;
  const press = useRef<Press | null>(null);
  /** 길게 누르거나 끈 손이 떨어질 때 따라오는 click 하나를 버린다 (다음에 누르면 풀림) */
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);

  // 카드가 들린 뒤에는 손가락을 움직여도 화면이 스크롤되지 않게
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (press.current?.lifted || press.current?.dragging) e.preventDefault();
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      press.current?.detach();
    };
  }, []);

  const finish = (p: Press) => {
    clearTimeout(p.timer);
    p.detach();
    if (press.current === p) press.current = null;
    setLifted(null);
    setGhost(null);
  };

  const lift = (p: Press) => {
    if (p.lifted || press.current !== p) return;
    p.lifted = true;
    setLifted(itemKey(p.item));
  };

  const dropTarget = (p: Press): string | null | undefined => {
    const el = document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>("[data-drop]");
    if (!el) return undefined;
    const target = el.dataset.drop || null;
    return opts.current.canDrop(p.item, target) ? target : undefined;
  };

  const startDrag = (p: Press) => {
    p.dragging = true;
    clearTimeout(p.timer);
    setLifted(itemKey(p.item));
    setGhost({ label: opts.current.ghostLabel(p.item), x: p.x, y: p.y, over: dropTarget(p) });
  };

  const onMove = (p: Press, e: PointerEvent) => {
    p.x = e.clientX;
    p.y = e.clientY;
    const dist = Math.hypot(p.x - p.x0, p.y - p.y0);
    if (!p.dragging) {
      if (p.type === "mouse" ? dist > MOUSE_SLOP : p.lifted && dist > TOUCH_SLOP) startDrag(p);
      else if (!p.lifted && dist > TOUCH_SLOP) {
        // 스크롤하려는 손가락
        finish(p);
      }
      return;
    }
    e.preventDefault();
    const box = opts.current.scroller()?.getBoundingClientRect();
    const el = opts.current.scroller();
    if (box && el) {
      if (p.y < box.top + EDGE) el.scrollBy(0, -14);
      else if (p.y > box.bottom - EDGE) el.scrollBy(0, 14);
    }
    setGhost((g) => g && { ...g, x: p.x, y: p.y, over: dropTarget(p) });
  };

  const onUp = (p: Press, cancelled: boolean) => {
    if (p.dragging) {
      suppressClick.current = true;
      const target = cancelled ? undefined : dropTarget(p);
      finish(p);
      if (target !== undefined) opts.current.onDrop(p.item, target);
      return;
    }
    const wasLifted = p.lifted;
    finish(p);
    if (wasLifted) {
      suppressClick.current = true;
      opts.current.onMenu(p.item, p.x, p.y);
    }
  };

  const bind = (item: CardItem) => ({
    onPointerDown(e: ReactPointerEvent) {
      suppressClick.current = false;
      if (e.button !== 0 || press.current) return;
      if ((e.target as HTMLElement).closest(".card-menu-btn")) return;
      const p: Press = {
        item,
        pointerId: e.pointerId,
        type: e.pointerType,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        lifted: false,
        dragging: false,
        timer: 0,
        detach: () => {},
      };
      const move = (ev: PointerEvent) => ev.pointerId === p.pointerId && onMove(p, ev);
      const up = (ev: PointerEvent) => ev.pointerId === p.pointerId && onUp(p, false);
      const cancel = (ev: PointerEvent) => ev.pointerId === p.pointerId && onUp(p, true);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", cancel, true);
      p.detach = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", cancel, true);
      };
      if (p.type !== "mouse") p.timer = window.setTimeout(() => lift(p), HOLD_MS[p.type] ?? HOLD_MS.touch);
      press.current = p;
    },
    onContextMenu(e: ReactMouseEvent) {
      e.preventDefault();
      const type = (e.nativeEvent as PointerEvent).pointerType || "mouse";
      const p = press.current;
      // 손가락·펜으로 길게 누를 때 브라우저가 보내는 것 → 들어 올리기만 (메뉴는 뗄 때)
      if (p && p.type !== "mouse") lift(p);
      else if (type === "mouse" || !p) opts.current.onMenu(item, e.clientX, e.clientY);
    },
    onClickCapture(e: ReactMouseEvent) {
      // 길게 누르거나 끈 뒤에 따라오는 click은 버린다
      if (suppressClick.current) {
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onDragStart(e: ReactDragEvent) {
      e.preventDefault();
    },
  });

  return { bind, ghost, lifted };
}
