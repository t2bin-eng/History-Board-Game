import { ArrowUpDown, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { strokeToSvgPath, type PageSize } from "../ink/geometry";
import { HIGHLIGHT_LAYER_STYLE, isHighlighter, strokeColor, strokeOpacity } from "../ink/inkPaint";
import { clampSpace, spaceLimits } from "../ink/spacing";
import type { Stroke } from "../ink/types";

interface Props {
  /** 가로줄 자리 (페이지 px, 화면에 보이는 좌표) */
  y: number;
  size: PageSize;
  /** 줄 아래에서 시작해 옮겨질 획 (화면에 보이는 좌표) */
  moving: Stroke[];
  /** 끄는 중: true면 옮겨질 획을 캔버스에서 빼고 여기서 옮긴 모양을 보여 준다 */
  onLive: (dragging: boolean) => void;
  /** 손을 뗌: 이만큼(페이지 px, +는 아래로) 옮겨 저장 (실행 취소 한 단계) */
  onCommit: (dy: number) => void;
  onDone: () => void;
}

// 여백 넣기 (v0.46, SPEC 6장 "여백 넣기"): 가로줄의 손잡이를 아래로 끌면 줄 아래 필기가 밀려 사이가 벌어지고, 위로 끌면 좁혀진다.
export function SpaceEditor({ y, size, moving, onLive, onCommit, onDone }: Props) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ p0: number; dy: number } | null>(null);
  const dyRef = useRef(0);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  useEffect(() => () => onLiveRef.current(false), []);
  const limits = useMemo(() => spaceLimits(moving, y, size), [moving, y, size]);
  const paths = useMemo(() => moving.map((s) => ({ id: s.id, hl: isHighlighter(s), d: strokeToSvgPath(s, size), color: strokeColor(s), opacity: strokeOpacity(s) })), [moving, size]);

  const toPage = (e: ReactPointerEvent) => {
    const root = (e.currentTarget as HTMLElement).closest(".space-edit")!;
    const r = root.getBoundingClientRect();
    return ((e.clientY - r.top) * size.height) / Math.max(1, r.height);
  };
  const start = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button > 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
    drag.current = { p0: toPage(e), dy: 0 };
    dyRef.current = 0;
    setDragging(true);
    onLive(true);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const next = clampSpace(toPage(e) - d.p0, limits);
    dyRef.current = next;
    setDy(next);
  };
  const end = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    const moved = dyRef.current;
    dyRef.current = 0;
    setDy(0);
    setDragging(false);
    if (Math.abs(moved) >= 1 && e.type !== "pointercancel") onCommit(moved);
    else onLive(false);
  };
  const grab = { onPointerDown: start, onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  const preview = (hl: boolean) => (
    <svg className="shape-draft" width={size.width} height={size.height} style={hl ? HIGHLIGHT_LAYER_STYLE : undefined} aria-hidden="true">
      <g transform={`translate(0 ${dy.toFixed(2)})`}>
        {paths
          .filter((p) => p.hl === hl)
          .map((p) => (
            <path key={p.id} d={p.d} fill={p.color} fillOpacity={p.opacity} />
          ))}
      </g>
    </svg>
  );

  const band = dy > 0 ? { top: y, height: dy } : null;
  const handleTop = y + Math.max(0, dy);
  const barTop = y + 14 + Math.max(0, dy) + 30 > size.height ? Math.max(4, y - 50) : y + Math.max(0, dy) + 14;
  return (
    <>
      {dragging && paths.some((p) => p.hl) && preview(true)}
      {dragging && preview(false)}
      <div className="shape-edit space-edit" aria-label="여백 넣기">
        {band && <div className="space-band" style={{ top: band.top, height: band.height }} />}
        <div className="se-ui space-line" style={{ top: y }} aria-label="여백 넣기 줄" {...grab} />
        <span
          className="se-ui space-handle"
          style={{ top: handleTop, left: size.width - 40 }}
          role="slider"
          aria-label="끌어서 여백 넣기"
          aria-valuenow={Math.round(dy)}
          {...grab}
        >
          <ArrowUpDown size={16} />
        </span>
        {!dragging && (
          <div className="se-ui sticker-toolbar space-bar" style={{ top: barTop, left: Math.max(4, size.width - 300) }} onPointerDown={(e) => e.stopPropagation()}>
            <span className="space-hint">{moving.length ? "끌어 내리면 여백 · 올리면 좁힘" : "줄 아래에 필기가 없습니다"}</span>
            <button className="primary" aria-label="여백 넣기 끝" title="완료" onClick={onDone}>
              <Check size={17} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
