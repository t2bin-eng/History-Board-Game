import { MousePointer2, PenLine, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { isMadeForEmbedding } from "../doc/embed";
import { stepVisible, visiblePosition } from "../doc/pages";
import { isInteractivePage, pageAspect, type DocState, type Page } from "../doc/types";
import type { EraserMode, EraserTarget } from "../ink/eraser";
import type { PageSize } from "../ink/geometry";
import { InkCanvas } from "../ink/InkCanvas";
import type { PenButtonAction } from "../ink/penButton";
import type { ShapeTool } from "../ink/shapes";
import { shiftedView } from "../ink/shift";
import type { StabilizeLevel } from "../ink/smoothing";
import type { PenNib, Stroke, Tool } from "../ink/types";
import { onPalm, palmActive, penRecentlyActive, pointerKind } from "../lib/inputState";
import { usePenNear } from "../lib/penNear";
import { fingerOperatesWeb } from "../lib/platform";
import { pageFrameUrl, useShortLinks } from "../lib/shortLinks";
import { onFramePinch } from "./frameInput";
import { PageNav } from "./PageNav";
import { PageBackground } from "./PageView";
import {
  clampScroll,
  currentSlot,
  layoutStrip,
  maxScrollY,
  scrollToSlot,
  slotsToRender,
  STRIP_TAIL,
  stripWidth,
  zoomScrollAt,
  type ScrollPos,
  type StripLayout,
} from "./scrollLayout";
import { useLongPressMenu, type LongPress } from "./useLongPressMenu";
import { usePinnedScroll } from "./usePinnedScroll";
import { viewMoved } from "./viewMotion";
import { useWebScroll, type WebScroll } from "./webScroll";
import { WebStage } from "./WebStage";

interface Props {
  doc: DocState;
  currentId: string;
  /** 페이지마다 그릴 획 (지금 페이지는 도형·올가미를 끄는 중이면 그 획을 뺀 것) */
  strokesFor: (pageId: string) => Stroke[];
  tool: Tool;
  color: string;
  width: number;
  eraserSize: number;
  eraserTarget?: EraserTarget;
  eraserMode?: EraserMode;
  straightLine?: boolean;
  fixedWidth?: boolean;
  nib?: PenNib;
  opacity?: number;
  stabilize?: StabilizeLevel;
  penButton?: PenButtonAction;
  buttonHighlighter?: { color: string; width: number; straight?: boolean };
  fingerDraw: boolean;
  lowLatency: boolean;
  straighten?: boolean;
  beautify?: boolean;
  webMode: "interact" | "ink";
  /** 그 페이지의 획을 저장 */
  onCommit: (pageId: string, strokes: Stroke[]) => void;
  onInkShift?: (pageId: string, scroll: WebScroll) => void;
  /** 스크롤하거나 다른 페이지에 펜을 대어 지금 페이지가 바뀜 */
  onCurrentChange: (pageId: string) => void;
  /** 넘기기 바의 이전·다음 (편집 화면이 지금 페이지를 바꾸면 그리로 스크롤) */
  onNavigate: (delta: 1 | -1) => void;
  /** 맨 아래에서 더 밀어 올리거나 "새 페이지"를 누름 */
  onAddPage: () => void;
  onPdfRendered?: (ms: number) => void;
  webReloads?: Record<string, number>;
  inkOff?: boolean;
  /** 페이지 위·필기층 아래 (스티커). current: 지금 페이지인지 */
  pageUnderlay?: (size: PageSize, page: Page, current: boolean) => ReactNode;
  /** 페이지 위·필기층 위 (글상자, 고치는 화면들) */
  pageOverlay?: (size: PageSize, page: Page, current: boolean) => ReactNode;
  onLongPress?: (p: LongPress) => void;
  penLongPress?: boolean;
  onShapeDrawn?: (strokeId: string) => void;
  shapeTool?: ShapeTool | null;
  onLasso?: (poly: [number, number][], tap: boolean) => void;
  navExtra?: ReactNode;
  children?: ReactNode;
}

type Pt = { x: number; y: number };

/** 페이지 둘레 여백 (배율 1 px) */
const PAGE_MARGIN = 16;
const TAP_SLOP = 12;
const DOUBLE_TAP_MS = 320;
/** 맨 아래에서 이만큼(화면 px) 넘게 밀어 올렸다 놓으면 새 페이지 */
export const PULL_ADD_PX = 90;
/** 끝을 넘어 끌 때 따라가는 비율과 최대 (화면 px) */
const RUBBER = 0.45;
const RUBBER_MAX = 150;
/** 손을 떼고 미끄러지는 속도가 줄어드는 시간 상수 (ms) */
const FLING_TAU = 325;
/** 미끄러짐 속도를 재는 시간: 손을 뗀 순간까지 이만큼 (ms) */
const FLING_WINDOW_MS = 100;
/** 마지막으로 움직인 뒤 이만큼 넘게 멈췄다 떼면 미끄러지지 않는다 (ms) — 잡아서 멈춘 화면 */
const FLING_STILL_MS = 60;

// 이어 보기 (v0.44, SPEC 6장 "이어 보기"): 페이지를 세로로 이어 붙인 띠를 손가락으로 스크롤·확대한다.
// 화면 가까이의 페이지마다 필기층(InkCanvas)이 따로 있어 걸쳐 보이는 다음 페이지에도 바로 쓴다.
// 글상자 고치기·도형·올가미 같은 고치는 화면은 지금 페이지에만(pageOverlay의 current).
export function ScrollView(props: Props) {
  const { doc } = props;
  const areaRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [renderZoom, setRenderZoom] = useState(1);
  const [rendered, setRendered] = useState<string[]>([]);
  /** 손가락으로 조작하려고 누른 웹 페이지 (그 페이지만 손가락이 웹앱으로) */
  const [webActive, setWebActive] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setArea({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = stripWidth(area, PAGE_MARGIN);
  const layout = useMemo(() => layoutStrip(doc.pages.map((p) => ({ id: p.id, aspect: pageAspect(p, doc.assets) })), width), [doc.pages, doc.assets, width]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const areaSizeRef = useRef(area);
  areaSizeRef.current = area;
  const propsRef = useRef(props);
  propsRef.current = props;

  // ── 스크롤 자리 (그릴 때마다 React를 거치지 않게 ref + transform) ──
  const view = useRef<ScrollPos>({ z: 1, x: 0, y: 0 });
  /** 지금 페이지로 알렸거나 스크롤해 간 페이지 (편집 화면이 바꾼 것과 구별) */
  const reported = useRef(props.currentId);
  /** 화면 위쪽에 걸친 페이지와 그 안의 자리: 페이지가 늘거나 화면이 돌아도 보던 곳 그대로 */
  const anchor = useRef<{ id: string; offset: number; width: number } | null>(null);
  const checkRaf = useRef(0);
  /** 이번 화면에서 손가락·휠로 스크롤했는지: 그때만 지금 페이지를 따라 바꾼다 (페이지로 가는 중·자리 맞춤은 아님) */
  const scrolled = useRef(false);
  const anim = useRef(0);
  const zoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const check = useCallback(() => {
    checkRaf.current = 0;
    const l = layoutRef.current;
    const a = areaSizeRef.current;
    const v = view.current;
    const track = scrolled.current;
    scrolled.current = false;
    if (!a.width || !l.slots.length) return;
    const ids = slotsToRender(l, v, a);
    setRendered((prev) => (prev.length === ids.length && prev.every((id) => ids.includes(id)) ? prev : ids));
    const cur = currentSlot(l, v, a);
    if (cur) {
      anchor.current = { id: cur.id, offset: v.y - cur.top, width: l.width };
      if (track && cur.id !== reported.current) {
        reported.current = cur.id;
        setWebActive(null);
        propsRef.current.onCurrentChange(cur.id);
      }
    }
  }, []);

  const apply = useCallback(() => {
    const el = stripRef.current;
    if (el) {
      const { z, x, y } = view.current;
      el.style.transform = `translate3d(${-x * z}px, ${-y * z}px, 0) scale(${z})`;
      viewMoved();
    }
    if (!checkRaf.current) checkRaf.current = requestAnimationFrame(check);
  }, [check]);

  const setView = useCallback(
    (v: ScrollPos, scroll = true) => {
      view.current = v;
      if (scroll) scrolled.current = true;
      apply();
    },
    [apply],
  );

  const stopAnim = useCallback(() => {
    cancelAnimationFrame(anim.current);
    anim.current = 0;
  }, []);

  /** 확대가 끝나면 그 배율로 선명하게 다시 그린다 (연달아 바꾸면 잠깐 기다림) */
  const zoomSettled = useCallback(() => {
    clearTimeout(zoomTimer.current);
    const z = view.current.z;
    if (Math.abs(z - 1) < 0.01) setRenderZoom(1);
    else zoomTimer.current = setTimeout(() => setRenderZoom(Math.round(view.current.z * 4) / 4), 250);
  }, []);

  const animateTo = useCallback(
    /** scroll: 가는 동안 지나는 페이지를 지금 페이지로 따라 바꿀지 (넘기기 바·페이지 바로 갈 때는 아님) */
    (target: ScrollPos, ms = 260, scroll = true) => {
      stopAnim();
      const from = { ...view.current };
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const k = 1 - Math.pow(1 - t, 3);
        setView({ z: from.z + (target.z - from.z) * k, x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k }, scroll);
        if (t < 1) anim.current = requestAnimationFrame(step);
        else {
          anim.current = 0;
          if (target.z !== from.z) zoomSettled();
        }
      };
      anim.current = requestAnimationFrame(step);
    },
    [setView, stopAnim, zoomSettled],
  );

  // 처음 열 때·편집 화면이 지금 페이지를 바꿀 때(넘기기 바·페이지 바·링크) 그 페이지로, 띠가 바뀌면 보던 곳 그대로
  const inited = useRef(false);
  const prevLayout = useRef(layout);
  const prevArea = useRef(area);
  useLayoutEffect(() => {
    const changed = prevLayout.current !== layout || prevArea.current !== area;
    prevLayout.current = layout;
    prevArea.current = area;
    if (!area.width || !layout.slots.length) return;
    if (!inited.current) {
      inited.current = true;
      reported.current = props.currentId;
      setView(scrollToSlot(layout, view.current, area, props.currentId), false);
      return;
    }
    if (props.currentId !== reported.current) {
      reported.current = props.currentId;
      setWebActive(null);
      animateTo(scrollToSlot(layout, view.current, area, props.currentId), 260, false);
      return;
    }
    // 같은 페이지인데 띠·화면 크기가 바뀜 (페이지 더하기·지우기, 화면 돌림): 보던 곳 그대로
    if (!changed) return;
    const a = anchor.current;
    const s = a && layout.slots.find((x) => x.id === a.id);
    if (a && s) {
      const k = a.width ? layout.width / a.width : 1;
      setView(clampScroll({ ...view.current, y: s.top + a.offset * k }, layout, area), false);
    } else setView(clampScroll(view.current, layout, area), false);
  }, [props.currentId, layout, area, setView, animateTo]);

  // 글상자 입력 때 브라우저가 페이지 영역을 스크롤하면 (v0.48): 영역은 그대로 두고 띠를 그만큼 옮긴다 (펜 바·넘기기 바가 밀려 묻히지 않게)
  usePinnedScroll(areaRef, (dx, dy) => {
    stopAnim();
    const v = view.current;
    setView(clampScroll({ ...v, x: v.x + dx / v.z, y: v.y + dy / v.z }, layoutRef.current, areaSizeRef.current), false);
  });

  // AI로 보내기가 웹 페이지를 찍기 전: 지금 페이지가 다 보이게 원래 크기로
  useEffect(() => {
    const fit = () => {
      stopAnim();
      setView(scrollToSlot(layoutRef.current, { ...view.current, z: 1 }, areaSizeRef.current, reported.current), false);
      setRenderZoom(1);
    };
    window.addEventListener("lessondeck:fit-current", fit);
    return () => window.removeEventListener("lessondeck:fit-current", fit);
  }, [setView, stopAnim]);

  /** 펜·손가락 필기·톡으로 다른 페이지에 대면 그 페이지가 지금 페이지 */
  const pageOf = (el: Element | null): string | null => el?.closest?.<HTMLElement>(".page[data-page-id]")?.dataset.pageId ?? null;
  const takeCurrent = useCallback((id: string | null, sync = false) => {
    if (!id || id === reported.current) return;
    reported.current = id;
    setWebActive(null);
    if (sync) flushSync(() => propsRef.current.onCurrentChange(id));
    else propsRef.current.onCurrentChange(id);
  }, []);

  // ── 손가락: 한 손가락 스크롤(놓으면 미끄러짐) · 두 손가락 확대 · 두 번 톡 확대 · 맨 아래에서 밀어 올려 새 페이지 ──
  useEffect(() => {
    const el = areaRef.current!;
    const pointers = new Map<number, Pt>();
    let mode: "idle" | "draw" | "pan" | "pinch" = "idle";
    let rect = el.getBoundingClientRect();
    let start = { p: { x: 0, y: 0 }, t: 0, view: view.current, target: null as Element | null };
    let pinch = { d: 1, m: { x: 0, y: 0 }, view: view.current };
    let lastTap: { p: Pt; t: number } | null = null;
    let samples: { t: number; x: number; y: number }[] = [];
    /** 손을 뗀 뒤 미끄러지는 중 */
    let flinging = false;
    let moved = false;
    let pull = 0;
    let zoomAtStart = 1;

    const local = (e: PointerEvent): Pt => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const two = () => [...pointers.values()].slice(0, 2);
    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const showPull = (px: number) => {
      pull = px;
      const t = tailRef.current;
      if (!t) return;
      t.classList.toggle("pulling", px > 8);
      t.classList.toggle("ready", px >= PULL_ADD_PX);
    };

    /** 끝을 넘으면 덜 따라가게 (위·아래) */
    const rubberY = (y: number, l: StripLayout, z: number) => {
      const maxY = maxScrollY(l, areaSizeRef.current, z);
      if (y > maxY) {
        const over = Math.min(RUBBER_MAX, (y - maxY) * z * RUBBER);
        showPull(over);
        return maxY + over / z;
      }
      showPull(0);
      if (y < 0) return -Math.min(RUBBER_MAX, -y * z * RUBBER) / z;
      return y;
    };

    const settle = () => {
      const l = layoutRef.current;
      const c = clampScroll(view.current, l, areaSizeRef.current);
      if (c.y !== view.current.y || c.x !== view.current.x || c.z !== view.current.z) animateTo(c, 220);
      if (view.current.z !== zoomAtStart) zoomSettled();
    };

    const fling = (vx: number, vy: number) => {
      // vx, vy: 화면 px/ms (띠가 움직이는 방향)
      stopAnim();
      flinging = true;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        const decay = Math.exp(-dt / FLING_TAU);
        const v = view.current;
        const l = layoutRef.current;
        const want = v.y - (vy * dt) / v.z;
        const next = clampScroll({ z: v.z, x: v.x - (vx * dt) / v.z, y: want }, l, areaSizeRef.current);
        setView(next);
        vx *= decay;
        vy = next.y !== want ? 0 : vy * decay;
        if (Math.hypot(vx, vy) > 0.02 && flinging) anim.current = requestAnimationFrame(step);
        else {
          anim.current = 0;
          flinging = false;
        }
      };
      anim.current = requestAnimationFrame(step);
    };

    const endGesture = () => {
      mode = "idle";
      showPull(0);
      settle();
    };

    const onDown = (e: PointerEvent) => {
      const kind = pointerKind(e);
      if (kind === "pen" || kind === "mouse") {
        stopAnim();
        flinging = false;
        if (pointers.size) {
          pointers.clear();
          endGesture();
        }
        // 펜을 댄 페이지가 지금 페이지 (그 페이지 필기층이 이미 받고 있다)
        if (kind === "pen" || e.button === 0) takeCurrent(pageOf(e.target as Element));
        return;
      }
      if (kind !== "touch") return;
      if (e.isPrimary && pointers.size) {
        pointers.clear();
        endGesture();
      }
      if (pointers.size === 0 && (e.target as Element).closest?.("[data-no-gesture]")) {
        // 미끄러지던 화면은 글상자·스티커·넘기기 바 위를 눌러도 멈춘다 (v0.50.1)
        if (flinging) {
          stopAnim();
          flinging = false;
          settle();
        }
        return;
      }
      if (penRecentlyActive() || palmActive()) return;
      if (pointers.size === 0) {
        rect = el.getBoundingClientRect();
        zoomAtStart = view.current.z;
        stopAnim();
        flinging = false;
      }
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        const onInk = (e.target as Element).classList?.contains("ink-live");
        start = { p, t: performance.now(), view: { ...view.current }, target: e.target as Element };
        samples = [{ t: start.t, x: p.x, y: p.y }];
        moved = false;
        if (propsRef.current.fingerDraw && onInk) {
          mode = "draw";
          takeCurrent(pageOf(e.target as Element));
        } else mode = "pan";
      } else if (pointers.size === 2) {
        const [a, b] = two();
        pinch = { d: dist(a, b), m: mid(a, b), view: { ...view.current } };
        mode = "pinch";
        showPull(0);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      const l = layoutRef.current;
      if (mode === "pan") {
        const dx = p.x - start.p.x;
        const dy = p.y - start.p.y;
        if (!moved && Math.hypot(dx, dy) < TAP_SLOP) return;
        moved = true;
        const z = start.view.z;
        const c = clampScroll({ z, x: start.view.x - dx / z, y: 0 }, l, areaSizeRef.current);
        setView({ z, x: c.x, y: rubberY(start.view.y - dy / z, l, z) });
        const now = performance.now();
        samples.push({ t: now, x: p.x, y: p.y });
        while (samples.length > 2 && now - samples[0].t > 100) samples.shift();
      } else if (mode === "pinch" && pointers.size >= 2) {
        const [a, b] = two();
        setView(zoomScrollAt(pinch.view, pinch.m, mid(a, b), pinch.view.z * (dist(a, b) / pinch.d), l, areaSizeRef.current));
      }
    };

    const onTap = (p: Pt) => {
      if (start.target?.closest(".strip-tail")) return;
      const now = performance.now();
      // 톡 누른 페이지가 지금 페이지 · 웹 페이지면 손가락으로 조작
      const id = pageOf(start.target);
      takeCurrent(id);
      if (id && start.target?.closest(".web-shield")) setWebActive(id);
      if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < 40) {
        lastTap = null;
        const v = view.current;
        const z = v.z > 1.01 ? 1 : 2;
        animateTo(clampScroll(zoomScrollAt(v, p, p, z, layoutRef.current, areaSizeRef.current), layoutRef.current, areaSizeRef.current));
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
          const [rest] = pointers.values();
          start = { p: rest, t: performance.now(), view: { ...view.current }, target: null };
          samples = [{ t: start.t, x: rest.x, y: rest.y }];
          moved = true;
          mode = "pan";
        } else if (pointers.size === 0) endGesture();
        return;
      }
      if (pointers.size > 0) return;
      if (mode === "pan" && !cancelled) {
        if (!moved && performance.now() - start.t < 300) {
          onTap(p);
          endGesture();
          return;
        }
        if (pull >= PULL_ADD_PX) {
          showPull(0);
          mode = "idle";
          propsRef.current.onAddPage();
          settle();
          return;
        }
        // 미끄러짐 (v0.50.1): 손을 뗀 순간까지 마지막 FLING_WINDOW_MS 동안의 움직임으로만. 0.50까지는 마지막으로 움직인 때를 기준으로 재서,
        // 미끄러지던 화면을 손가락으로 잡을 때 조금 끌린 움직임이 남아 있다가 한참 멈춘 뒤 떼어도 그 속도로 다시 미끄러졌다
        const now = performance.now();
        const lastMove = samples[samples.length - 1];
        const recent = [...samples.filter((q) => now - q.t <= FLING_WINDOW_MS), { t: now, x: p.x, y: p.y }];
        const first = recent[0];
        const dt = now - first.t;
        const still = now - lastMove.t > FLING_STILL_MS;
        const out = view.current.y < 0 || view.current.y > maxScrollY(layoutRef.current, areaSizeRef.current, view.current.z);
        if (dt > 10 && !out && !still) {
          const vx = (p.x - first.x) / dt;
          const vy = (p.y - first.y) / dt;
          if (Math.hypot(vx, vy) > 0.25) {
            mode = "idle";
            showPull(0);
            fling(vx, vy);
            return;
          }
        }
      }
      endGesture();
    };

    // 마우스 휠: 스크롤, Ctrl + 휠은 확대
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest?.("[data-no-gesture]")) return;
      e.preventDefault();
      stopAnim();
      const l = layoutRef.current;
      const v = view.current;
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? areaSizeRef.current.height : 1;
      if (e.ctrlKey) {
        rect = el.getBoundingClientRect();
        const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setView(clampScroll(zoomScrollAt(v, at, at, v.z * Math.exp(-e.deltaY * unit * 0.002), l, areaSizeRef.current), l, areaSizeRef.current));
        zoomSettled();
      } else {
        setView(clampScroll({ z: v.z, x: v.x + (e.deltaX * unit) / v.z, y: v.y + (e.deltaY * unit) / v.z }, l, areaSizeRef.current));
      }
    };

    const offPalm = onPalm(() => {
      if (!pointers.size) return;
      pointers.clear();
      endGesture();
    });
    const up = (e: PointerEvent) => onUp(e, false);
    const cancel = (e: PointerEvent) => onUp(e, true);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      offPalm();
      stopAnim();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("wheel", onWheel);
    };
  }, [setView, animateTo, stopAnim, zoomSettled, takeCurrent]);

  // 조작 중인 HTML 웹앱 안의 두 손가락 (안내 스크립트가 알려 줌): 확대·이동
  useEffect(() => {
    let s: { m: Pt; d: number; view: ScrollPos } | null = null;
    return onFramePinch((p) => {
      const el = areaRef.current;
      if (!el || p.pageId !== reported.current) return;
      if (p.phase === "end" || !p.a || !p.b) {
        if (s) zoomSettled();
        s = null;
        return;
      }
      const r = el.getBoundingClientRect();
      const a = { x: p.a.x - r.left, y: p.a.y - r.top };
      const b = { x: p.b.x - r.left, y: p.b.y - r.top };
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (p.phase === "start" || !s) {
        s = { m, d, view: { ...view.current } };
        return;
      }
      setView(clampScroll(zoomScrollAt(s.view, s.m, m, s.view.z * (d / s.d), layoutRef.current, areaSizeRef.current), layoutRef.current, areaSizeRef.current));
    });
  }, [setView, zoomSettled]);

  // ── 길게 누르기: 누른 페이지를 지금 페이지로 한 뒤 메뉴 (메뉴가 지금 페이지 자리로 계산하므로 먼저 바꿔 그린다) ──
  const ring = useLongPressMenu(areaRef, {
    onLongPress: props.onLongPress
      ? (p) => {
          takeCurrent(pageOf(p.target), true);
          propsRef.current.onLongPress?.(p);
        }
      : undefined,
    penLongPress: props.penLongPress,
    fingerWriting: props.fingerDraw,
  });

  // 웹 주소 페이지 주소들 (안드로이드 앱이 띄우기 거부 머리글을 처리, PageView와 같음)
  const shortLinks = useShortLinks(useMemo(() => doc.pages.flatMap((p) => (p.kind === "url" ? [p.url] : [])), [doc.pages]));
  const frameUrls = useMemo(
    () => doc.pages.flatMap((p) => (p.kind === "url" ? [pageFrameUrl(p.url)] : [])).filter((u) => !isMadeForEmbedding(u)),
    // shortLinks: 짧은 링크의 실제 주소를 알게 되면 다시 계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.pages, shortLinks],
  );

  const pages = useMemo(() => new Map(doc.pages.map((p) => [p.id, p])), [doc.pages]);
  const hiddenSet = useMemo(() => new Set(doc.hidden), [doc.hidden]);
  const pos = visiblePosition(doc.pages, doc.hidden, props.currentId);
  const hasPrev = stepVisible(doc.pages, doc.hidden, props.currentId, -1) !== null;
  const hasNext = stepVisible(doc.pages, doc.hidden, props.currentId, 1) !== null;
  const draw = new Set(rendered);
  draw.add(props.currentId);

  return (
    <main className="page-area scroll-view" ref={areaRef}>
      {width > 0 && (
        <div ref={stripRef} className="page-strip" style={{ width: layout.width, height: layout.total }}>
          {layout.slots.map((s) => {
            const page = pages.get(s.id);
            if (!page) return null;
            const size = { width: layout.width, height: s.height };
            if (!draw.has(s.id)) return <div key={s.id} className="page-ph" style={{ top: s.top, width: size.width, height: size.height }} aria-hidden="true" />;
            return (
              <ScrollSlot
                {...props}
                key={s.id}
                page={page}
                top={s.top}
                size={size}
                current={s.id === props.currentId}
                hidden={hiddenSet.has(s.id)}
                webActive={webActive === s.id}
                renderZoom={renderZoom}
                strokes={props.strokesFor(s.id)}
                frameUrls={frameUrls}
              />
            );
          })}
          <div ref={tailRef} className="strip-tail" style={{ top: layout.total - STRIP_TAIL + 16, width: layout.width }}>
            <button className="strip-add" onClick={props.onAddPage}>
              <Plus size={18} /> 새 페이지
            </button>
            <span className="strip-pull-hint">더 밀어 올리면 새 페이지</span>
          </div>
        </div>
      )}
      {(doc.pages.length > 1 || props.navExtra) && (
        <PageNav
          label={pos.index < 0 ? "숨긴 페이지" : `${pos.index + 1} / ${pos.count}`}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onNavigate={props.onNavigate}
          extra={props.navExtra}
        />
      )}
      {ring && <span className="press-ring" style={{ left: ring.x, top: ring.y, animationDuration: `${ring.ms}ms` }} aria-hidden="true" />}
      {props.children}
    </main>
  );
}

