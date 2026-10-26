import { ChevronDown, ChevronUp, EyeOff, GripHorizontal } from "lucide-react";
import { useState } from "react";
import type { PenPreset } from "../ink/types";
import { useFloatingDrag } from "../view/useFloatingDrag";

interface Props {
  presets: PenPreset[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** 이미 선택된 펜을 한 번 더 누르면 색·굵기 설정을 연다 (스타노트와 같은 동작) */
  onOpenSettings: (id: string, anchor: DOMRect) => void;
  /** 펜 바 감추기 (도구 막대·강의 모드 바의 펜 바 버튼으로 다시 보인다) */
  onHide: () => void;
}

// 화면 왼쪽에 떠 있는 즐겨찾는 펜 목록. 위쪽 손잡이를 잡고 끌어 옮기고, 누르면 접는다.
export function PenPalette({ presets, activeId, onSelect, onOpenSettings, onHide }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const float = useFloatingDrag<HTMLDivElement>({
    storageKey: "lessondeck.penPalettePos",
    canStart: (t) => !!t.closest(".pen-palette-handle"),
  });

  return (
    <div
      ref={float.ref}
      className={`pen-palette${collapsed ? " collapsed" : ""}${float.dragging ? " dragging" : ""}`}
      style={float.style}
      data-no-gesture
      {...float.handlers}
    >
      <button
        className="pen-palette-handle"
        aria-label={collapsed ? "펜 목록 펼치기" : "펜 목록 접기"}
        title="끌어서 옮기기 · 누르면 접기/펼치기"
        onClick={() => setCollapsed((c) => !c)}
      >
        <GripHorizontal size={20} />
      </button>
      {!collapsed &&
        presets.map((p) => (
          <button
            key={p.id}
            className={`pen-slot${p.id === activeId ? " active" : ""}`}
            aria-label={`${p.tool === "highlighter" ? "형광펜" : "펜"} ${p.color}`}
            aria-pressed={p.id === activeId}
            onClick={(e) => {
              if (p.id === activeId) onOpenSettings(p.id, e.currentTarget.getBoundingClientRect());
              else onSelect(p.id);
            }}
          >
            <PenGlyph preset={p} />
            <span className="pen-size">{p.width.toFixed(1)}</span>
          </button>
        ))}
      <div className="pen-palette-foot">
        <button className="pen-palette-toggle" aria-label="접기/펼치기" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button className="pen-palette-toggle" aria-label="펜 바 감추기" title="펜 바 감추기" onClick={onHide}>
          <EyeOff size={15} />
        </button>
      </div>
    </div>
  );
}

function PenGlyph({ preset }: { preset: PenPreset }) {
  const hl = preset.tool === "highlighter";
  return (
    <svg width="76" height="26" viewBox="0 0 76 26" aria-hidden="true">
      <defs>
        <linearGradient id={`barrel-${preset.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a9a9a" />
          <stop offset="0.5" stopColor="#6b6b6b" />
          <stop offset="1" stopColor="#4a4a4a" />
        </linearGradient>
      </defs>
      {/* 색 띠 */}
      <rect x="0" y="5" width={hl ? 22 : 14} height="16" fill={preset.color} />
      {/* 검정처럼 어두운 색도 팔레트 배경에서 보이도록 얇은 테두리 */}
      <rect x="0.5" y="5.5" width={hl ? 21 : 13} height="15" fill="none" stroke="rgba(255,255,255,0.22)" />
      {hl && <rect x="10" y="5" width="6" height="16" fill="rgba(0,0,0,0.25)" />}
      {/* 몸통 */}
      <rect x={hl ? 22 : 14} y="5" width={hl ? 26 : 34} height="16" fill={`url(#barrel-${preset.id})`} />
      {/* 원뿔 */}
      <path d={hl ? "M48 5 L64 9 L64 17 L48 21 Z" : "M48 5 L68 11.5 L68 14.5 L48 21 Z"} fill={`url(#barrel-${preset.id})`} />
      {/* 펜촉 */}
      {hl ? (
        <path d="M64 9 L72 10 L72 16 L64 17 Z" fill={preset.color} />
      ) : (
        <path d="M68 11.5 L76 13 L68 14.5 Z" fill={preset.color} />
      )}
    </svg>
  );
}
