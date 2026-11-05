import { Check, CopyPlus, Move, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { snapAngle } from "../doc/stickers";
import { snapLineEnd } from "../ink/beautify";
import type { PageSize } from "../ink/geometry";
import { isLineShape, lineEnds, lineSpec, shapeFrame, shapeStrokePath, withShape } from "../ink/shapes";
import type { ShapeSpec, Stroke } from "../ink/types";
import { HIGHLIGHTER_ALPHA } from "../ink/palette";

type ShapeStroke = Stroke & { shape: ShapeSpec };
type Pt = [number, number];
type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

type Gesture =
  | { kind: "move"; p0: Pt; s0: ShapeSpec }
  | { kind: "end"; end: 0 | 1; s0: ShapeSpec }
  | { kind: "resize"; handle: Handle; s0: ShapeSpec }
  | { kind: "rotate"; s0: ShapeSpec };

interface Props {
  stroke: ShapeStroke;
  size: PageSize;
  /** 끄는 중의 모양 (원래 획 대신 이것을 보여 준다). 끝나면 null */
  onLive: (s: Stroke | null) => void;
  /** 끌기가 끝남: 바뀐 획 저장 (실행 취소 한 단계) */
  onChange: (s: Stroke) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDone: () => void;
}

/** 가장 작은 크기 (페이지 px) */
const MIN_PX = 10;

// 고른 도형 고치기: 손잡이만 누름을 받고 나머지는 지나가게 해서, 도형을 고른 채로도 바로 이어 쓸 수 있다.
// 선·화살표는 두 끝, 그 밖은 모서리(비율 유지)·변(한쪽으로 늘이기)·위 손잡이(돌리기, 15° 근처 붙음)·가운데(옮기기)
export function ShapeEditor({ stroke, size, onLive, onChange, onDuplicate, onDelete, onDone }: Props) {
  const [draft, setDraft] = useState<ShapeSpec | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const spec = draft ?? stroke.shape;
  const f = shapeFrame(spec, size);
  const line = isLineShape(spec.kind);

  // 끄는 중의 모양은 끄는 자리에서 바로 알린다 (렌더마다 알리면 부모가 다시 그리며 되풀이된다)
  const show = (next: ShapeSpec | null) => {
    setDraft(next);
    onLive(next ? withShape(stroke, next, size) : null);
  };
  useEffect(() => () => onLive(null), [onLive]);

  /** 화면 좌표 → 페이지 px (확대 중이어도 맞게) */
  const toPage = (e: ReactPointerEvent): Pt => {
    const root = (e.currentTarget as HTMLElement).closest(".shape-edit")!;
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
    setGesture({ ...g, ...(g.kind === "move" ? { p0: toPage(e) } : {}) } as Gesture);
  };

  const move = (e: ReactPointerEvent) => {
    if (!gesture) return;
    e.stopPropagation();
    const p = toPage(e);
    const s0 = gesture.s0;
    if (gesture.kind === "move") {
      show({ ...s0, cx: s0.cx + (p[0] - gesture.p0[0]) / size.width, cy: s0.cy + (p[1] - gesture.p0[1]) / size.height });
    } else if (gesture.kind === "end") {
      const ends = lineEnds(s0, size);
      const fixed = ends[1 - gesture.end];
      const e2 = snapLineEnd(fixed[0], fixed[1], p[0], p[1]);
      const moved: Pt = [e2.x, e2.y];
      if (Math.hypot(moved[0] - fixed[0], moved[1] - fixed[1]) < MIN_PX) return;
      const [a, b] = gesture.end === 1 ? [fixed, moved] : [moved, fixed];
      show(lineSpec(s0.kind, a, b, size));
    } else if (gesture.kind === "rotate") {
      const c = shapeFrame(s0, size);
      const deg = (Math.atan2(p[1] - c.cy, p[0] - c.cx) * 180) / Math.PI + 90;
      show({ ...s0, rot: snapAngle(deg) });
    } else {
      show(resize(s0, gesture.handle, p, size));
    }
  };

  const end = (e: ReactPointerEvent) => {
    if (!gesture) return;
    e.stopPropagation();
    setGesture(null);
    if (draft && e.type !== "pointercancel") onChange(withShape(stroke, draft, size));
    show(null);
  };

  const grab = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  // 도구 막대: 도형 위 (자리가 없으면 아래)
  const ey = line ? (Math.abs(Math.sin(f.rad)) * f.w) / 2 : (Math.abs(Math.sin(f.rad)) * f.w + Math.abs(Math.cos(f.rad)) * f.h) / 2;
  const above = f.cy - ey - (line ? 20 : 48) - 46;
  const tbTop = above >= 4 ? above : Math.min(size.height - 50, f.cy + ey + 18);
  const tbLeft = Math.min(Math.max(4, f.cx - 66), Math.max(4, size.width - 136));

  return (
    <div className="shape-edit" aria-label="도형 고치기">
      {draft && (
        <svg className="shape-draft" width={size.width} height={size.height} aria-hidden="true">
          <path
            d={shapeStrokePath({ ...stroke, shape: draft }, size)}
            fill={stroke.color}
            opacity={stroke.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1}
          />
        </svg>
      )}
      {line ? (
        lineEnds(spec, size).map(([x, y], i) => (
          <span
            key={i}
            className="se-ui se-handle se-end"
            style={{ left: x, top: y }}
            aria-label={i ? "끝점" : "시작점"}
            onPointerDown={(e) => start(e, { kind: "end", end: i as 0 | 1, s0: stroke.shape })}
            {...grab}
          />
        ))
      ) : (
        <div className="se-frame" style={{ left: f.cx - f.w / 2, top: f.cy - f.h / 2, width: f.w, height: f.h, transform: `rotate(${spec.rot}deg)` }}>
          {(["nw", "ne", "sw", "se", "n", "s", "e", "w"] as const).map((h) => (
            <span
              key={h}
              className={`se-ui se-handle ${h}${h.length === 1 ? " side" : ""}`}
              onPointerDown={(e) => start(e, { kind: "resize", handle: h, s0: stroke.shape })}
              {...grab}
            />
          ))}
          <span className="se-stem" />
          <span
            className="se-ui se-rotate"
            aria-label="돌리기"
            onPointerDown={(e) => start(e, { kind: "rotate", s0: stroke.shape })}
            {...grab}
          >
            <RotateCw size={14} />
          </span>
        </div>
      )}
      <span
        className="se-ui se-move"
        style={{ left: f.cx, top: f.cy }}
        aria-label="옮기기"
        onPointerDown={(e) => start(e, { kind: "move", p0: [0, 0], s0: stroke.shape })}
        {...grab}
      >
        <Move size={15} />
      </span>
      {!gesture && (
        <div className="se-ui sticker-toolbar se-toolbar" style={{ left: tbLeft, top: tbTop }} onPointerDown={(e) => e.stopPropagation()}>
          <button aria-label="도형 복제" title="복제" onClick={onDuplicate}>
            <CopyPlus size={17} />
          </button>
          <button aria-label="도형 지우기" title="지우기" onClick={onDelete}>
            <Trash2 size={17} />
          </button>
          <button className="primary" aria-label="도형 고치기 끝" title="완료" onClick={onDone}>
            <Check size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

/** 모서리(비율 유지, 맞은편 모서리 고정)·변(그 방향만, 맞은편 변 고정)으로 크기 바꾸기 */
function resize(s0: ShapeSpec, handle: Handle, p: Pt, size: PageSize): ShapeSpec {
  const f = shapeFrame(s0, size);
  const cos = Math.cos(f.rad);
  const sin = Math.sin(f.rad);
  // 도형 안쪽 좌표 (돌리기 전, 중심 0)
  const dx = p[0] - f.cx;
  const dy = p[1] - f.cy;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  let w = f.w;
  let h = f.h;
  let ox = 0;
  let oy = 0;
  if (sx && sy) {
    // 맞은편 모서리 o에서 이 모서리까지(d) 위로 비춘 비율만큼
    const o: Pt = [(-sx * f.w) / 2, (-sy * f.h) / 2];
    const d: Pt = [sx * f.w, sy * f.h];
    const k = Math.max(MIN_PX / Math.max(1, Math.min(f.w, f.h)), ((lx - o[0]) * d[0] + (ly - o[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2));
    w = f.w * k;
    h = f.h * k;
    ox = o[0] + (d[0] * k) / 2;
    oy = o[1] + (d[1] * k) / 2;
  } else if (sx) {
    const fixed = (-sx * f.w) / 2;
    w = Math.max(MIN_PX, (lx - fixed) * sx);
    ox = fixed + (sx * w) / 2;
  } else {
    const fixed = (-sy * f.h) / 2;
    h = Math.max(MIN_PX, (ly - fixed) * sy);
    oy = fixed + (sy * h) / 2;
  }
  return {
    ...s0,
    cx: (f.cx + ox * cos - oy * sin) / size.width,
    cy: (f.cy + ox * sin + oy * cos) / size.height,
    w: w / size.width,
    h: h / size.width,
  };
}
