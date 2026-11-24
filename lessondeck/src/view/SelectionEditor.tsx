import { BringToFront, Check, Copy, CopyPlus, Layers, Minus, Move, Palette, Plus, RotateCw, Scissors, SendToBack, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { snapAngle } from "../doc/stickers";
import { strokeToSvgPath, type PageSize } from "../ink/geometry";
import { HIGHLIGHT_LAYER_STYLE, isHighlighter, strokeColor, strokeOpacity } from "../ink/inkPaint";
import { frameAffine, resizeFrame, rotateFrame, type Pt, type SelFrame, type SelHandle } from "../ink/selection";
import type { Stroke } from "../ink/types";

type Gesture = { kind: "move"; p0: Pt; moved: boolean } | { kind: "resize"; handle: SelHandle } | { kind: "rotate" };

interface Props {
  /** 고른 획 (화면에 보이는 좌표 — HTML 페이지는 스크롤만큼 옮긴 것) */
  strokes: Stroke[];
  frame: SelFrame;
  size: PageSize;
  /** 끄는 중: true면 원래 획을 캔버스에서 빼고 여기서 바뀐 모양을 보여 준다 */
  onLive: (dragging: boolean) => void;
  /** 끌기가 끝남: 이 틀로 옮기고 키우고 돌린다 (실행 취소 한 단계) */
  onTransform: (next: SelFrame) => void;
  onCut: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** 색 바꾸기: 고를 색들과 지금 색 (고른 획이 모두 같은 색이면) */
  colors: { palette: string[]; current: string | null };
  onRecolor: (color: string) => void;
  /** 굵기 배율 (가늘게 0.8 · 굵게 1.25) */
  onRewidth: (k: number) => void;
  onOrder: (to: "front" | "back") => void;
  onDone: () => void;
}

const HANDLES: SelHandle[] = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];
/** 이만큼(페이지 px) 움직여야 옮기기로 본다 (톡 눌러 놓았을 때 흔들려도 그대로) */
const MOVE_SLOP = 3;

