import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { onViewMove, onViewSettled } from "./viewMotion";

// 페이지에 붙은 막대를 화면 기준으로 (v0.51.1)
// 글상자·스티커·고른 필기·도형·화살표 막대는 페이지 안에 있어 페이지를 확대하면 함께 커지고, 자리도 페이지 둘레 안으로만 맞춰
// 확대하면 화면 밖으로 나가거나(페이지 영역에 잘림), 좁은 화면에서는 왼쪽 펜 바 아래에 깔려 누를 수 없었다.
// 막대가 정한 자리(페이지 px)는 그대로 두고, 그 위에 transform으로
//  - 확대 배율만큼 줄여 늘 같은 크기로,
//  - 붙은 것(앵커)의 위·아래 화면 자리에(정한 간격은 확대한 만큼 — 함께 커지는 돌리기·크기 손잡이를 덮지 않게), 페이지 영역(보이는 곳) 안으로,
//  - 펜 바와 겹치면 옆으로 비킨다 (비킬 자리가 모자라면 비킨 쪽 폭에 맞춰 줄을 접는다).
// 배율 1이고 화면 안이고 펜 바와 안 겹치면 아무것도 바꾸지 않는다.

/** 막대의 offsetParent 좌표(페이지 px)로 본 붙은 것의 자리 */
export interface Anchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 페이지 영역 가장자리와 띄울 거리 */
export const EDGE = 4;
/** 펜 바와 띄울 거리 */
export const AVOID = 6;
/** 펜 바 옆으로 비킬 때 막대 폭이 이보다 좁아지면 비키지 않는다 */
const MIN_SIDE = 160;

export interface PlaceOptions {
  /** 위·아래를 가를 붙은 것의 원래 자리 (붙은 것도 옮겨졌을 때: 스티커 꾸미기 창 → 옮긴 막대) */
  natural?: Rect;
  /** 원래 간격에 곱할 값 (붙은 것이 화면 크기인 막대면 1/배율) */
  gapScale?: number;
  /** 붙은 것(막대)이 화면 기준으로 옮겨졌음: 그 막대 왼쪽에 맞추고, 원래 옆자리였으면 위·아래로 쌓는다 */
  stack?: boolean;
}

const STACK_GAP = 8;

/**
 * 화면 자리 계산 (순수 함수, 시험용)
 * @param r0 막대가 정한 자리의 화면 사각형 (배율 z로 커진 상태)
 * @param w 막대의 화면 폭·높이 (배율을 되돌린 뒤)
 * @param a 붙은 것의 화면 사각형
 * @param area 보이는 곳 (가장자리 여백을 뺀)
 * @param avoid 비킬 것 (펜 바)
 */
export function placeOnScreen(r0: Rect, w: number, h: number, a: Rect, area: Rect, avoid?: Rect | null, opt: PlaceOptions = {}): { x: number; y: number; clear: boolean } {
  const n = opt.natural ?? a;
  const movedAnchor = !!opt.stack;
  // 가로: 붙은 것 가운데에 가까운 막대 자리를 기준으로 줄인다 (z = 1이면 제자리). 옮겨진 막대에 붙으면 그 막대 왼쪽에 맞춘다
  let x: number;
  if (movedAnchor) x = a.left;
  else {
    const ax = (a.left + a.right) / 2;
    const px = Math.min(r0.right, Math.max(r0.left, ax));
    const f = r0.right > r0.left ? (px - r0.left) / (r0.right - r0.left) : 0;
    x = px - f * w;
  }
  // 세로: 붙은 것 위·아래 (정한 간격은 화면에서 그대로 = 확대한 만큼) — 그쪽에 자리가 없으면 반대쪽
  let above = r0.bottom <= n.top + 1;
  let below = !above && r0.top >= n.bottom - 1;
  let gap = (above ? n.top - r0.bottom : r0.top - n.bottom) * (opt.gapScale ?? 1);
  if (!above && !below && movedAnchor) {
    // 옆자리였으면 옮겨진 막대 아래(자리가 없으면 위)로 쌓는다
    gap = STACK_GAP;
    const roomDown = area.bottom - (a.bottom + gap);
    const roomUp = a.top - gap - area.top;
    below = roomDown >= h || (roomUp < h && roomDown >= roomUp);
    above = !below;
  }
  let y: number;
  if (above || below) {
    const upY = a.top - gap - h;
    const downY = a.bottom + gap;
    const upFits = upY >= area.top;
    const downFits = downY + h <= area.bottom;
    y = above ? (upFits || !downFits ? upY : downY) : downFits || !upFits ? downY : upY;
  } else {
    const py = Math.min(r0.bottom, Math.max(r0.top, (a.top + a.bottom) / 2));
    const g = r0.bottom > r0.top ? (py - r0.top) / (r0.bottom - r0.top) : 0;
    y = py - g * h;
  }
  y = Math.max(area.top, Math.min(area.bottom - h, y));
  x = Math.max(area.left, Math.min(area.right - w, x));
  // 펜 바와 겹치면 옆으로
  let clear = true;
  if (avoid && x < avoid.right && x + w > avoid.left && y < avoid.bottom && y + h > avoid.top) {
    const xr = avoid.right + AVOID;
    const xl = avoid.left - AVOID - w;
    const okR = xr + w <= area.right;
    const okL = xl >= area.left;
    if (okR && (!okL || Math.abs(xr - x) <= Math.abs(xl - x))) x = xr;
    else if (okL) x = xl;
    else clear = false;
  }
  return { x, y, clear };
}

