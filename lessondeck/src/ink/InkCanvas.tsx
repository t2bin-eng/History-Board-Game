import { cssToken } from "../lib/theme";
import { onViewSettled } from "../view/viewMotion";
import { contains, SHARP_MIN_GAIN, sharpWindow, type SharpWindow } from "../view/sharpWindow";
import { useEffect, useLayoutEffect, useRef } from "react";
import { debugStats, pushLog, recordPointer, recordRender } from "../lib/debugStore";
import { activeTouchCount, isSideButtonDown, onPalm, onSideButtonChange, palmActive, penRecentlyActive, penStrokeErasing, penTouching, pointerKind, type PointerKind } from "../lib/inputState";
import { beautifyStroke, pathLengthPx, snapLineEnd } from "./beautify";
import { strokeHitsCircle, unitsToPx, type PageSize } from "./geometry";
import { fillStroke, HIGHLIGHT_LAYER_STYLE, isHighlighter } from "./inkPaint";
import { defaultShape, dragShape, lineSpec, makeShapeStroke, nearlyStraight, type ShapeTool } from "./shapes";
import { guessHoldShape } from "./holdShape";
import { eraserTakes, eraseStrokeArea, type EraserMode, type EraserTarget } from "./eraser";
import { capPrediction, keepPoint, SMOOTH_V2, stabilizeOf, trimHooks, trimSlips, type Dropped, type StabilizeLevel } from "./smoothing";
import { bounceRelation, endVelocity, penStyleKey, type PenLift } from "./bounce";
import type { PenButtonAction } from "./penButton";
import { LASSO_TAP_PX } from "./selection";
import type { InkPoint, PenNib, Stroke, Tool } from "./types";

interface Props {
  page: PageSize;
  /** 손가락으로 확대한 배율. 확대가 끝나면 이 배율에 맞춰 캔버스를 선명하게 다시 그린다. */
  zoom: number;
  strokes: Stroke[];
  tool: Tool;
  color: string;
  width: number;
  eraserSize: number;
  /** 지우개가 지울 것 (v0.32): 전부 · 펜 필기만 · 형광펜만 */
  eraserTarget?: EraserTarget;
  /** 지우는 방법 (v0.40): 획 통째로(기본) · 문지른 부분만 */
  eraserMode?: EraserMode;
  /** 지금 펜 바 펜의 설정 (v0.33): 형광펜 곧게 긋기 · 펜 고른 굵기 */
  straightLine?: boolean;
  fixedWidth?: boolean;
  /** 지금 펜의 펜 종류·불투명도 (v0.41, 펜만) */
  nib?: PenNib;
  opacity?: number;
  /** 손떨림 보정 세기 (v0.42, 기기 설정, 없으면 보통) */
  stabilize?: StabilizeLevel;
  /** S펜 버튼을 누른 채 쓸 때 할 일 (v0.33, 없으면 지우개) */
  penButton?: PenButtonAction;
  /** penButton이 highlighter일 때 쓸 형광펜 (펜 바에서 마지막으로 고른 것) */
  buttonHighlighter?: { color: string; width: number; straight?: boolean };
  /** 꺼져 있으면 손가락 터치는 필기하지 않는다 (손바닥 오인식 방지) */
  fingerDraw: boolean;
  /** 진행 중인 획 캔버스에 desynchronized(저지연) 컨텍스트를 쓴다. 바꾸려면 컴포넌트를 다시 만들어야 한다. */
  lowLatency: boolean;
  /** false면 필기층을 통과시킨다 (HTML 페이지 조작 모드: 필기는 보이지만 터치·펜은 웹앱으로) */
  active: boolean;
  /** 판서는 그대로 두고 필기층만 잠깐 비킨다 (v0.35 웹 페이지 판서 모드에서 S펜이 멀 때: 손가락이 웹앱으로 바로 간다) */
  passFingers?: boolean;
  /** 도형 보정: 긋다가 떼지 않고 멈추면 도형(원·사각형 등)이나 직선, 직선은 떼기 전까지 끝점 조절 */
  straighten?: boolean;
  /** 필기 보정: 펜 획을 뗄 때 반듯하게 다듬는다 */
  beautify?: boolean;
  onCommit: (strokes: Stroke[]) => void;
  /** 멈춰서 도형·직선이 된 획을 저장한 뒤 (그 도형을 골라 크기·회전을 고칠 수 있게) */
  onShapeDrawn?: (strokeId: string) => void;
  /** 도형 모드: 고른 도형을 펜으로 끌어 그리기 / auto면 그린 획을 뗄 때 알아본 도형으로 */
  shapeTool?: ShapeTool | null;
  /** 올가미 (v0.43): 둘러싼 자리(페이지 px). tap이면 거의 움직이지 않고 톡 누른 것 */
  onLasso?: (poly: [number, number][], tap: boolean) => void;
}

interface Gesture {
  pointerId: number;
  /** 펜·마우스·손 (inputState.pointerKind) */
  pointerType: PointerKind;
  /** laser (v0.33): 레이저 펜 — 그리기만 하고 저장하지 않는다. lasso (v0.43): 올가미 — 둘러싼 자리를 알린다 */
  mode: "draw" | "erase" | "laser" | "lasso";
  /** 올가미 자리 (페이지 px, mode lasso) */
  lasso: [number, number][] | null;
  /** 레이저 펜 자국 (mode laser) */
  laser: Laser | null;
  /** 곧게 긋는 형광펜 (v0.33): 댄 곳부터 늘 직선, 뗀 뒤 고르지 않음 */
  autoStraight: boolean;
  rect: DOMRect;
  stroke: Stroke | null;
  working: Stroke[];
  erased: boolean;
  /** pointerdown으로 시작했는지 (버튼 → 접촉 순서는 pointermove로 시작한다) */
  viaDown: boolean;
  /** 지우개가 마지막으로 지나간 자리 (페이지 px). 빠르게 쓸어도 사이를 빠뜨리지 않게 이어서 지운다 */
  lastErase: { x: number; y: number } | null;
  /** 도형 보정: 멈춘 자리(화면 px)와 타이머 */
  holdAt: { x: number; y: number };
  holdTimer: number;
  /** 직선이 된 뒤의 시작점 (페이지 px). 떼기 전까지 끝점이 펜을 따라온다 */
  straight: { start: [number, number] } | null;
  /** 직선이 된 자리(화면 px): 펜이 여기서 lockR 안에 있는 동안은 끝점을 붙잡아 둔다 (뗄 때 미끄러져도 그대로, v0.32) */
  lineLock: { x: number; y: number } | null;
  /** 붙잡아 두는 거리 (화면 px): 보통 HOLD_KEEP, 작은 직선은 SMALL_KEEP (v0.54) */
  lockR: number;
  /** 작은 획이 멈춰서 직선이 됨 (v0.54): 뗀 뒤 고치기 막대를 띄우지 않는다 (글씨 쓰는 중에 막대가 뜨지 않게) */
  smallLine: boolean;
  /** 지금까지 그은 자리 (화면 px) — 작은 획인지 (v0.54) */
  ext: { x0: number; y0: number; x1: number; y1: number };
  /** 떨림으로 거른 마지막 점 (v0.32): 화면에는 끝으로 그리고, 뗄 때 남긴다 */
  pending: InkPoint | null;
  /** 떨림으로 보는 거리 (화면 px, v0.42 손떨림 보정 세기) */
  jitterTol: number;
  /** 마지막으로 남긴 점 뒤로 거른 점 중 가장 멀리 간 것 (화면 px, smoothing.keepPoint) */
  dropped: Dropped | null;
  /** 닫힌 도형·화살표가 된 뒤 (그대로 둔다) */
  shaped: boolean;
  /** 도형 모드로 끌어 그리는 중: 고른 도형과 펜을 댄 곳 (페이지 px) */
  drag: { kind: Exclude<ShapeTool, "auto">; start: [number, number]; moved: boolean } | null;
  /** 최근 펜 자리 (화면 px, ms) — 뗄 때 속도 (v0.53 펜이 잠깐 튄 획 잇기) */
  samples: { x: number; y: number; t: number }[];
  /** 바로 앞 펜 획과의 관계 (펜을 댈 때 정함, v0.53) */
  bounce: { kind: "join" | "dropDot"; prev: PenLift } | null;
}

