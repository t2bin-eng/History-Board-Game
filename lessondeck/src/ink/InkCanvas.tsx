import { useEffect, useLayoutEffect, useRef } from "react";
import { recordPointer, recordRender, debugStats } from "../lib/debugStore";
import { strokeHitsCircle, strokeToSvgPath, unitsToPx, type PageSize } from "./geometry";
import { HIGHLIGHTER_ALPHA } from "./palette";
import type { InkPoint, Stroke, Tool } from "./types";

interface Props {
  page: PageSize;
  strokes: Stroke[];
  tool: Tool;
  color: string;
  width: number;
  eraserSize: number;
  /** 꺼져 있으면 손가락 터치는 필기하지 않는다 (손바닥 오인식 방지) */
  fingerDraw: boolean;
  /** 진행 중인 획 캔버스에 desynchronized(저지연) 컨텍스트를 쓴다. 바꾸려면 컴포넌트를 다시 만들어야 한다. */
  lowLatency: boolean;
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

/** 펜 사용 직후 이 시간 동안은 터치를 손바닥으로 보고 무시한다 */
const PALM_GUARD_MS = 800;

// 두 겹 캔버스: 아래는 확정된 획, 위는 지금 그리는 획.
// 획이 진행되는 동안에는 위 캔버스만 다시 그리고, 펜을 떼면 아래 캔버스에 합성한다 (SPEC R1).
export function InkCanvas(props: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const renderedRef = useRef<Stroke[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, scale: 1 });

  useLayoutEffect(() => {
    const base = baseRef.current!;
    const live = liveRef.current!;
    const { page, strokes } = props;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const size = sizeRef.current;
    const resized = size.width !== page.width || size.height !== page.height;
    if (resized) {
      const w = Math.max(1, Math.round(page.width * dpr));
      const h = Math.max(1, Math.round(page.height * dpr));
      for (const c of [base, live]) {
        c.width = w;
        c.height = h;
        c.style.width = `${page.width}px`;
        c.style.height = `${page.height}px`;
      }
      sizeRef.current = { width: page.width, height: page.height, scale: w / Math.max(1, page.width) };
    }
    if (resized || !sameStrokes(strokes, renderedRef.current)) {
      renderedRef.current = strokes;
      redraw(base, strokes, page, sizeRef.current.scale);
    }
  }, [props.page, props.strokes]);

