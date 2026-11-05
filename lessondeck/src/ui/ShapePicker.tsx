import { Wand2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { shapeOutlinePath, shapePathsPx, SHAPE_KINDS, type ShapeTool } from "../ink/shapes";
import type { ShapeKind } from "../ink/types";

interface Props {
  anchor: { left: number; top: number };
  /** 지금 도형 모드 (없으면 꺼짐) */
  current: ShapeTool | null;
  onPick: (kind: ShapeTool) => void;
  onOff: () => void;
  onClose: () => void;
}

const ICON = 30;
const ICON_PAGE = { width: ICON, height: ICON };

/** 고르기 단추의 작은 그림 */
function icon(kind: Exclude<ShapeKind, "polygon">): string {
  const line = kind === "line" || kind === "arrow" || kind === "arrow2";
  const w = line ? 24 / ICON : 22 / ICON;
  const h = line ? 0 : kind === "rect" || kind === "roundrect" ? 16 / ICON : 22 / ICON;
  const spec = { kind, cx: 0.5, cy: 0.5, w, h, rot: line ? -35 : 0 };
  return shapeOutlinePath(shapePathsPx(spec, ICON_PAGE, 2), 2);
}

// 도형 모드 고르기: 도형을 고르면(또는 자동) 도형 모드가 켜지고, 펜을 대는 곳에서부터 끌어 그린다
export function ShapePicker({ anchor, current, onPick, onOff, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="tool-settings shape-picker" style={{ left: anchor.left, top: anchor.top }} role="dialog" aria-label="도형 모드">
      <div className="ts-title">도형 모드 · 고른 뒤 펜을 대고 끌어서 그리기</div>
      <button className={`shape-auto${current === "auto" ? " on" : ""}`} aria-pressed={current === "auto"} onClick={() => onPick("auto")}>
        <Wand2 size={20} />
        <span>
          <strong>자동</strong> 그린 획을 뗄 때 알아본 도형으로
        </span>
      </button>
      <div className="shape-grid">
        {SHAPE_KINDS.map(({ kind, label }) => (
          <button key={kind} className={current === kind ? "on" : undefined} aria-label={label} aria-pressed={current === kind} title={label} onClick={() => onPick(kind)}>
            <svg width={ICON} height={ICON} aria-hidden="true">
              <path d={icon(kind)} fill="currentColor" />
            </svg>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {current && (
        <button className="shape-off" onClick={onOff}>
          <X size={16} /> 도형 모드 끄기 (펜으로)
        </button>
      )}
    </div>
  );
}