// 올가미로 고른 필기 고치기 (v0.43, SPEC 6장 "올가미"): 틀 안을 끌어 옮기고, 모서리(비율 그대로)·변(한 방향)으로 키우고, 위 손잡이로 돌린다.
// 끄는 동안은 처음 모양의 path를 변환 행렬로만 옮겨 보여 주고(빠름), 손을 떼면 획을 한 번에 바꿔 저장한다.
export function SelectionEditor(props: Props) {
  const { strokes, frame, size } = props;
  const [draft, setDraft] = useState<SelFrame | null>(null);
  // 손을 떼는 순간에는 마지막 움직임이 아직 그려지지 않았을 수 있어 ref로도 들고 있는다
  const draftRef = useRef<SelFrame | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [panel, setPanel] = useState<"style" | "order" | null>(null);
  const f = draft ?? frame;
  const onLiveRef = useRef(props.onLive);
  onLiveRef.current = props.onLive;
  useEffect(() => () => onLiveRef.current(false), []);

  // 미리 보기용 path: 고른 획이 바뀔 때만 만든다
  const paths = useMemo(
    () => strokes.map((s) => ({ id: s.id, hl: isHighlighter(s), d: strokeToSvgPath(s, size), color: strokeColor(s), opacity: strokeOpacity(s) })),
    [strokes, size],
  );

  // 막대 크기: 재서 자리를 잡는다 (색·순서 줄을 펴면 두 줄)
  const tbRef = useRef<HTMLDivElement>(null);
  const [tb, setTb] = useState({ width: 300, height: 46 });
  useLayoutEffect(() => {
    const el = tbRef.current;
    if (el && (el.offsetWidth !== tb.width || el.offsetHeight !== tb.height)) setTb({ width: el.offsetWidth, height: el.offsetHeight });
  });

  /** 화면 좌표 → 페이지 px (확대 중이어도 맞게) */
  const toPage = (e: ReactPointerEvent): Pt => {
    const root = (e.currentTarget as HTMLElement).closest(".sel-edit")!;
    const r = root.getBoundingClientRect();
    return [((e.clientX - r.left) * size.width) / Math.max(1, r.width), ((e.clientY - r.top) * size.height) / Math.max(1, r.height)];
  };

  const start = (e: ReactPointerEvent, g: Gesture) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button > 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
    setPanel(null);
    const next = g.kind === "move" ? { ...g, p0: toPage(e) } : g;
    gestureRef.current = next;
    setGesture(next);
  };

  const show = (next: SelFrame) => {
    if (!draftRef.current) props.onLive(true);
    draftRef.current = next;
    setDraft(next);
  };

  const move = (e: ReactPointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    e.stopPropagation();
    const p = toPage(e);
    if (gesture.kind === "move") {
      const dx = p[0] - gesture.p0[0];
      const dy = p[1] - gesture.p0[1];
      if (!gesture.moved && Math.hypot(dx, dy) < MOVE_SLOP) return;
      gesture.moved = true;
      show({ ...frame, cx: frame.cx + dx, cy: frame.cy + dy });
    } else if (gesture.kind === "rotate") {
      show(rotateFrame(frame, p, snapAngle));
    } else {
      show(resizeFrame(frame, gesture.handle, p));
    }
  };

  const end = (e: ReactPointerEvent) => {
    if (!gestureRef.current) return;
    e.stopPropagation();
    gestureRef.current = null;
    setGesture(null);
    const next = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (next && e.type !== "pointercancel") props.onTransform(next);
    else props.onLive(false);
  };

  const grab = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  // 끄는 중의 모양: 처음 틀 → 지금 틀 변환 행렬
  const m = draft ? frameAffine(frame, draft) : null;
  const matrix = m ? `matrix(${m.map((v) => v.toFixed(4)).join(" ")})` : undefined;
  const preview = (hl: boolean) => (
    <svg className="shape-draft" width={size.width} height={size.height} style={hl ? HIGHLIGHT_LAYER_STYLE : undefined} aria-hidden="true">
      <g transform={matrix}>
        {paths
          .filter((p) => p.hl === hl)
          .map((p) => (
            <path key={p.id} d={p.d} fill={p.color} fillOpacity={p.opacity} />
          ))}
      </g>
    </svg>
  );

  // 도구 막대: 틀(돌린 모양) 위 — 돌리기 손잡이 위로 (자리가 없으면 아래)
  const rad = (f.rot * Math.PI) / 180;
  const ey = (Math.abs(Math.sin(rad)) * f.w + Math.abs(Math.cos(rad)) * f.h) / 2;
  const above = f.cy - ey - 56 - tb.height;
  const tbTop = above >= 4 ? above : Math.min(size.height - tb.height - 4, f.cy + ey + 18);
  const tbLeft = Math.min(Math.max(4, f.cx - tb.width / 2), Math.max(4, size.width - tb.width - 4));

  return (
    <>
      {draft && paths.some((p) => p.hl) && preview(true)}
      {draft && preview(false)}
      <div className="shape-edit sel-edit" aria-label="고른 필기">
        <div
          className="se-ui se-frame sel-frame"
          style={{ left: f.cx - f.w / 2, top: f.cy - f.h / 2, width: f.w, height: f.h, transform: `rotate(${f.rot}deg)` }}
          aria-label="고른 필기 옮기기"
          onPointerDown={(e) => start(e, { kind: "move", p0: [0, 0], moved: false })}
          {...grab}
        >
          {HANDLES.map((h) => (
            <span
              key={h}
              className={`se-ui se-handle ${h}${h.length === 1 ? " side" : ""}`}
              aria-label={h.length === 2 ? "크기 (비율 그대로)" : "한쪽으로 늘이기"}
              onPointerDown={(e) => start(e, { kind: "resize", handle: h })}
              {...grab}
            />
          ))}
          <span className="se-stem" />
          <span className="se-ui se-rotate" aria-label="고른 필기 돌리기" onPointerDown={(e) => start(e, { kind: "rotate" })} {...grab}>
            <RotateCw size={14} />
          </span>
          <span className="sel-move-mark" aria-hidden="true">
            <Move size={14} />
          </span>
        </div>
        {!gesture && (
          <div
            ref={tbRef}
            className="se-ui sticker-toolbar se-toolbar sel-toolbar"
            style={{ left: tbLeft, top: tbTop, maxWidth: size.width - 8 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button aria-label="고른 필기 잘라내기" title="잘라내기" onClick={props.onCut}>
              <Scissors size={17} />
            </button>
            <button aria-label="고른 필기 복사" title="복사" onClick={props.onCopy}>
              <Copy size={17} />
            </button>
            <button aria-label="고른 필기 복제" title="복제" onClick={props.onDuplicate}>
              <CopyPlus size={17} />
            </button>
            <button aria-label="고른 필기 지우기" title="지우기" onClick={props.onDelete}>
              <Trash2 size={17} />
            </button>
            <button
              aria-label="색·굵기"
              title="색·굵기"
              aria-expanded={panel === "style"}
              className={panel === "style" ? "on" : undefined}
              onClick={() => setPanel((v) => (v === "style" ? null : "style"))}
            >
              <Palette size={17} />
            </button>
            <button
              aria-label="순서"
              title="순서"
              aria-expanded={panel === "order"}
              className={panel === "order" ? "on" : undefined}
              onClick={() => setPanel((v) => (v === "order" ? null : "order"))}
            >
              <Layers size={17} />
            </button>
            <button className="primary" aria-label="고르기 끝" title="완료" onClick={props.onDone}>
              <Check size={17} />
            </button>
            {panel === "style" && (
              <div className="se-heads sel-style" role="group" aria-label="색·굵기 바꾸기">
                {props.colors.palette.map((c) => (
                  <button
                    key={c}
                    className={`sel-swatch${props.colors.current === c ? " on" : ""}`}
                    aria-label={`색 ${c}`}
                    aria-pressed={props.colors.current === c}
                    title={c}
                    onClick={() => props.onRecolor(c)}
                  >
                    <span style={{ background: c }} />
                  </button>
                ))}
                <span className="st-sep" />
                <button aria-label="가늘게" title="가늘게" onClick={() => props.onRewidth(0.8)}>
                  <Minus size={16} />
                </button>
                <button aria-label="굵게" title="굵게" onClick={() => props.onRewidth(1.25)}>
                  <Plus size={16} />
                </button>
              </div>
            )}
            {panel === "order" && (
              <div className="se-heads sel-order" role="group" aria-label="순서 바꾸기">
                <button aria-label="맨 앞으로" onClick={() => props.onOrder("front")}>
                  <BringToFront size={16} />
                  맨 앞으로
                </button>
                <button aria-label="맨 뒤로" onClick={() => props.onOrder("back")}>
                  <SendToBack size={16} />
                  맨 뒤로
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