  useEffect(() => {
    const live = liveRef.current!;
    const base = baseRef.current!;
    const liveCtx = live.getContext("2d", { desynchronized: propsRef.current.lowLatency })!;
    let gesture: Gesture | null = null;
    let lastPenTime = -Infinity;
    let cursorShown = false;

    const page = () => propsRef.current.page;
    const scale = () => sizeRef.current.scale;

    const toPoint = (e: PointerEvent, rect: DOMRect, prev?: InkPoint): InkPoint => {
      const p = page();
      const x = (e.clientX - rect.left) / p.width;
      const y = (e.clientY - rect.top) / p.height;
      let pressure = 0.5;
      if (e.pointerType === "pen") {
        // 일부 기기는 접촉 순간 필압 0을 보낸다 → 직전 값을 유지
        pressure = e.pressure > 0 ? e.pressure : (prev?.[2] ?? 0.2);
      }
      return [round(x), round(y), round(pressure)];
    };

    const clearLive = () => {
      liveCtx.setTransform(1, 0, 0, 1, 0, 0);
      liveCtx.clearRect(0, 0, live.width, live.height);
    };

    const drawEraserCursor = (e: PointerEvent, rect: DOMRect) => {
      clearLive();
      cursorShown = true;
      const s = scale();
      const r = unitsToPx(propsRef.current.eraserSize, page());
      liveCtx.setTransform(s, 0, 0, s, 0, 0);
      liveCtx.beginPath();
      liveCtx.arc(e.clientX - rect.left, e.clientY - rect.top, r, 0, Math.PI * 2);
      liveCtx.lineWidth = 1.5;
      liveCtx.strokeStyle = "rgba(60,60,60,0.9)";
      liveCtx.fillStyle = "rgba(255,255,255,0.35)";
      liveCtx.fill();
      liveCtx.stroke();
    };

    const renderLive = (stroke: Stroke, predicted: InkPoint[]) => {
      const t0 = performance.now();
      clearLive();
      const s = scale();
      liveCtx.setTransform(s, 0, 0, s, 0, 0);
      fillStroke(liveCtx, stroke, page(), false, predicted);
      recordRender(performance.now() - t0);
    };

    const eraseAt = (events: PointerEvent[], g: Gesture) => {
      const p = page();
      const r = unitsToPx(propsRef.current.eraserSize, p);
      let changed = false;
      for (const ev of events) {
        const cx = ev.clientX - g.rect.left;
        const cy = ev.clientY - g.rect.top;
        const next = g.working.filter((st) => !strokeHitsCircle(st, cx, cy, r, p));
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

    const onDown = (e: PointerEvent) => {
      recordPointer(e);
      const { tool, fingerDraw } = propsRef.current;
      if (e.pointerType === "pen") lastPenTime = performance.now();

      if (gesture) {
        // 손바닥이 먼저 닿고 펜이 나중에 오면 손바닥 획을 버리고 펜을 따른다
        if (e.pointerType === "pen" && gesture.pointerType === "touch") {
          cancelGesture();
        } else {
          return;
        }
      }
      if (e.pointerType === "touch") {
        if (!fingerDraw || performance.now() - lastPenTime < PALM_GUARD_MS) {
          debugStats.rejectedTouches++;
          return;
        }
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;

      e.preventDefault();
      live.setPointerCapture(e.pointerId);
      const rect = live.getBoundingClientRect();
      // S펜 사이드 버튼(buttons & 2)이나 지우개 끝(buttons & 32)을 누른 채 쓰면 임시 지우개
      const sideEraser = e.pointerType === "pen" && (e.buttons & 2 || e.buttons & 32 || e.button === 5);
      const mode = tool === "eraser" || sideEraser ? "erase" : "draw";
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
        drawEraserCursor(e, rect);
        return;
      }
      const { color, width } = propsRef.current;
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

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "pen") lastPenTime = performance.now();
      const coalesced = e.getCoalescedEvents?.() ?? [];
      const predicted = e.getPredictedEvents?.() ?? [];
      recordPointer(e, coalesced.length, predicted.length);

      if (!gesture) {
        // 지우개 도구일 때 펜을 띄운 채 움직이면 지우개 크기를 미리 보여 준다
        if (propsRef.current.tool === "eraser" && e.pointerType !== "touch") {
          drawEraserCursor(e, live.getBoundingClientRect());
        } else if (cursorShown) {
          clearLive();
          cursorShown = false;
        }
        return;
      }
      if (e.pointerId !== gesture.pointerId) return;
      e.preventDefault();
      const events = coalesced.length ? coalesced : [e];

      if (gesture.mode === "erase") {
        eraseAt(events, gesture);
        drawEraserCursor(e, gesture.rect);
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
      if (!gesture && cursorShown) {
        clearLive();
        cursorShown = false;
      }
      if (e.pointerType === "pen") recordPointer(e);
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    live.addEventListener("pointerdown", onDown, { passive: false });
    live.addEventListener("pointermove", onMove, { passive: false });
    live.addEventListener("pointerup", onUp);
    live.addEventListener("pointercancel", onCancel);
    // pointerup 없이 캡처가 풀리는 경우(시스템 제스처 등)에도 획이 멈춰 있지 않게 마무리한다
    live.addEventListener("lostpointercapture", onLostCapture);
    live.addEventListener("pointerleave", onLeave);
    live.addEventListener("contextmenu", onContextMenu);
    return () => {
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
    <div className="ink-layer">
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
