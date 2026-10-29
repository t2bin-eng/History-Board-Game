import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { penRecentlyActive } from "../lib/inputState";
import { clampView, identity, zoomAt, type Size, type View } from "./viewport";

interface Options {
  areaRef: RefObject<HTMLElement | null>;
  pageRef: RefObject<HTMLElement | null>;
  page: Size;
  area: Size;
  /** 켜져 있으면 페이지 위 한 손가락은 필기(InkCanvas 담당), 두 손가락만 확대·이동 */
  fingerDraw: boolean;
  /** 이 값이 바뀌면(페이지 전환) 배율을 원래대로 */
  resetKey: string;
  /** 한 손가락으로 쓸어 페이지 넘기기 */
  swipe: boolean;
  onSwipe: (delta: 1 | -1) => void;
  /** 확대·이동이 끝났을 때 최종 배율 (선명하게 다시 그리기용) */
  onZoomEnd: (z: number) => void;
}

type Mode = "idle" | "draw" | "swipe" | "pan" | "pinch";

interface Pt {
  x: number;
  y: number;
}

const SWIPE_MIN = 70;
const SWIPE_MAX_MS = 700;
const TAP_SLOP = 12;
const DOUBLE_TAP_MS = 320;

// 손가락 제스처 (SPEC 6장 입력 규칙: S펜 = 필기, 손가락 = 페이지 넘김·확대)
// - 두 손가락: 확대·축소와 이동
// - 한 손가락: 확대 상태면 이동, 아니면 좌우로 쓸어 페이지 넘김
// - 두 번 탭: 확대 ↔ 원래 크기
// 펜을 쓰는 중이거나 막 쓴 직후의 터치는 손바닥으로 보고 무시한다.
export function useViewportGestures(opts: Options) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const view = useRef<View>(identity);

  const apply = useCallback((animate = false) => {
    const el = optsRef.current.pageRef.current;
    if (!el) return;
    const { z, tx, ty } = view.current;
    el.style.transition = animate ? "transform 180ms ease-out" : "";
    el.style.transform = z === 1 && tx === 0 && ty === 0 ? "" : `translate(${tx}px, ${ty}px) scale(${z})`;
  }, []);

  const setView = useCallback(
    (v: View, animate = false) => {
      view.current = v;
      apply(animate);
    },
    [apply],
  );

  // 페이지가 바뀌거나 크기가 바뀌면 원래 크기로
  useLayoutEffect(() => {
    setView(identity);
    optsRef.current.onZoomEnd(1);
  }, [opts.resetKey, opts.page.width, opts.page.height, opts.area.width, opts.area.height, setView]);

  useEffect(() => {
    const area = optsRef.current.areaRef.current!;
    const pointers = new Map<number, Pt>();
    let mode: Mode = "idle";
    let areaRect = area.getBoundingClientRect();
    let start = { p: { x: 0, y: 0 }, t: 0, view: identity };
    let pinch = { d: 1, m: { x: 0, y: 0 }, view: identity };
    let lastTap: { p: Pt; t: number } | null = null;
    let zoomAtStart = 1;

    const local = (e: PointerEvent): Pt => ({ x: e.clientX - areaRect.left, y: e.clientY - areaRect.top });
    const two = () => [...pointers.values()].slice(0, 2);
    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const startPinch = () => {
      const [a, b] = two();
      pinch = { d: dist(a, b), m: mid(a, b), view: view.current };
      mode = "pinch";
    };

    const startSingle = (p: Pt) => {
      start = { p, t: performance.now(), view: view.current };
      mode = view.current.z > 1.01 ? "pan" : "swipe";
    };

    const endGesture = () => {
      mode = "idle";
      if (view.current.z !== zoomAtStart) optsRef.current.onZoomEnd(view.current.z);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "pen") {
        // 손바닥으로 화면을 끌던 중 펜이 닿으면 제스처를 멈춘다
        if (pointers.size) {
          pointers.clear();
          endGesture();
        }
        return;
      }
      if (e.pointerType !== "touch") return;
      // 첫 손가락인데 남은 손가락이 있으면 그 뗌을 놓친 것이다 (남겨 두면 한 손가락을 두 손가락 확대로 잘못 본다)
      if (e.isPrimary && pointers.size) {
        pointers.clear();
        endGesture();
      }
      // 첫 손가락이 팔레트·패널 위면 제스처가 아니다. 이미 페이지 위에 손가락이 있으면 두 번째 손가락은 어디든 인정
      if (pointers.size === 0 && (e.target as Element).closest?.("[data-no-gesture]")) return;
      if (penRecentlyActive()) return;
      if (pointers.size === 0) {
        areaRect = area.getBoundingClientRect();
        zoomAtStart = view.current.z;
      }
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        const onPage = (e.target as Element).classList?.contains("ink-live");
        if (optsRef.current.fingerDraw && onPage) {
          mode = "draw";
          start = { p, t: performance.now(), view: view.current };
        } else {
          startSingle(p);
        }
      } else if (pointers.size === 2) {
        startPinch();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      const { page, area: areaSize } = optsRef.current;
      if (mode === "pan") {
        setView(
          clampView(
            { z: start.view.z, tx: start.view.tx + p.x - start.p.x, ty: start.view.ty + p.y - start.p.y },
            page,
            areaSize,
          ),
        );
      } else if (mode === "pinch" && pointers.size >= 2) {
        const [a, b] = two();
        const z = pinch.view.z * (dist(a, b) / pinch.d);
        setView(zoomAt(pinch.view, pinch.m, mid(a, b), z, page, areaSize));
      }
    };

    const onTap = (p: Pt) => {
      const now = performance.now();
      if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < 40) {
        lastTap = null;
        const { page, area: areaSize } = optsRef.current;
        if (view.current.z > 1.01) setView(identity, true);
        else setView(zoomAt(view.current, p, p, 2, page, areaSize), true);
        optsRef.current.onZoomEnd(view.current.z);
        zoomAtStart = view.current.z;
        return;
      }
      lastTap = { p, t: now };
    };

    const onUp = (e: PointerEvent, cancelled: boolean) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      pointers.delete(e.pointerId);
      if (mode === "pinch") {
        if (pointers.size === 1) {
          // 한 손가락만 남으면 이어서 이동
          const [rest] = pointers.values();
          start = { p: rest, t: performance.now(), view: view.current };
          mode = view.current.z > 1.01 ? "pan" : "idle";
        } else if (pointers.size === 0) {
          endGesture();
        }
        return;
      }
      if (pointers.size > 0) return;
      const dx = p.x - start.p.x;
      const dy = p.y - start.p.y;
      const dt = performance.now() - start.t;
      const isTap = !cancelled && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && dt < 300;
      if (mode === "swipe" && !cancelled) {
        if (optsRef.current.swipe && Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < SWIPE_MAX_MS) {
          optsRef.current.onSwipe(dx < 0 ? 1 : -1);
        } else if (isTap) {
          onTap(p);
        }
      } else if (mode === "pan" && isTap) {
        onTap(p);
      }
      endGesture();
    };

    const up = (e: PointerEvent) => onUp(e, false);
    const cancel = (e: PointerEvent) => onUp(e, true);
    area.addEventListener("pointerdown", onDown);
    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerup", up);
    area.addEventListener("pointercancel", cancel);
    return () => {
      area.removeEventListener("pointerdown", onDown);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerup", up);
      area.removeEventListener("pointercancel", cancel);
    };
  }, [setView]);

  const resetZoom = useCallback(() => {
    setView(identity, true);
    optsRef.current.onZoomEnd(1);
  }, [setView]);

  return { resetZoom };
}