interface SlotProps extends Props {
  page: Page;
  top: number;
  size: PageSize;
  current: boolean;
  hidden: boolean;
  webActive: boolean;
  renderZoom: number;
  strokes: Stroke[];
  frameUrls: string[];
}

/** 띠 위의 페이지 하나: 바탕(PDF·그림·웹앱) + 스티커 + 필기층 + 글상자 */
function ScrollSlot(p: SlotProps) {
  const { page, size, doc } = p;
  const web = isInteractivePage(page);
  // HTML 페이지 필기는 웹앱 문서에 붙는다 (v0.36): 이 페이지 웹앱이 스크롤된 만큼 옮겨 그린다
  const scroll = useWebScroll(page.kind === "html" ? page.id : null);
  const view = useMemo(() => shiftedView(p.strokes, scroll.x, scroll.y), [p.strokes, scroll.x, scroll.y]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const commitRef = useRef(p.onCommit);
  commitRef.current = p.onCommit;
  const pageId = page.id;
  const onCommit = useCallback((next: Stroke[]) => commitRef.current(pageId, viewRef.current.back(next)), [pageId]);
  const shiftRef = useRef(p.onInkShift);
  shiftRef.current = p.onInkShift;
  useEffect(() => {
    shiftRef.current?.(pageId, scroll);
  }, [pageId, scroll]);

  const inkActive = !p.inkOff && (!web || p.webMode === "ink");
  // 펜은 판서, 손가락은 조작 (v0.35): 손가락이 필기층을 지나 웹앱(톡 누르기 전에는 덮개 → 스크롤)으로
  const fingerToWeb = web && inkActive && p.webMode === "ink" && !p.fingerDraw && fingerOperatesWeb;
  const penIsNear = usePenNear(fingerToWeb);
  const passFingers = fingerToWeb && !penIsNear;

  return (
    <div
      className={`page${p.current ? " current" : ""}${web ? ` web ${p.webMode}` : ""}${p.hidden ? " hidden-page" : ""}`}
      data-page-id={page.id}
      style={{ top: p.top, width: size.width, height: size.height }}
    >
      {!web && <PageBackground page={page} doc={doc} size={size} zoom={p.renderZoom} prefetch={undefined} onRendered={p.current ? p.onPdfRendered : undefined} />}
      {web && <WebStage pages={[page]} currentId={page.id} assets={doc.assets} size={size} reloads={p.webReloads} frameUrls={p.frameUrls} docId={doc.id} />}
      {/* 손가락은 스크롤: 웹 페이지는 톡 눌러야 손가락이 웹앱으로 간다 */}
      {web && !p.webActive && <div className="web-shield" />}
      {p.pageUnderlay?.(size, page, p.current)}
      <InkCanvas
        key="ink"
        page={size}
        zoom={p.renderZoom}
        strokes={view.strokes}
        tool={p.tool}
        color={p.color}
        width={p.width}
        eraserSize={p.eraserSize}
        eraserTarget={p.eraserTarget}
        eraserMode={p.eraserMode}
        straightLine={p.straightLine}
        fixedWidth={p.fixedWidth}
        nib={p.nib}
        opacity={p.opacity}
        stabilize={p.stabilize}
        penButton={p.penButton}
        buttonHighlighter={p.buttonHighlighter}
        fingerDraw={p.fingerDraw}
        lowLatency={p.lowLatency}
        straighten={p.straighten}
        beautify={p.beautify}
        active={inkActive}
        passFingers={passFingers}
        onCommit={onCommit}
        onShapeDrawn={p.onShapeDrawn}
        shapeTool={p.shapeTool}
        onLasso={p.onLasso}
      />
      {p.pageOverlay?.(size, page, p.current)}
      {web && (
        <div className="web-mode-chip" aria-hidden="true">
          {p.webMode === "ink" ? <PenLine size={13} /> : <MousePointer2 size={13} />}
          {!p.webActive ? "눌러서 웹 조작" : p.webMode !== "ink" ? "조작 모드" : fingerToWeb ? "펜 판서 · 손 조작" : "판서 모드"}
        </div>
      )}
      {p.hidden && <span className="hidden-badge">숨긴 페이지</span>}
    </div>
  );
}
