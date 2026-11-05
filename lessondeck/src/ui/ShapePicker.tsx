import { useEffect, useRef } from "react";
import { shapeOutlinePath, shapePathsPx, SHAPE_KINDS } from "../ink/shapes";
import type { ShapeKind } from "../ink/types";

interface Props {
  anchor: { left: number; top: number };
  onPick: (kind: Exclude<ShapeKind, "polygon">) => void;
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

// 도형 넣기: 고르면 페이지 가운데(길게 누른 메뉴면 그 자리)에 넣고 바로 크기·회전을 고칠 수 있게 고른다
export function ShapePicker({ anchor, onPick, onClose }: Props) {
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
    <div ref={ref} className="tool-settings shape-picker" style={{ left: anchor.left, top: anchor.top }} role="dialog" aria-label="도형 넣기">
      <div className="ts-title">도형 넣기 · 그리다 멈추면 저절로 도형</div>
      <div className="shape-grid">
        {SHAPE_KINDS.map(({ kind, label }) => (
          <button key={kind} aria-label={label} title={label} onClick={() => onPick(kind)}>
            <svg width={ICON} height={ICON} aria-hidden="true">
              <path d={icon(kind)} fill="currentColor" />
            </svg>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