/** 레이저 펜 자국: 페이지 px 점들, 뗀 시각 (그리는 중이면 0) */
interface Laser {
  pts: [number, number][];
  end: number;
}

/** 이보다 작은 펜 획(가로·세로 중 긴 쪽, 화면 px)은 필기 보정으로 펴지 않는다 — 작은 글씨 (v0.37, 약 4~5mm) */
const SMALL_WRITING_PX = 24;
/** 이보다 작은 획은 멈춰도 도형·곡선으로 바꾸지 않는다 (화면 px, v0.37, 약 5mm). v0.54부터 직선은 아래까지 */
const SHAPE_MIN_PX = 28;
/** 작은 획도 거의 곧으면 이만큼(화면 px, 가로·세로 중 긴 쪽, 약 2mm)부터 멈추면 직선 (v0.54) */
const LINE_MIN_PX = 10;
/** 작은 획의 "거의 곧음": 시작 → 끝 줄에서 가장 먼 점이 이만큼(화면 px) 또는 줄 길이의 12% 안 */
const SMALL_LINE_DEV_PX = 1.5;
const SMALL_LINE_DEV = 0.12;
/** 작은 획은 이만큼(화면 px) 안에 머물러야 멈춘 것 (보통 HOLD_SLOP 8px — 작은 획을 천천히 그으면 다 긋기 전에 멈춘 것으로 보였다) */
const HOLD_SLOP_SMALL = 3;
/** 작은 직선이 된 뒤 끝을 붙잡아 두는 거리 (화면 px, 보통 HOLD_KEEP) */
const SMALL_KEEP = 5;
/** 펜 끝 예측을 그리는 최대 길이 (화면 px, v0.36) */
const PREDICT_MAX_SCREEN_PX = 12;
/** 형광펜 끝 예측 (v0.50.1): 굵고 반투명해 멀리 튀면 끝이 늘었다 줄어 보이므로 펜보다 짧게 */
const PREDICT_MAX_HL_SCREEN_PX = 8;
/** 레이저 펜: 뗀 뒤 이만큼 그대로 있다가 이만큼 동안 사라진다 */
const LASER_HOLD_MS = 700;
const LASER_FADE_MS = 500;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 필기 캔버스 한 장의 픽셀 수 상한 (확대 시 메모리 보호) */
const MAX_INK_PIXELS = 8_000_000;
/** 도형 보정: 이만큼 멈추면 도형·직선 (떨림은 HOLD_SLOP px까지 멈춘 것으로, v0.32에서 4 → 8: 삼성노트와 같은 8dp) */
const HOLD_MS = 500;
const HOLD_SLOP = 8;
/** 직선이 된 뒤 이만큼(px) 안의 떨림은 끝점을 움직이지 않는다 (멈춤 판정 뒤에는 두 배까지 봐줌) */
const HOLD_KEEP = 16;

