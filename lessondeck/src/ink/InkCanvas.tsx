import { useEffect, useLayoutEffect, useRef } from "react";
import { debugStats, recordPointer, recordRender } from "../lib/debugStore";
import { activeTouchCount, hasSideButton, isSideButtonDown, onSideButtonChange, penRecentlyActive } from "../lib/inputState";
import { strokeHitsCircle, strokeToSvgPath, unitsToPx, type PageSize } from "./geometry";
import { HIGHLIGHTER_ALPHA } from "./palette";
import type { InkPoint, Stroke, Tool } from "./types";

interface Props {
  page: PageSize;
  /** 손가락으로 확대한 배율. 확대가 끝나면 이 배율에 맞춰 캔버스를 선명하게 다시 그린다. */
  zoom: number;
  strokes: Stroke[];
  tool: Tool;
  color: string;
  width: number;
  eraserSize: number;
  /** 꺼져 있으면 손가락 터치는 필기하지 않는다 (손바닥 오인식 방지) */
  fingerDraw: boolean;
  /** 진행 중인 획 캔버스에 desynchronized(저지연) 컨텍스트를 쓴다. 바꾸려면 컴포넌트를 다시 만들어야 한다. */
  lowLatency: boolean;
  /** false면 필기층을 통과시킨다 (HTML 페이지 조작 모드: 필기는 보이지만 터치·펜은 웹앱으로) */
  active: boolean;
  onCommit: (strokes: Stroke[]) => void;
}

interface Gesture {
  pointerId: number;
  pointerType: string;
  mode: "draw" | "erase";
  rect: DOMRect;
  stroke: Stroke | null;
  working: Stroke[];
  erased: boolean;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 필기 캔버스 한 장의 픽셀 수 상한 (확대 시 메모리 보호) */
const MAX_INK_PIXELS = 8_000_000;

// 두 겹 캔버스: 아래는 확정된 획, 위는 지금 그리는 획.
// 획이 진행되는 동안에는 위 캔버스만 다시 그리고, 펜을 떼면 아래 캔버스에 합성한다 (SPEC R1).
export function InkCanvas(props: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const renderedRef = useRef<Stroke[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, zoom: 0, scale: 1 });

