import { useEffect, useRef, useState, type RefObject } from "react";
import { onPalm, palmActive, penStrokeErasing, pointerKind } from "../lib/inputState";

export interface LongPress {
  clientX: number;
  clientY: number;
  pointerType: string;
  target: Element;
}

/** 길게 누르기로 보는 시간 (펜은 점 찍기와 헷갈리지 않게 조금 길게) */
const LONG_PRESS_MS = { pen: 600, touch: 500 } as const;
export const LONG_PRESS_SLOP = 10;

interface Options {
  /** 펜·손가락으로 길게 누르기, 마우스 오른쪽 클릭 → 메뉴 */
  onLongPress?: (p: LongPress) => void;
  /** 펜 길게 누르기를 받을지 (지우개로 지우는 중에는 받지 않는다) */
  penLongPress?: boolean;
  /** 손가락으로 필기층을 톡 눌렀을 때 (판서 모드 웹 페이지 → 조작 모드) */
  onFingerTap?: () => void;
}

/**
 * 페이지 영역의 길게 누르기·오른쪽 클릭 메뉴와 손가락 톡 (v0.44: 한 장씩 보기·이어 보기가 같이 쓰도록 PageView에서 떼어 냄).
 * 누른 자리에 차오르는 원(ring)을 돌려준다 (영역 기준 px)
 */
export function useLongPressMenu(areaRef: RefObject<HTMLElement | null>, opts: Options) {
  const [ring, setRing] = useState<{ x: number; y: number; ms: number } | null>(null);
  const longPressRef = useRef(opts.onLongPress);
  longPressRef.current = opts.onLongPress;
  const penLongPressRef = useRef(opts.penLongPress ?? true);
  penLongPressRef.current = opts.penLongPress ?? true;
  const fingerTapRef = useRef(opts.onFingerTap);
  fingerTapRef.current = opts.onFingerTap;
  useEffect(() => {
    const area = areaRef.current!;
    let press: { id: number; x: number; y: number; type: string; target: Element; timer: number; ringTimer: number } | null = null;
    let firedAt = 0;
    // 손가락으로 톡 누르기 (판서 모드 웹 페이지 → 조작 모드)
    let tap: { id: number; x: number; y: number; t: number; onInk: boolean } | null = null;
    // 팔레트·넘기기 바 같은 떠 있는 도구 위는 빼고, 페이지와 글상자 위만
    const eligible = (t: Element) => !!t.closest(".text-box") || !t.closest("[data-no-gesture]");
    const cancel = () => {
      if (!press) return;
      clearTimeout(press.timer);
      clearTimeout(press.ringTimer);
      press = null;
      setRing(null);
    };
    const fire = () => {
      const p = press;
      if (!p) return;
      cancel();
      firedAt = performance.now();
      // 쓰기 시작한 점·끌던 상자를 버리게 알린다
      window.dispatchEvent(new Event("lessondeck:longpress"));
      navigator.vibrate?.(12);
      longPressRef.current?.({ clientX: p.x, clientY: p.y, pointerType: p.type, target: p.target });
    };
    const onDown = (e: PointerEvent) => {
      const kind = pointerKind(e);
      // 손바닥이 닿아 있는 동안(v0.32)의 손가락은 톡·길게 누르기가 아니다
      if (kind === "touch" && palmActive()) {
        if (press?.type === "touch") cancel();
        tap = null;
        return;
      }
      tap =
        kind === "touch" && !tap
          ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), onInk: !!(e.target as Element).closest?.(".ink-live") }
          : null;
      if (press) {
        // 두 번째 손가락 → 확대·이동
        cancel();
        return;
      }
      if (!longPressRef.current || kind === "mouse") return;
      if (kind === "pen" && (!penLongPressRef.current || penStrokeErasing(e))) return;
      const target = e.target as Element;
      if (!eligible(target)) return;
      const ms = kind === "pen" ? LONG_PRESS_MS.pen : LONG_PRESS_MS.touch;
      const r = area.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      press = {
        id: e.pointerId,
        x,
        y,
        type: kind,
        target,
        // 잠깐 지나면 누른 자리에 원이 차오르며 곧 메뉴가 열린다는 걸 보여 준다
        ringTimer: window.setTimeout(() => setRing({ x: x - r.left, y: y - r.top, ms: ms - 150 }), 150),
        timer: window.setTimeout(fire, ms),
      };
    };
    const onMove = (e: PointerEvent) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP) cancel();
    };
    const onUp = (e: PointerEvent) => {
      if (press && e.pointerId === press.id) cancel();
      const t = tap;
      tap = null;
      if (
        e.type === "pointerup" &&
        t?.id === e.pointerId &&
        t.onInk &&
        performance.now() - t.t < 350 &&
        Math.hypot(e.clientX - t.x, e.clientY - t.y) < LONG_PRESS_SLOP
      ) {
        fingerTapRef.current?.();
      }
    };
    // 길게 누른 뒤 손을 떼며 생기는 click(링크 이동, 글상자 만들기)은 버린다
    const onClick = (e: MouseEvent) => {
      if (performance.now() - firedAt < 800) {
        firedAt = 0;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const type = (e as PointerEvent).pointerType || "mouse";
      // 손가락·펜 길게 누르기에 브라우저가 보내는 메뉴 신호: 우리 타이머가 처리 (먼저 오면 바로 연다)
      if (type !== "mouse") {
        if (press) fire();
        return;
      }
      const target = e.target as Element;
      if (!longPressRef.current || !eligible(target)) return;
      longPressRef.current({ clientX: e.clientX, clientY: e.clientY, pointerType: "mouse", target });
    };
    // 손바닥으로 판정되면 (v0.32) 손가락 길게 누르기·톡을 버린다 (펜 길게 누르기는 그대로)
    const offPalm = onPalm(() => {
      if (press?.type === "touch") cancel();
      tap = null;
    });
    area.addEventListener("pointerdown", onDown, true);
    area.addEventListener("pointermove", onMove, true);
    area.addEventListener("pointerup", onUp, true);
    area.addEventListener("pointercancel", onUp, true);
    area.addEventListener("click", onClick, true);
    area.addEventListener("contextmenu", onContextMenu);
    return () => {
      offPalm();
      cancel();
      area.removeEventListener("pointerdown", onDown, true);
      area.removeEventListener("pointermove", onMove, true);
      area.removeEventListener("pointerup", onUp, true);
      area.removeEventListener("pointercancel", onUp, true);
      area.removeEventListener("click", onClick, true);
      area.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  return ring;
}