// 두 겹 캔버스: 아래는 확정된 획, 위는 지금 그리는 획.
// 획이 진행되는 동안에는 위 캔버스만 다시 그리고, 펜을 떼면 아래 캔버스에 합성한다 (SPEC R1).
// 형광펜(v0.23)은 그 아래 따로 두 겹(확정·진행 중)에 그리고, 그 묶음을 페이지와 곱하기로 섞는다 (inkPaint.ts).
export function InkCanvas(props: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  /** 레이저 펜 층 (v0.33): 맨 위, 누름은 받지 않음 */
  const laserRef = useRef<HTMLCanvasElement>(null);
  const clearLaserDotRef = useRef<() => void>(() => {});
  const hlGroupRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLCanvasElement>(null);
  const hlLiveRef = useRef<HTMLCanvasElement>(null);
  /** 확대했을 때 보이는 자리만 실제 배율로 그리는 선명한 층들 (v0.50) */
  const sharpBaseRef = useRef<HTMLCanvasElement>(null);
  const sharpHlRef = useRef<HTMLCanvasElement>(null);
  const sharpLiveRef = useRef<HTMLCanvasElement>(null);
  const sharpHlLiveRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** 선명한 창 (페이지 px 자리와 배율), 확대하지 않았으면 null */
  const winRef = useRef<SharpWindow | null>(null);
  /** 지금 획을 긋는 중인지 (긋는 동안에는 창을 옮기지 않는다) */
  const busyRef = useRef<() => boolean>(() => false);
  /** 선명한 창을 다시 잡기 (화면 이동이 멈췄을 때·확대 배율이 바뀌었을 때). force면 지금 창 안이어도 다시 */
  const updateWindowRef = useRef<(force: boolean) => void>(() => {});
  const propsRef = useRef(props);
  propsRef.current = props;
  const renderedRef = useRef<Stroke[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, zoom: 0, scale: 1 });

  /** 그리는 층들 (마운트된 뒤에만 부른다) */
  const layers = (): Layers => ({
    base: baseRef.current!,
    hl: hlRef.current!,
    hlLive: hlLiveRef.current!,
    group: hlGroupRef.current!,
    sharp: { base: sharpBaseRef.current!, hl: sharpHlRef.current!, live: sharpLiveRef.current!, hlLive: sharpHlLiveRef.current! },
    win: winRef,
  });

  useLayoutEffect(() => {
    const ls = layers();
    const live = liveRef.current!;
    const { page, strokes, zoom } = props;
    const size = sizeRef.current;
    const resized = size.width !== page.width || size.height !== page.height || size.zoom !== zoom;
    if (resized) {
      let scale = Math.min(window.devicePixelRatio || 1, 2.5) * zoom;
      const pixels = page.width * page.height * scale * scale;
      if (pixels > MAX_INK_PIXELS) scale *= Math.sqrt(MAX_INK_PIXELS / pixels);
      const w = Math.max(1, Math.round(page.width * scale));
      const h = Math.max(1, Math.round(page.height * scale));
      for (const c of [ls.base, live, ls.hl, ls.hlLive, laserRef.current!]) {
        c.width = w;
        c.height = h;
        c.style.width = `${page.width}px`;
        c.style.height = `${page.height}px`;
        painted.delete(c);
        geos.set(c, { ox: 0, oy: 0, s: w / Math.max(1, page.width) });
      }
      sizeRef.current = { width: page.width, height: page.height, zoom, scale: w / Math.max(1, page.width) };
    }
    if (resized || !sameStrokes(strokes, renderedRef.current)) {
      renderedRef.current = strokes;
      redraw(ls, strokes, page);
    }
    // 확대 배율·페이지 크기가 바뀌면 선명한 창도 다시 (v0.50)
    if (resized) updateWindowRef.current(true);
    showHighlights(ls);
  }, [props.page, props.strokes, props.zoom]);

  // 선명한 창 (v0.50, SPEC 6장 "확대한 필기"): 페이지 전체 캔버스는 픽셀 수 상한(MAX_INK_PIXELS) 때문에 크게 확대하면 흐려진다.
  // 확대 배율이 그 상한을 넘으면, 보이는 자리(+ 여유)만 실제 배율로 그리는 캔버스를 위에 두고 아래 전체 캔버스는 그 자리를 가린다.
  useEffect(() => {
    const update = (force: boolean) => {
      const root = rootRef.current;
      if (!root) return;
      const ls = layers();
      const { page, zoom } = propsRef.current;
      const want = Math.min(window.devicePixelRatio || 1, 2.5) * (zoom || 1);
      const far = sizeRef.current.scale;
      const next = want > far * SHARP_MIN_GAIN ? sharpWindow(root, page, want, MAX_SHARP_PIXELS) : null;
      const cur = winRef.current;
      if (!next) {
        if (cur) {
          winRef.current = null;
          applyWindow(ls, null, page);
          redrawSharp(ls, renderedRef.current, page);
        }
        return;
      }
      // 긋는 중에는 옮기지 않는다. 보이는 자리가 아직 지금 창 안이고 배율이 같으면 그대로
      if (busyRef.current()) return;
      if (!force && cur && Math.abs(cur.s - next.s) < 1e-6 && contains(cur, next.visible)) return;
      winRef.current = next;
      applyWindow(ls, next, page);
      redrawSharp(ls, renderedRef.current, page);
      showHighlights(ls);
    };
    updateWindowRef.current = update;
    update(true);
    return onViewSettled(() => update(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 레이저 펜이 아닌 도구로 바꾸면 띄워 둔 레이저 점을 지운다 (v0.33)
  useEffect(() => {
    if (props.tool !== "laser") clearLaserDotRef.current();
  }, [props.tool]);

  // 조작 모드로 바뀌면 남아 있던 지우개 표시 등을 지운다
  useEffect(() => {
    if (props.active) return;
    const live = liveRef.current!;
    live.getContext("2d")!.clearRect(0, 0, live.width, live.height);
    const ls = layers();
    ls.sharp.live.getContext("2d")!.clearRect(0, 0, ls.sharp.live.width, ls.sharp.live.height);
    for (const c of [ls.hlLive, ls.sharp.hlLive]) {
      if (!painted.has(c)) continue;
      c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      painted.delete(c);
      showHighlights(ls);
    }
  }, [props.active]);

  useEffect(() => {
    const live = liveRef.current!;
    const ls = layers();
    const liveCtx = live.getContext("2d", { desynchronized: propsRef.current.lowLatency })!;
    const sharpLiveCtx = ls.sharp.live.getContext("2d", { desynchronized: propsRef.current.lowLatency })!;
    const ctxOf = (c: HTMLCanvasElement) => (c === live ? liveCtx : c === ls.sharp.live ? sharpLiveCtx : c.getContext("2d")!);
    /** 지금 긋는 것을 그릴 캔버스: 선명한 창이 있으면 그 층 (v0.50) */
    const liveTarget = (hl: boolean) => (winRef.current ? (hl ? ls.sharp.hlLive : ls.sharp.live) : hl ? ls.hlLive : live);
    busyRef.current = () => gesture !== null;
    let gesture: Gesture | null = null;
    /** 바로 앞에 뗀 펜 획 (v0.53 펜이 잠깐 튄 획 잇기) */
    let lastLift: PenLift | null = null;
    let liveBox: Box | null = null;
    /** 진행 중인 획이 그려진 캔버스 (형광펜이면 hlLive, null이면 live) */
    let liveOn: HTMLCanvasElement | null = null;
    let hover: { x: number; y: number } | null = null;
    /** 길게 누르기로 메뉴가 열린 포인터: 뗄 때까지 획을 시작하지 않는다 */
    let ignored: number | null = null;

    // ── 레이저 펜 (v0.33): 맨 위 층에 그리고, 뗀 뒤 잠깐 있다가 사라진다. 저장하지 않는다 ──
    const lasers: Laser[] = [];
    /** 펜을 띄운 채 가리키는 자리 (레이저 포인터 점) */
    let laserDot: { x: number; y: number } | null = null;
    let laserRaf = 0;
    const buttonAction = () => propsRef.current.penButton ?? "eraser";
    const paintLasers = () => {
      laserRaf = 0;
      const c = laserRef.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const z = propsRef.current.zoom || 1;
      const now = performance.now();
      setT(ctx, c);
      for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        let alpha = 1;
        if (l.end) {
          const t = now - l.end - LASER_HOLD_MS;
          if (t >= LASER_FADE_MS) {
            lasers.splice(i, 1);
            continue;
          }
          if (t > 0) alpha = 1 - t / LASER_FADE_MS;
        }
        paintLaser(ctx, l.pts, z, alpha);
      }
      if (laserDot) paintLaser(ctx, [[laserDot.x, laserDot.y]], z, 1);
      // 사라지는 중인 자국이 있으면 다음 화면에서 또
      if (lasers.length) laserRaf = requestAnimationFrame(paintLasers);
    };
    const kickLaser = () => {
      if (!laserRaf) laserRaf = requestAnimationFrame(paintLasers);
    };
    const endLaser = (g: Gesture) => {
      if (g.laser && !g.laser.end) g.laser.end = performance.now();
      kickLaser();
    };
    // 다른 도구로 바꾸면 레이저 점을 지운다 (아래 도구 effect가 부른다)
    clearLaserDotRef.current = () => {
      if (!laserDot) return;
      laserDot = null;
      kickLaser();
    };

    const page = () => propsRef.current.page;

    /** 화면 좌표 → 페이지 CSS 픽셀 좌표 (확대·이동된 상태도 rect로 보정) */
    const toPagePx = (e: PointerEvent, rect: DOMRect) => {
      const p = page();
      return {
        x: ((e.clientX - rect.left) / rect.width) * p.width,
        y: ((e.clientY - rect.top) / rect.height) * p.height,
      };
    };

    const toPoint = (e: PointerEvent, rect: DOMRect, prev?: InkPoint): InkPoint => {
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      let pressure = 0.5;
      if (e.pointerType === "pen") {
        // 일부 기기는 접촉 순간 필압 0을 보낸다 → 직전 값을 유지
        pressure = e.pressure > 0 ? e.pressure : (prev?.[2] ?? 0.2);
      }
      return [round(x), round(y), round(pressure)];
    };

    /** 캔버스의 한 자리(페이지 px 상자, 없으면 전부)를 지운다 */
    const clearRegion = (target: HTMLCanvasElement, box: Box | null, redrawing = false) => {
      const ctx = ctxOf(target);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = geos.get(target);
      if (box && g) {
        const x = Math.floor((box.x0 - g.ox) * g.s) - 2;
        const y = Math.floor((box.y0 - g.oy) * g.s) - 2;
        ctx.clearRect(x, y, Math.ceil((box.x1 - box.x0) * g.s) + 4, Math.ceil((box.y1 - box.y0) * g.s) + 4);
      } else {
        ctx.clearRect(0, 0, target.width, target.height);
      }
      if (target === ls.hlLive || target === ls.sharp.hlLive) {
        painted.delete(target);
        if (!redrawing) showHighlights(ls);
      }
    };

    /** 지난번에 그린 영역만 지운다 (큰 캔버스를 통째로 지우는 비용 절약). redrawing: 곧 다시 그리므로 형광펜 층을 끄지 않는다 */
    const clearLive = (redrawing = false) => {
      clearStale();
      clearRegion(liveOn ?? live, liveBox, redrawing);
      liveBox = null;
      liveOn = null;
    };

    // 뗀 획의 진행 층 자국 (v0.50): 저지연(desynchronized) 캔버스는 지운 것이 곧바로 화면에 나가는데, 확정 층에 그린 획은
    // 다음 화면에야 나간다. 그래서 펜을 떼자마자 지우면 한 화면 동안 방금 쓴 획이 사라졌다 나타나 깜빡였다.
    // 확정 층에 그린 뒤 두 화면을 기다렸다 지운다 (그동안은 두 층에 같은 획이 겹쳐 보일 뿐)
    let stale: { canvas: HTMLCanvasElement; box: Box | null } | null = null;
    let staleRaf = 0;
    const clearStale = () => {
      cancelAnimationFrame(staleRaf);
      staleRaf = 0;
      if (!stale) return;
      const { canvas, box } = stale;
      stale = null;
      clearRegion(canvas, box);
    };
    const deferLiveClear = () => {
      clearStale();
      if (!liveOn && !liveBox) return;
      stale = { canvas: liveOn ?? live, box: liveBox };
      liveOn = null;
      liveBox = null;
      staleRaf = requestAnimationFrame(() => {
        staleRaf = requestAnimationFrame(clearStale);
      });
    };

    const drawEraserCursor = (x: number, y: number) => {
      clearLive();
      const r = unitsToPx(propsRef.current.eraserSize, page());
      const target = liveTarget(false);
      const c = ctxOf(target);
      setT(c, target);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.lineWidth = 1.5 / propsRef.current.zoom;
      c.strokeStyle = "rgba(60,60,60,0.9)";
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.fill();
      c.stroke();
      liveOn = target;
      liveBox = { x0: x - r - 2, y0: y - r - 2, x1: x + r + 2, y1: y + r + 2 };
    };

    /** 올가미 (v0.43): 지나간 자리를 점선으로, 처음 점까지 닫힌 모양으로 옅게 칠한다 */
    const drawLasso = (pts: [number, number][]) => {
      clearLive();
      const z = propsRef.current.zoom || 1;
      const target = liveTarget(false);
      const liveCtx = ctxOf(target);
      setT(liveCtx, target);
      liveOn = target;
      liveCtx.beginPath();
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      pts.forEach(([x, y], i) => {
        if (i) liveCtx.lineTo(x, y);
        else liveCtx.moveTo(x, y);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      });
      liveCtx.closePath();
      // 올가미 자국: 테마 포인트 색 (v0.49)
      liveCtx.fillStyle = `rgba(${cssToken("--accent-rgb") || "241, 131, 73"}, 0.08)`;
      liveCtx.fill();
      liveCtx.setLineDash([6 / z, 4 / z]);
      liveCtx.lineWidth = 1.6 / z;
      liveCtx.strokeStyle = cssToken("--accent-text") || "#9c3d15";
      liveCtx.stroke();
      liveCtx.setLineDash([]);
      const m = 4 / z;
      liveBox = { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
    };

    const renderLive = (stroke: Stroke, predicted: InkPoint[]) => {
      const t0 = performance.now();
      clearLive(true);
      const p = page();
      // 형광펜은 형광펜 층(펜 필기 아래, 곱하기)에서 그려 지금 획도 놓였을 때와 같게 보인다. 확대 중이면 선명한 창에 (v0.50)
      const hl = isHighlighter(stroke);
      const target = liveTarget(hl);
      const ctx = ctxOf(target);
      setT(ctx, target);
      fillStroke(ctx, stroke, p, false, predicted);
      liveOn = target;
      if (hl) painted.add(target);
      showHighlights(ls);
      const margin = unitsToPx(stroke.width, p) + 2;
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const pts of [stroke.points, predicted]) {
        for (const [x, y] of pts) {
          const px = x * p.width;
          const py = y * p.height;
          if (px < box.x0) box.x0 = px;
          if (py < box.y0) box.y0 = py;
          if (px > box.x1) box.x1 = px;
          if (py > box.y1) box.y1 = py;
        }
      }
      liveBox = { x0: box.x0 - margin, y0: box.y0 - margin, x1: box.x1 + margin, y1: box.y1 + margin };
      recordRender(performance.now() - t0);
    };

    const eraseAt = (events: PointerEvent[], g: Gesture) => {
      const p = page();
      const r = unitsToPx(propsRef.current.eraserSize, p);
      let changed = false;
      const target = propsRef.current.eraserTarget ?? "all";
      const area = propsRef.current.eraserMode === "area";
      const hitAt = (x: number, y: number) => {
        if (area) {
          // 부분 지우개 (v0.40): 닿은 획에서 지우개 원 안의 부분만 잘라 내고 남은 조각은 둔다
          let cut = false;
          const next: Stroke[] = [];
          for (const st of g.working) {
            const pieces = eraserTakes(target, st) ? eraseStrokeArea(st, x, y, r, p, newId) : null;
            if (pieces) {
              next.push(...pieces);
              cut = true;
            } else next.push(st);
          }
          if (cut) {
            g.working = next;
            changed = true;
          }
          return;
        }
        const next = g.working.filter((st) => !(eraserTakes(target, st) && strokeHitsCircle(st, x, y, r, p)));
        if (next.length !== g.working.length) {
          g.working = next;
          changed = true;
        }
      };
      for (const ev of events) {
        const { x, y } = toPagePx(ev, g.rect);
        // 지난 자리에서 여기까지 지우개 반지름 간격으로 (이벤트 사이가 멀어도 가는 획을 빠뜨리지 않게)
        const from = g.lastErase;
        if (from) {
          const steps = Math.min(200, Math.floor(Math.hypot(x - from.x, y - from.y) / Math.max(1, r * 0.8)));
          for (let i = 1; i <= steps; i++) hitAt(from.x + ((x - from.x) * i) / (steps + 1), from.y + ((y - from.y) * i) / (steps + 1));
        }
        hitAt(x, y);
        g.lastErase = { x, y };
      }
      if (changed) {
        g.erased = true;
        renderedRef.current = g.working;
        redraw(ls, g.working, p);
      }
    };

    /** 이 이벤트가 화면에 닿은 상태(펜 끝 접촉, 손가락, 마우스 버튼)인지 */
    const isContact = (e: PointerEvent) => {
      const kind = pointerKind(e);
      if (kind === "pen") return !!(e.buttons & 1) || e.pressure > 0;
      if (kind === "mouse") return !!(e.buttons & 3);
      return true;
    };

    const begin = (e: PointerEvent) => {
      const props0 = propsRef.current;
      const { tool } = props0;
      e.preventDefault();
      try {
        live.setPointerCapture(e.pointerId);
      } catch {
        // 이미 끝난 포인터면 캡처할 수 없다
      }
      const rect = live.getBoundingClientRect();
      // 사이드 버튼을 누르고 있으면 도구와 상관없이 버튼 동작(기본 지우개, v0.33부터 레이저 펜·형광펜도)
      // (안드로이드 앱: 펜이 닿는 순간 버튼이 눌려 있었는지 앱에 물어 획 전체를 정한다. 중간에 버튼을 떼도 그대로)
      const button = penStrokeErasing(e) ? (props0.penButton ?? "eraser") : null;
      const mode =
        tool === "eraser" || button === "eraser"
          ? "erase"
          : tool === "laser" || button === "laser"
            ? "laser"
            : tool === "lasso" || button === "lasso"
              ? "lasso"
              : "draw";
      // 그릴 펜: 버튼 형광펜이면 그 형광펜, 아니면 지금 펜 바 펜
      const hlButton = button === "highlighter" ? props0.buttonHighlighter : undefined;
      const style = hlButton
        ? { tool: "highlighter" as const, color: hlButton.color, width: hlButton.width, straight: !!hlButton.straight, fixed: false, nib: undefined, opacity: undefined }
        : {
            tool: tool === "highlighter" ? ("highlighter" as const) : ("pen" as const),
            color: props0.color,
            width: props0.width,
            straight: tool === "highlighter" && !!props0.straightLine,
            fixed: tool === "pen" && !!props0.fixedWidth,
            nib: tool === "pen" ? props0.nib : undefined,
            opacity: tool === "pen" && typeof props0.opacity === "number" && props0.opacity < 1 ? props0.opacity : undefined,
          };
      gesture = {
        pointerId: e.pointerId,
        pointerType: pointerKind(e),
        mode,
        laser: null,
        lasso: null,
        autoStraight: false,
        rect,
        stroke: null,
        working: renderedRef.current.slice(),
        erased: false,
        viaDown: e.type === "pointerdown",
        holdAt: { x: e.clientX, y: e.clientY },
        lockR: HOLD_KEEP,
        smallLine: false,
        ext: { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY },
        holdTimer: 0,
        straight: null,
        lineLock: null,
        pending: null,
        dropped: null,
        shaped: false,
        drag: null,
        lastErase: null,
        jitterTol: stabilizeOf(props0.stabilize).tol,
        samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
        bounce: null,
      };
      if (mode === "erase") {
        eraseAt([e], gesture);
        const { x, y } = toPagePx(e, rect);
        drawEraserCursor(x, y);
        return;
      }
      // 펜을 대면 띄워 두었을 때의 레이저 점은 지운다 (닿은 자국만)
      laserDot = null;
      if (mode === "laser") {
        clearLive();
        const { x, y } = toPagePx(e, rect);
        gesture.laser = { pts: [[x, y]], end: 0 };
        lasers.push(gesture.laser);
        kickLaser();
        return;
      }
      if (mode === "lasso") {
        const { x, y } = toPagePx(e, rect);
        gesture.lasso = [[x, y]];
        drawLasso(gesture.lasso);
        return;
      }
      gesture.stroke = {
        id: newId(),
        tool: style.tool,
        color: style.color,
        width: style.width,
        points: [toPoint(e, rect)],
        simulatePressure: e.pointerType !== "pen",
        // v0.32: 떨림을 거른 점 → 그릴 때 끝 다듬기
        smooth: SMOOTH_V2,
        // v0.42: 손떨림 보정 세기 (보통이면 붙이지 않음)
        ...(stabilizeOf(props0.stabilize).radius !== 2 ? { smoothR: stabilizeOf(props0.stabilize).radius } : {}),
        // v0.33: 필압을 쓰지 않는 펜
        ...(style.fixed ? { fixedWidth: true as const } : {}),
        // v0.41: 펜 종류·불투명도
        ...(style.nib ? { nib: style.nib } : {}),
        ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
      };
      // 바로 앞 펜 획과 이어 쓴 것인지 (v0.53): 펜이 아주 잠깐 떨어졌다 다시 닿은 것이면 뗄 때 하나로 잇는다
      const prevLift = lastLift;
      const lastStroke = renderedRef.current[renderedRef.current.length - 1];
      if (prevLift && gesture.pointerType === "pen" && !style.straight && lastStroke?.id === prevLift.id) {
        const widthScreen = unitsToPx(style.width, page()) * (props0.zoom || 1);
        const kind = bounceRelation(prevLift, performance.now(), [e.clientX, e.clientY], penStyleKey(gesture.stroke), widthScreen);
        if (kind) gesture.bounce = { kind, prev: prevLift };
      }
      lastLift = null;
      const shapeTool = props0.shapeTool;
      if (shapeTool && shapeTool !== "auto") {
        // 도형 모드: 펜을 댄 곳에서부터 끌어 그린다 (움직이기 전에는 그리지 않음)
        const { x, y } = toPagePx(e, rect);
        gesture.drag = { kind: shapeTool, start: [x, y], moved: false };
        return;
      }
      if (style.straight) {
        // 곧게 긋는 형광펜 (v0.33): 댄 곳에서 지금 자리까지 늘 직선 (움직이면 아래 직선 따라오기)
        const { x, y } = toPagePx(e, rect);
        gesture.straight = { start: [x, y] };
        gesture.autoStraight = true;
      }
      renderLive(gesture.stroke, []);
      armHold(gesture);
    };

    // ── 도형 보정: 긋다가 멈추면 알아본 도형(원·사각형·삼각형·별·화살표 등), 모르면 시작점부터 지금 자리까지 직선 ──
    const armHold = (g: Gesture) => {
      clearTimeout(g.holdTimer);
      if (!propsRef.current.straighten || g.straight || g.shaped || g.drag) return;
      g.holdTimer = window.setTimeout(() => snapShape(g), HOLD_MS);
    };

    const snapShape = (g: Gesture) => {
      const stroke = g.stroke;
      if (gesture !== g || !stroke || g.straight || g.shaped) return;
      const p = page();
      const px = stroke.points.map(([x, y]): [number, number] => [x * p.width, y * p.height]);
      const xs = px.map((q) => q[0]);
      const ys = px.map((q) => q[1]);
      const zoom = propsRef.current.zoom || 1;
      const longSide = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * zoom;
      let hold: ReturnType<typeof guessHoldShape>;
      if (longSide < SHAPE_MIN_PX) {
        // 작은 획 (v0.54): 도형·곡선으로는 바꾸지 않고(v0.37: 작은 ㅇ이 원이 되던 문제), 거의 곧은 획만 직선으로.
        // 0.53까지는 작은 획은 멈춰도 직선이 되지 않았다
        const widthScr = unitsToPx(stroke.width, p) * zoom;
        if (longSide < LINE_MIN_PX || pathLengthPx(stroke.points, p) * zoom < Math.max(LINE_MIN_PX, widthScr * 3)) return;
        if (!nearlyStraight(px, (len) => Math.max(SMALL_LINE_DEV_PX / zoom, len * SMALL_LINE_DEV))) return;
        hold = { type: "line" };
        g.lockR = SMALL_KEEP;
        g.smallLine = true;
      } else {
        // 짧은 획(점, 짧은 삐침)은 그대로
        if (pathLengthPx(stroke.points, p) < Math.max(24, unitsToPx(stroke.width, p) * 4)) return;
        // 알아본 도형·곡선이 쓴 획과 서로 가까울 때만, 곧은 선은 거의 곧을 때만 (v0.51: 흘려 쓴 글자가 멈추면 네모·화살표·직선이 되던 것)
        hold = guessHoldShape(px, p, unitsToPx(stroke.width, p), true);
      }
      if (!hold) return;
      if (hold.type === "line") {
        g.straight = { start: px[0] };
        g.lineLock = { x: g.holdAt.x, y: g.holdAt.y };
        g.stroke = lineStroke(g, px[px.length - 1]);
      } else {
        g.shaped = true;
        g.stroke = makeShapeStroke(stroke.id, hold.spec, stroke, p);
      }
      navigator.vibrate?.(10);
      renderLive(g.stroke, []);
    };

    /** 직선: 시작점에서 end(페이지 px)까지, 가로·세로·45° 근처는 딱 맞춤 */
    const lineStroke = (g: Gesture, end: [number, number]): Stroke => {
      const p = page();
      const [sx, sy] = g.straight!.start;
      const e = snapLineEnd(sx, sy, end[0], end[1], p.width);
      return makeShapeStroke(g.stroke!.id, lineSpec("line", [sx, sy], [e.x, e.y], p), g.stroke!, p);
    };

    const onDown = (e: PointerEvent) => {
      recordPointer(e);
      if (e.pointerId === ignored) return;
      if (gesture) {
        // 두 번째 손가락은 onAnyDown이 이미 처리했다 (쓰던 획 취소 → 확대·이동)
        const kind = pointerKind(e);
        if (kind === "touch") return;
        if (kind === "pen" && gesture.pointerType === "touch") {
          // 손바닥이 먼저 닿고 펜이 나중에 오면 손바닥 획을 버리고 펜을 따른다
          cancelGesture();
        } else if (kind === "pen" && gesture.pointerType === "pen" && gesture.viaDown) {
          // 펜이 다시 닿았는데 지난 획이 열려 있으면 그 뗌을 놓친 것이다.
          // 그대로 두면 새로 긋는 점이 지난 획 끝에 이어 붙어 엉뚱한 선이 생기므로 지난 획은 여기서 마무리한다
          settle(gesture, false);
        } else {
          return;
        }
      }
      if (pointerKind(e) === "touch") {
        // 펜을 쓰는 중에 닿은 터치, 손바닥이 닿아 있는 동안의 터치는 손바닥 (손가락 필기를 꺼 두었으면 넘기기·확대용이라 여기서는 무시)
        if (penRecentlyActive() || palmActive()) {
          debugStats.rejectedTouches++;
          return;
        }
        if (!propsRef.current.fingerDraw) return;
        // 이미 다른 손가락이 닿아 있으면 확대·이동 중이다
        if (activeTouchCount() > 1) return;
      }
      // 펜을 띄운 채 사이드 버튼만 누른 경우: 아직 닿지 않았으므로 획을 시작하지 않는다
      // (앱은 버튼을 왼쪽 버튼처럼 넘기기도 해서 안드로이드에 닿았는지 한 번 더 묻는다, 0.26)
      if (!isContact(e) || !penTouching(e)) return;
      begin(e);
    };

    const onMove = (e: PointerEvent) => {
      const coalesced = e.getCoalescedEvents?.() ?? [];
      const predicted = e.getPredictedEvents?.() ?? [];
      recordPointer(e, coalesced.length, predicted.length);

      if (e.pointerId === ignored) return;
      if (!gesture) {
        const kind = pointerKind(e);
        if (kind === "touch") return;
        // 사이드 버튼을 누른 채 펜이 닿는 경우(버튼 → 접촉 순서)는 pointermove로만 들어온다
        if (isContact(e) && kind === "pen" && penTouching(e)) {
          begin(e);
          return;
        }
        // 지우개 상태에서 펜을 띄운 채 움직이면 지우개 크기를 미리 보여 준다
        const erasing = propsRef.current.tool === "eraser" || (isSideButtonDown() && buttonAction() === "eraser");
        const rect = live.getBoundingClientRect();
        const { x, y } = toPagePx(e, rect);
        hover = { x, y };
        if (erasing) drawEraserCursor(x, y);
        else if (liveBox) clearLive();
        // 레이저 펜: 펜을 띄운 채(PC는 마우스) 움직이면 그 자리에 빨간 점 (레이저 포인터처럼)
        const laserHover = propsRef.current.tool === "laser" || (kind === "pen" && isSideButtonDown() && buttonAction() === "laser");
        if (laserHover || laserDot) {
          laserDot = laserHover ? { x, y } : null;
          kickLaser();
        }
        return;
      }
      if (e.pointerId !== gesture.pointerId) return;
      e.preventDefault();
      // 사이드 버튼을 누른 채 펜 끝만 뗀 경우
      if (gesture.pointerType === "pen" && !isContact(e)) {
        finish(e, false);
        return;
      }
      const events = coalesced.length ? coalesced : [e];

      if (gesture.mode === "erase") {
        eraseAt(events, gesture);
        const { x, y } = toPagePx(e, gesture.rect);
        drawEraserCursor(x, y);
        return;
      }
      if (gesture.mode === "laser") {
        for (const ev of events) {
          const { x, y } = toPagePx(ev, gesture.rect);
          gesture.laser?.pts.push([x, y]);
        }
        kickLaser();
        return;
      }
      if (gesture.mode === "lasso") {
        const pts = gesture.lasso!;
        for (const ev of events) {
          const { x, y } = toPagePx(ev, gesture.rect);
          const last = pts[pts.length - 1];
          if (Math.abs(x - last[0]) + Math.abs(y - last[1]) > 0.5) pts.push([x, y]);
        }
        drawLasso(pts);
        return;
      }
      const stroke = gesture.stroke!;
      if (gesture.drag) {
        const { x, y } = toPagePx(e, gesture.rect);
        const d = gesture.drag;
        if (!d.moved && Math.hypot(x - d.start[0], y - d.start[1]) < 4) return;
        d.moved = true;
        gesture.stroke = makeShapeStroke(stroke.id, dragShape(d.kind, d.start, [x, y], page()), stroke, page());
        renderLive(gesture.stroke, []);
        return;
      }
      // 도형이 된 뒤에는 그대로 (뗀 뒤 손잡이로 고친다)
      if (gesture.shaped) return;
      // 멈춘 자리에서 움직이면 다시 기다린다
      // 그은 자리 (작은 획은 더 작게 움직여도 아직 긋는 중으로, v0.54)
      const ext = gesture.ext;
      for (const ev of events) {
        if (ev.clientX < ext.x0) ext.x0 = ev.clientX;
        if (ev.clientX > ext.x1) ext.x1 = ev.clientX;
        if (ev.clientY < ext.y0) ext.y0 = ev.clientY;
        if (ev.clientY > ext.y1) ext.y1 = ev.clientY;
      }
      const slop = Math.max(ext.x1 - ext.x0, ext.y1 - ext.y0) < SHAPE_MIN_PX ? HOLD_SLOP_SMALL : HOLD_SLOP;
      if (Math.hypot(e.clientX - gesture.holdAt.x, e.clientY - gesture.holdAt.y) > slop) {
        gesture.holdAt = { x: e.clientX, y: e.clientY };
        armHold(gesture);
      }
      if (gesture.straight) {
        // 직선이 된 자리에서 HOLD_KEEP 안의 떨림(뗄 때 미끄러짐)은 무시, 벗어나면 그때부터 끝점이 따라온다
        const lock = gesture.lineLock;
        if (lock) {
          if (Math.hypot(e.clientX - lock.x, e.clientY - lock.y) <= gesture.lockR) return;
          gesture.lineLock = null;
        }
        // 직선이 된 뒤: 떼기 전까지 끝점(각도·길이)이 따라온다
        const { x, y } = toPagePx(e, gesture.rect);
        gesture.stroke = lineStroke(gesture, [x, y]);
        renderLive(gesture.stroke, []);
        return;
      }
      const r = gesture.rect;
      const onScreen = (q: InkPoint) => ({ x: q[0] * r.width, y: q[1] * r.height });
      for (const ev of events) {
        gesture.samples.push({ x: ev.clientX, y: ev.clientY, t: ev.timeStamp });
        if (gesture.samples.length > 12) gesture.samples.shift();
        const pt = toPoint(ev, r, stroke.points[stroke.points.length - 1]);
        const n = stroke.points.length;
        const last = stroke.points[n - 1];
        if (stroke.smooth === SMOOTH_V2) {
          // 떨림 거르기 (v0.32): 마지막으로 남긴 점에서 화면 1px 안이면 버림 (30° 넘게 꺾이면 남김)
          const judged = keepPoint(n > 1 ? onScreen(stroke.points[n - 2]) : null, onScreen(last), onScreen(pt), gesture.dropped, gesture.jitterTol);
          gesture.dropped = judged.dropped;
          if (!judged.keep) {
            gesture.pending = pt;
            continue;
          }
          gesture.pending = null;
        } else if (Math.abs(pt[0] - last[0]) < 1e-4 && Math.abs(pt[1] - last[1]) < 1e-4) continue;
        stroke.points.push(pt);
      }
      // 예측 좌표는 화면에만 잠깐 그리고 저장하지 않는다. 거른 마지막 점은 끝으로 그려 펜 끝과 떨어지지 않게
      // 예측 (v0.36): 형광펜은 쓰지 않고(굵고 반투명해 끝이 늘었다 줄며 튀어 보였다), 펜은 화면 12px까지만
      const lastPt = stroke.points[stroke.points.length - 1];
      // 형광펜 (v0.50.1): 예측을 빼서(v0.36) 펜보다 늦게 따라오던 것 → 펜보다 짧게(화면 8px까지) 다시 그린다
      const extra = capPrediction(
        lastPt,
        predicted.map((ev) => toPoint(ev, r, lastPt)),
        page(),
        (isHighlighter(stroke) ? PREDICT_MAX_HL_SCREEN_PX : PREDICT_MAX_SCREEN_PX) / (propsRef.current.zoom || 1),
      );
      renderLive(stroke, gesture.pending ? [gesture.pending, ...extra] : extra);
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      recordPointer(e);
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      settle(gesture, cancelled);
    };

    /** 획 마무리: 저장(지우개면 지운 결과), 취소된 손가락 획은 버린다 */
    const settle = (g: Gesture, cancelled: boolean) => {
      gesture = null;
      clearTimeout(g.holdTimer);
      // 긋던 획은 확정 층에 그린 뒤에 지운다 (깜빡임, v0.50). 남기지 않는 획은 바로 지운다 (clearStale)
      const drawing = g.mode !== "erase" && g.mode !== "laser" && g.mode !== "lasso";
      if (drawing) deferLiveClear();
      else clearLive();
      if (g.mode === "erase") {
        if (g.erased) propsRef.current.onCommit(g.working);
        return;
      }
      if (g.mode === "laser") {
        endLaser(g);
        return;
      }
      if (g.mode === "lasso") {
        if (cancelled) return;
        const pts = g.lasso!;
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        propsRef.current.onLasso?.(pts, len * (propsRef.current.zoom || 1) < LASSO_TAP_PX);
        return;
      }
      if (cancelled && g.pointerType === "touch") return clearStale();
      let stroke = g.stroke!;
      // 곧게 긋는 형광펜: 움직이지 않았거나(톡) 너무 짧으면 남기지 않는다
      if (g.autoStraight && (!stroke.shape || stroke.shape.w * page().width < 3)) return clearStale();
      // 떨림으로 거른 마지막 자리는 남긴다 (획이 펜을 뗀 자리까지 오도록)
      if (g.pending && !stroke.shape) stroke.points.push(g.pending);
      const p0 = page();
      const z0 = propsRef.current.zoom || 1;
      // 펜이 잠깐 튄 획 (v0.53): 앞 획에 이어 하나로(사이는 곧게), 닿는 순간 튄 점은 버린다
      let replaced: string | null = null;
      const freehand = !stroke.shape && !g.autoStraight && !g.drag;
      if (g.bounce && freehand && !cancelled && renderedRef.current[renderedRef.current.length - 1]?.id === g.bounce.prev.id) {
        replaced = g.bounce.prev.id;
        if (g.bounce.kind === "join") stroke.points = [...g.bounce.prev.raw, ...stroke.points];
        pushLog(g.bounce.kind === "join" ? "펜이 잠깐 튄 획을 이음" : "펜이 닿을 때 튄 점을 버림");
      }
      const raw = stroke.points.slice();
      const scr = (q: InkPoint): [number, number] => [q[0] * p0.width * z0, q[1] * p0.height * z0];
      // 댈 때·뗄 때 갈고리 자르기 (v0.47.2): 실제 필압이 있는 펜 획만 (도형·곧게 긋기 제외)
      if (freehand && !stroke.simulatePressure) stroke.points = trimHooks(stroke.points, scr);
      // 댈 때·뗄 때 미끄러짐 혹 (v0.53): 필압과 상관없이
      if (freehand) stroke.points = trimSlips(stroke.points, scr, unitsToPx(stroke.width, p0) * z0);
      if (g.drag) {
        if (cancelled) return clearStale();
        // 끌지 않고 톡: 그 자리에 기본 크기로
        if (!g.drag.moved) stroke = makeShapeStroke(stroke.id, defaultShape(g.drag.kind, g.drag.start, p0), stroke, p0);
      } else if (!stroke.shape && propsRef.current.shapeTool === "auto") {
        // 자동 도형: 뗄 때 알아본 도형으로 (모르면 쓴 그대로)
        const px = stroke.points.map(([x, y]): [number, number] => [x * p0.width, y * p0.height]);
        // 쓴 획과 서로 가까울 때만 (v0.51, 멈춤 도형 보정과 같음). 곧은 획은 예전처럼 쓴 그대로
        const auto = guessHoldShape(px, p0, unitsToPx(stroke.width, p0), false);
        if (auto && auto.type !== "line") stroke = makeShapeStroke(stroke.id, auto.spec, stroke, p0);
      }
      // 필기 보정: 펜 획(형광펜·도형 제외)을 반듯하게. 작은 글씨(화면 SMALL_WRITING_PX 안)는 그대로 (v0.37)
      if (propsRef.current.beautify && !stroke.shape && stroke.tool === "pen") {
        const zoom = propsRef.current.zoom || 1;
        const tidy = beautifyStroke(stroke.points, page(), unitsToPx(stroke.width, page()), { minSizePx: SMALL_WRITING_PX / zoom });
        if (tidy !== stroke.points) {
          stroke.points = tidy;
          // 다듬은 점은 고른 간격으로 다시 찍은 것이라 예전 방식으로 그린다 (SPEC 5장). 다듬지 않은 획은 v0.32 방식 그대로 (v0.37)
          delete stroke.smooth;
          delete stroke.smoothR;
        }
      }
      // 다음 획이 이어 쓴 것인지 볼 수 있게 적어 둔다 (펜 획만, v0.53)
      if (g.pointerType === "pen" && freehand && !stroke.shape) {
        let len = 0;
        for (let i = 1; i < raw.length; i++) len += Math.hypot((raw[i][0] - raw[i - 1][0]) * p0.width * z0, (raw[i][1] - raw[i - 1][1]) * p0.height * z0);
        const last = g.samples[g.samples.length - 1];
        lastLift = { id: stroke.id, raw, t: performance.now(), end: [last.x, last.y], vel: endVelocity(g.samples), len, style: penStyleKey(stroke) };
      }
      const kept = replaced ? renderedRef.current.filter((x) => x.id !== replaced) : renderedRef.current;
      if (replaced) {
        // 앞 획을 바꾸므로 층을 다시 그린다
        redraw(ls, [...kept, stroke], page());
      } else {
        // 아래 전체 층에, 확대 중이면 선명한 창에도 (v0.50)
        const hl = isHighlighter(stroke);
        for (const target of winRef.current ? [hl ? ls.hl : ls.base, hl ? ls.sharp.hl : ls.sharp.base] : [hl ? ls.hl : ls.base]) {
          const ctx = target.getContext("2d")!;
          setT(ctx, target);
          fillStroke(ctx, stroke, page(), true);
          painted.add(target);
        }
        showHighlights(ls);
      }
      debugStats.strokesDrawn++;
      const next = [...kept, stroke];
      renderedRef.current = next;
      propsRef.current.onCommit(next);
      // 멈춰서 된 도형·직선은 바로 골라 고칠 수 있게 (곧게 긋는 형광펜의 밑줄은 고르지 않음)
      // 작은 직선(v0.54)은 고르지 않는다 — 손글씨 중에 고치기 막대가 뜨지 않게 (눌러서 고칠 수 있음)
      if (stroke.shape && !g.autoStraight && !g.smallLine) propsRef.current.onShapeDrawn?.(stroke.id);
    };

    const cancelGesture = () => {
      if (gesture) clearTimeout(gesture.holdTimer);
      if (gesture?.mode === "laser") endLaser(gesture);
      gesture = null;
      clearLive();
      redraw(ls, renderedRef.current, page());
    };

    const release = (e: PointerEvent) => {
      if (e.pointerId !== ignored) return false;
      ignored = null;
      return true;
    };
    const onUp = (e: PointerEvent) => {
      if (!release(e)) finish(e, false);
    };
    const onCancel = (e: PointerEvent) => {
      if (!release(e)) finish(e, true);
    };
    // 길게 누르기(메뉴): 쓰던 점은 그리지 않는다. 지우던 중이면 지운 것은 그대로 둔다
    const onLongPress = () => {
      if (!gesture) return;
      clearTimeout(gesture.holdTimer);
      ignored = gesture.pointerId;
      if (gesture.mode === "draw" || gesture.mode === "laser" || gesture.mode === "lasso") cancelGesture();
      else {
        const g = gesture;
        gesture = null;
        clearLive();
        if (g.erased) propsRef.current.onCommit(g.working);
      }
    };
    const onLostCapture = (e: PointerEvent) => {
      if (gesture && e.pointerId === gesture.pointerId) finish(e, true);
    };
    const onLeave = (e: PointerEvent) => {
      if (!gesture && liveBox) clearLive();
      hover = null;
      if (laserDot) {
        laserDot = null;
        kickLaser();
      }
      if (e.pointerType === "pen") recordPointer(e);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    // 손가락으로 쓰는 중 화면 어디든 두 번째 손가락이 닿으면 확대·이동이므로 쓰던 획을 버린다
    const onAnyDown = (e: PointerEvent) => {
      if (gesture?.pointerType === "touch" && pointerKind(e) === "touch" && e.pointerId !== gesture.pointerId) cancelGesture();
    };
    // 손바닥으로 판정되면 (v0.32) 쓰던 손가락 획을 버린다
    const offPalm = onPalm(() => {
      if (gesture?.pointerType === "touch") {
        debugStats.rejectedTouches++;
        cancelGesture();
      }
    });
    // 사이드 버튼을 누르거나 떼는 순간 지우개 표시를 바로 바꾼다
    const offSide = onSideButtonChange((down) => {
      if (gesture) return;
      const action = buttonAction();
      if (down && hover && action === "eraser") drawEraserCursor(hover.x, hover.y);
      else if (!down && propsRef.current.tool !== "eraser" && liveBox) clearLive();
      if (action === "laser" && propsRef.current.tool !== "laser") {
        laserDot = down && hover ? { ...hover } : null;
        kickLaser();
      }
    });

    live.addEventListener("pointerdown", onDown, { passive: false });
    live.addEventListener("pointermove", onMove, { passive: false });
    live.addEventListener("pointerup", onUp);
    live.addEventListener("pointercancel", onCancel);
    // pointerup 없이 캡처가 풀리는 경우(시스템 제스처 등)에도 획이 멈춰 있지 않게 마무리한다
    live.addEventListener("lostpointercapture", onLostCapture);
    live.addEventListener("pointerleave", onLeave);
    live.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointerdown", onAnyDown, true);
    window.addEventListener("lessondeck:longpress", onLongPress);
    return () => {
      window.removeEventListener("pointerdown", onAnyDown, true);
      window.removeEventListener("lessondeck:longpress", onLongPress);
      offSide();
      offPalm();
      cancelAnimationFrame(laserRaf);
      live.removeEventListener("pointerdown", onDown);
      live.removeEventListener("pointermove", onMove);
      live.removeEventListener("pointerup", onUp);
      live.removeEventListener("pointercancel", onCancel);
      live.removeEventListener("lostpointercapture", onLostCapture);
      live.removeEventListener("pointerleave", onLeave);
      live.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  return (
    <div ref={rootRef} className={`ink-layer${props.active && !props.passFingers ? "" : " passthrough"}`}>
      <div ref={hlGroupRef} className="ink-hl" style={HIGHLIGHT_LAYER_STYLE}>
        <canvas ref={hlRef} className="ink-canvas" />
        <canvas ref={sharpHlRef} className="ink-canvas ink-sharp" />
        <canvas ref={hlLiveRef} className="ink-canvas" />
        <canvas ref={sharpHlLiveRef} className="ink-canvas ink-sharp" />
      </div>
      <canvas ref={baseRef} className="ink-canvas" />
      <canvas ref={sharpBaseRef} className="ink-canvas ink-sharp" />
      <canvas ref={liveRef} className="ink-canvas ink-live" />
      <canvas ref={sharpLiveRef} className="ink-canvas ink-sharp" />
      <canvas ref={laserRef} className="ink-canvas ink-laser" />
    </div>
  );
}

interface Layers {
  /** 확정된 펜 획 */
  base: HTMLCanvasElement;
  /** 확정된 형광펜 획 */
  hl: HTMLCanvasElement;
  /** 지금 긋는 형광펜 획 */
  hlLive: HTMLCanvasElement;
  /** 형광펜 두 겹의 묶음 (곱하기로 섞음) */
  group: HTMLDivElement;
  /** 선명한 창의 층들 (v0.50): 확정 펜 · 확정 형광펜 · 긋는 펜 · 긋는 형광펜 */
  sharp: { base: HTMLCanvasElement; hl: HTMLCanvasElement; live: HTMLCanvasElement; hlLive: HTMLCanvasElement };
  /** 지금 선명한 창 (없으면 null) */
  win: { current: SharpWindow | null };
}

/**
 * 레이저 펜 자국 하나 (페이지 px, ctx 변환은 페이지 px → 캔버스 px). 확대해도 화면에서 같은 굵기로 보이게 zoom으로 나눈다.
 * 바깥 빨간 빛 → 빨간 선 → 가운데 밝은 심. 점 하나면 동그라미
 */
function paintLaser(ctx: CanvasRenderingContext2D, pts: [number, number][], zoom: number, alpha: number) {
  if (!pts.length) return;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const [nx, ny] = pts[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    if (pts.length > 1) ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [w, color] of [
    [13, `rgba(255, 40, 40, ${0.25 * alpha})`],
    [5.5, `rgba(255, 36, 36, ${0.95 * alpha})`],
    [1.6, `rgba(255, 185, 185, ${0.9 * alpha})`],
  ] as const) {
    trace();
    ctx.lineWidth = w / zoom;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
}

/** 무언가 그려져 있는 캔버스. 형광펜이 없는 페이지는 형광펜 캔버스를 건드리지 않아 큰 캔버스 메모리를 쓰지 않는다 */
const painted = new WeakSet<HTMLCanvasElement>();

/** 캔버스마다 페이지 px → 캔버스 픽셀: (x - ox) * s (v0.50: 선명한 창은 페이지 안의 한 자리만 그린다) */
interface Geo {
  ox: number;
  oy: number;
  s: number;
}
const geos = new WeakMap<HTMLCanvasElement, Geo>();

/** 페이지 px 좌표로 그리도록 변환을 맞춘다 */
function setT(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const g = geos.get(canvas) ?? { ox: 0, oy: 0, s: 1 };
  ctx.setTransform(g.s, 0, 0, g.s, -g.ox * g.s, -g.oy * g.s);
}

/** 선명한 창 한 장의 픽셀 수 상한 (보이는 자리 + 여유) */
const MAX_SHARP_PIXELS = 9_000_000;

/** 선명한 창 층들의 크기·자리를 맞추고, 아래 전체 층은 그 자리를 가린다 (창이 없으면 원래대로) */
function applyWindow(ls: Layers, win: SharpWindow | null, page: PageSize) {
  const layers = [ls.sharp.base, ls.sharp.hl, ls.sharp.live, ls.sharp.hlLive];
  for (const c of layers) {
    painted.delete(c);
    if (!win) {
      // 큰 캔버스 메모리를 돌려준다
      c.width = 0;
      c.height = 0;
      c.style.display = "none";
      geos.delete(c);
      continue;
    }
    const w = Math.max(1, Math.round(win.w * win.s));
    const h = Math.max(1, Math.round(win.h * win.s));
    c.width = w;
    c.height = h;
    Object.assign(c.style, { display: "block", left: `${win.x}px`, top: `${win.y}px`, width: `${win.w}px`, height: `${win.h}px`, right: "auto", bottom: "auto" });
    geos.set(c, { ox: win.x, oy: win.y, s: w / win.w });
  }
  // 아래 전체 층(흐린 것)은 창 자리를 비운다: 창 밖은 그대로 보여 옮기는 동안에도 필기가 보인다
  const hole = win
    ? `path(evenodd, "M0 0H${page.width}V${page.height}H0Z M${win.x.toFixed(2)} ${win.y.toFixed(2)}h${win.w.toFixed(2)}v${win.h.toFixed(2)}h${(-win.w).toFixed(2)}Z")`
    : "";
  ls.base.style.clipPath = hole;
  ls.hl.style.clipPath = hole;
}

/** 획이 창(페이지 px)에 닿는지 — 점의 테두리 상자 + 굵기 (도형 획은 늘 그린다) */
function strokeTouches(s: Stroke, win: SharpWindow, page: PageSize): boolean {
  if (s.shape || !s.points.length) return true;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of s.points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const pad = unitsToPx(s.width, page) * 2 + 2;
  return x1 * page.width + pad >= win.x && x0 * page.width - pad <= win.x + win.w && y1 * page.height + pad >= win.y && y0 * page.height - pad <= win.y + win.h;
}

function paintLayer(canvas: HTMLCanvasElement, strokes: Stroke[], page: PageSize, clip?: SharpWindow) {
  if (!strokes.length && !painted.has(canvas)) return;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setT(ctx, canvas);
  let any = false;
  for (const s of strokes) {
    // 선명한 창: 창에 닿지 않는 획은 건너뛴다
    if (clip && !strokeTouches(s, clip, page)) continue;
    fillStroke(ctx, s, page, true);
    any = true;
  }
  if (any || (strokes.length && !clip)) painted.add(canvas);
  else painted.delete(canvas);
}

function redraw(ls: Layers, strokes: Stroke[], page: PageSize) {
  paintLayer(ls.base, strokes.filter((s) => !isHighlighter(s)), page);
  paintLayer(ls.hl, strokes.filter(isHighlighter), page);
  redrawSharp(ls, strokes, page);
  showHighlights(ls);
}

/** 선명한 창만 다시 (창이 없으면 비워 둔다) */
function redrawSharp(ls: Layers, strokes: Stroke[], page: PageSize) {
  const win = ls.win.current;
  if (!win) return;
  paintLayer(ls.sharp.base, strokes.filter((s) => !isHighlighter(s)), page, win);
  paintLayer(ls.sharp.hl, strokes.filter(isHighlighter), page, win);
}

/** 형광펜이 없으면 섞는 층을 아예 끈다 (곱하기 합성 비용을 아낌) */
function showHighlights(ls: Layers) {
  const display = painted.has(ls.hl) || painted.has(ls.hlLive) || painted.has(ls.sharp.hl) || painted.has(ls.sharp.hlLive) ? "" : "none";
  if (ls.group.style.display !== display) ls.group.style.display = display;
}

function sameStrokes(a: Stroke[], b: Stroke[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function round(n: number) {
  return Math.round(n * 1e5) / 1e5;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