  useLayoutEffect(() => {
    const base = baseRef.current!;
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
      for (const c of [base, live]) {
        c.width = w;
        c.height = h;
        c.style.width = `${page.width}px`;
        c.style.height = `${page.height}px`;
      }
      sizeRef.current = { width: page.width, height: page.height, zoom, scale: w / Math.max(1, page.width) };
    }
    if (resized || !sameStrokes(strokes, renderedRef.current)) {
      renderedRef.current = strokes;
      redraw(base, strokes, page, sizeRef.current.scale);
    }
  }, [props.page, props.strokes, props.zoom]);

  // 조작 모드로 바뀌면 남아 있던 지우개 표시 등을 지운다
  useEffect(() => {
    if (props.active) return;
    const live = liveRef.current!;
    live.getContext("2d")!.clearRect(0, 0, live.width, live.height);
  }, [props.active]);

  useEffect(() => {
    const live = liveRef.current!;
    const base = baseRef.current!;
    const liveCtx = live.getContext("2d", { desynchronized: propsRef.current.lowLatency })!;
    let gesture: Gesture | null = null;
    let liveBox: Box | null = null;
    let hover: { x: number; y: number } | null = null;

    const page = () => propsRef.current.page;
    const scale = () => sizeRef.current.scale;

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

    /** 지난번에 그린 영역만 지운다 (큰 캔버스를 통째로 지우는 비용 절약) */
    const clearLive = () => {
      liveCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (liveBox) {
        const s = scale();
        const x = Math.floor(liveBox.x0 * s) - 2;
        const y = Math.floor(liveBox.y0 * s) - 2;
        liveCtx.clearRect(x, y, Math.ceil((liveBox.x1 - liveBox.x0) * s) + 4, Math.ceil((liveBox.y1 - liveBox.y0) * s) + 4);
      } else {
        liveCtx.clearRect(0, 0, live.width, live.height);
      }
      liveBox = null;
    };

    const drawEraserCursor = (x: number, y: number) => {
      clearLive();
      const s = scale();
      const r = unitsToPx(propsRef.current.eraserSize, page());
      liveCtx.setTransform(s, 0, 0, s, 0, 0);
      liveCtx.beginPath();
      liveCtx.arc(x, y, r, 0, Math.PI * 2);
      liveCtx.lineWidth = 1.5 / propsRef.current.zoom;
      liveCtx.strokeStyle = "rgba(60,60,60,0.9)";
      liveCtx.fillStyle = "rgba(255,255,255,0.35)";
      liveCtx.fill();
      liveCtx.stroke();
      liveBox = { x0: x - r - 2, y0: y - r - 2, x1: x + r + 2, y1: y + r + 2 };
    };

    const renderLive = (stroke: Stroke, predicted: InkPoint[]) => {
      const t0 = performance.now();
      clearLive();
      const p = page();
      const s = scale();
      liveCtx.setTransform(s, 0, 0, s, 0, 0);
      fillStroke(liveCtx, stroke, p, false, predicted);
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
      for (const ev of events) {
        const { x, y } = toPagePx(ev, g.rect);
        const next = g.working.filter((st) => !strokeHitsCircle(st, x, y, r, p));
        if (next.length !== g.working.length) {
          g.working = next;
          changed = true;
        }
      }
      if (changed) {
        g.erased = true;
        renderedRef.current = g.working;
        redraw(base, g.working, p, scale());
      }
    };

    /** 이 이벤트가 화면에 닿은 상태(펜 끝 접촉, 손가락, 마우스 버튼)인지 */
    const isContact = (e: PointerEvent) => {
      if (e.pointerType === "pen") return !!(e.buttons & 1) || e.pressure > 0;
      if (e.pointerType === "mouse") return !!(e.buttons & 3);
      return true;
    };

    const begin = (e: PointerEvent) => {
      const { tool, color, width } = propsRef.current;
      e.preventDefault();
      try {
        live.setPointerCapture(e.pointerId);
      } catch {
        // 이미 끝난 포인터면 캡처할 수 없다
      }
      const rect = live.getBoundingClientRect();
      // 사이드 버튼을 누르고 있으면 도구와 상관없이 지우개
      const mode = tool === "eraser" || hasSideButton(e) || (e.pointerType !== "touch" && isSideButtonDown()) ? "erase" : "draw";
      gesture = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        mode,
        rect,
        stroke: null,
        working: renderedRef.current.slice(),
        erased: false,
      };
      if (mode === "erase") {
        eraseAt([e], gesture);
        const { x, y } = toPagePx(e, rect);
        drawEraserCursor(x, y);
        return;
      }
      gesture.stroke = {
        id: newId(),
        tool: tool === "highlighter" ? "highlighter" : "pen",
        color,
        width,
        points: [toPoint(e, rect)],
        simulatePressure: e.pointerType !== "pen",
      };
      renderLive(gesture.stroke, []);
    };

    const onDown = (e: PointerEvent) => {
      recordPointer(e);
      if (gesture) {
        // 두 번째 손가락은 onAnyDown이 이미 처리했다 (쓰던 획 취소 → 확대·이동)
        if (e.pointerType === "touch") return;
        if (e.pointerType === "pen" && gesture.pointerType === "touch") {
          // 손바닥이 먼저 닿고 펜이 나중에 오면 손바닥 획을 버리고 펜을 따른다
          cancelGesture();
        } else {
          return;
        }
      }
      if (e.pointerType === "touch") {
        // 펜을 쓰는 중에 닿은 터치는 손바닥 (손가락 필기를 꺼 두었으면 넘기기·확대용이라 여기서는 무시)
        if (penRecentlyActive()) {
          debugStats.rejectedTouches++;
          return;
        }
        if (!propsRef.current.fingerDraw) return;
        // 이미 다른 손가락이 닿아 있으면 확대·이동 중이다
        if (activeTouchCount() > 1) return;
      }
      // 펜을 띄운 채 사이드 버튼만 누른 경우: 아직 닿지 않았으므로 획을 시작하지 않는다
      if (!isContact(e)) return;
      begin(e);
    };

    const onMove = (e: PointerEvent) => {
      const coalesced = e.getCoalescedEvents?.() ?? [];
      const predicted = e.getPredictedEvents?.() ?? [];
      recordPointer(e, coalesced.length, predicted.length);

      if (!gesture) {
        if (e.pointerType === "touch") return;
        // 사이드 버튼을 누른 채 펜이 닿는 경우(버튼 → 접촉 순서)는 pointermove로만 들어온다
        if (isContact(e) && e.pointerType === "pen") {
          begin(e);
          return;
        }
        // 지우개 상태에서 펜을 띄운 채 움직이면 지우개 크기를 미리 보여 준다
        const erasing = propsRef.current.tool === "eraser" || isSideButtonDown();
        const rect = live.getBoundingClientRect();
        const { x, y } = toPagePx(e, rect);
        hover = { x, y };
        if (erasing) drawEraserCursor(x, y);
        else if (liveBox) clearLive();
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
      const stroke = gesture.stroke!;
      for (const ev of events) {
        const pt = toPoint(ev, gesture.rect, stroke.points[stroke.points.length - 1]);
        const last = stroke.points[stroke.points.length - 1];
        if (Math.abs(pt[0] - last[0]) < 1e-4 && Math.abs(pt[1] - last[1]) < 1e-4) continue;
        stroke.points.push(pt);
      }
      // 예측 좌표는 화면에만 잠깐 그리고 저장하지 않는다
      const extra = predicted.map((ev) => toPoint(ev, gesture!.rect, stroke.points[stroke.points.length - 1]));
      renderLive(stroke, extra);
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      recordPointer(e);
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      const g = gesture;
      gesture = null;
      clearLive();
      if (g.mode === "erase") {
        if (g.erased) propsRef.current.onCommit(g.working);
        return;
      }
      if (cancelled && g.pointerType === "touch") return;
      const stroke = g.stroke!;
      const s = scale();
      const ctx = base.getContext("2d")!;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      fillStroke(ctx, stroke, page(), true);
      debugStats.strokesDrawn++;
      const next = [...renderedRef.current, stroke];
      renderedRef.current = next;
      propsRef.current.onCommit(next);
    };

    const cancelGesture = () => {
      gesture = null;
      clearLive();
      redraw(base, renderedRef.current, page(), scale());
    };

    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);
    const onLostCapture = (e: PointerEvent) => {
      if (gesture && e.pointerId === gesture.pointerId) finish(e, true);
    };
    const onLeave = (e: PointerEvent) => {
      if (!gesture && liveBox) clearLive();
      hover = null;
      if (e.pointerType === "pen") recordPointer(e);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    // 손가락으로 쓰는 중 화면 어디든 두 번째 손가락이 닿으면 확대·이동이므로 쓰던 획을 버린다
    const onAnyDown = (e: PointerEvent) => {
      if (gesture?.pointerType === "touch" && e.pointerType === "touch" && e.pointerId !== gesture.pointerId) cancelGesture();
    };
    // 사이드 버튼을 누르거나 떼는 순간 지우개 표시를 바로 바꾼다
    const offSide = onSideButtonChange((down) => {
      if (gesture) return;
      if (down && hover) drawEraserCursor(hover.x, hover.y);
      else if (!down && propsRef.current.tool !== "eraser" && liveBox) clearLive();
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
    return () => {
      window.removeEventListener("pointerdown", onAnyDown, true);
      offSide();
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
    <div className={`ink-layer${props.active ? "" : " passthrough"}`}>
      <canvas ref={baseRef} className="ink-canvas" />
      <canvas ref={liveRef} className="ink-canvas ink-live" />
    </div>
  );
}

function fillStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, page: PageSize, last: boolean, extra: InkPoint[] = []) {
  const d = strokeToSvgPath(stroke, page, last, extra);
  if (!d) return;
  ctx.globalAlpha = stroke.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
  ctx.fillStyle = stroke.color;
  ctx.fill(new Path2D(d));
  ctx.globalAlpha = 1;
}

function redraw(canvas: HTMLCanvasElement, strokes: Stroke[], page: PageSize, scale: number) {
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const s of strokes) fillStroke(ctx, s, page, true);
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