/** 붙은 것: 페이지 px 자리, 또는 화면에 있는 다른 요소 (스티커 꾸미기 창 → 막대) */
export type AnchorLike = Anchor | RefObject<HTMLElement | null> | null | undefined;

function fit(bar: HTMLElement, anchor: AnchorLike) {
  const parent = bar.offsetParent as HTMLElement | null;
  const areaEl = bar.closest(".page-area") as HTMLElement | null;
  if (!parent || !areaEl) return;
  bar.style.transform = "";
  const pr = parent.getBoundingClientRect();
  const z = parent.offsetWidth > 0 ? pr.width / parent.offsetWidth : 1;
  const ar = areaEl.getBoundingClientRect();
  const area: Rect = { left: ar.left + EDGE, top: ar.top + EDGE, right: ar.right - EDGE, bottom: ar.bottom - EDGE };
  const pal = areaEl.querySelector<HTMLElement>(".pen-palette");
  const avoid = pal ? pal.getBoundingClientRect() : null;
  let a: Rect;
  let opt: PlaceOptions = {};
  if (anchor && "current" in anchor) {
    const el = anchor.current;
    if (!el) return;
    a = el.getBoundingClientRect();
    // 붙은 막대의 원래 자리(같은 offsetParent에서 옮기기 전)로 위·아래를 가르고, 원래 간격은 배율을 빼고
    if (el.offsetParent === parent) {
      const natural = { left: pr.left + el.offsetLeft * z, top: pr.top + el.offsetTop * z, right: pr.left + (el.offsetLeft + el.offsetWidth) * z, bottom: pr.top + (el.offsetTop + el.offsetHeight) * z };
      const moved = !!el.style.transform;
      opt = moved ? { natural, gapScale: 1 / z, stack: true } : { natural };
    }
  } else {
    const an = anchor ?? { x: 0, y: 0, w: parent.offsetWidth, h: parent.offsetHeight };
    a = { left: pr.left + an.x * z, top: pr.top + an.y * z, right: pr.left + (an.x + an.w) * z, bottom: pr.top + (an.y + an.h) * z };
  }

  const measure = (maxW: number) => {
    bar.style.maxWidth = `${Math.max(0, Math.floor(maxW))}px`;
    const r = bar.getBoundingClientRect();
    return { r0: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, w: bar.offsetWidth, h: bar.offsetHeight };
  };
  let m = measure(area.right - area.left);
  let at = placeOnScreen(m.r0, m.w, m.h, a, area, avoid, opt);
  if (!at.clear && avoid) {
    // 펜 바 옆 넓은 쪽 폭에 맞춰 줄을 접어 다시
    const side = Math.max(area.right - (avoid.right + AVOID), avoid.left - AVOID - area.left);
    if (side >= MIN_SIDE) {
      m = measure(side);
      at = placeOnScreen(m.r0, m.w, m.h, a, area, avoid, opt);
    }
  }
  const dx = (at.x - m.r0.left) / z;
  const dy = (at.y - m.r0.top) / z;
  if (Math.abs(z - 1) < 0.002 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    bar.style.willChange = "";
    return;
  }
  bar.style.transformOrigin = "0 0";
  bar.style.transform = `translate(${dx}px, ${dy}px) scale(${1 / z})`;
  // 이어 보기의 페이지 띠는 will-change로 처음 배율(1)에 그려 두고 늘리므로, 막대를 따로 그려야 흐리지 않다
  bar.style.willChange = "transform";
}

/**
 * 막대를 화면 기준으로 놓는다: 그릴 때마다, 화면을 옮길 때마다, 막대 크기·창 크기가 바뀔 때마다.
 * 막대의 style에 maxWidth·transform을 주지 말 것 (여기서 정한다).
 * @param anchor 막대가 붙은 것의 자리 (offsetParent 좌표) 또는 요소. 없으면 offsetParent 자체 (글상자 막대 → 그 상자)
 */
export function useScreenFit(ref: RefObject<HTMLElement | null>, anchor?: AnchorLike): void {
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const roRef = useRef<{ ro: ResizeObserver; el: HTMLElement | null } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) fit(el, anchorRef.current);
    // 막대 안의 창을 펴고 접을 때 (그리기와 따로 크기가 바뀌는 경우). 막대가 나타났다 사라질 수 있어 그릴 때마다 본다
    const o = roRef.current;
    if (o && o.el !== el) {
      o.ro.disconnect();
      if (el) o.ro.observe(el);
      o.el = el;
    }
  });
  useEffect(() => {
    let busy = false;
    const run = () => {
      const el = ref.current;
      if (!el || busy) return;
      busy = true;
      fit(el, anchorRef.current);
      busy = false;
    };
    const off = onViewMove(run);
    // 두 번 톡 확대처럼 페이지가 transition으로 움직이면 끝난 뒤 한 번 더
    const offSettled = onViewSettled(run);
    window.addEventListener("resize", run);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => requestAnimationFrame(run));
      if (ref.current) ro.observe(ref.current);
      roRef.current = { ro, el: ref.current };
    }
    return () => {
      off();
      offSettled();
      window.removeEventListener("resize", run);
      roRef.current?.ro.disconnect();
      roRef.current = null;
    };
  }, [ref]);
}
