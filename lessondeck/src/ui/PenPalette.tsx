import { Blinds, ChevronDown, ChevronUp, EyeOff, GripHorizontal } from "lucide-react";
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
  /** 레이저 펜 (v0.33): 그은 자국이 잠깐 뒤 사라짐 */
  laserActive?: boolean;
  onLaser?: () => void;
  /** 베일 그리기 (v0.33부터 도구 막대 대신 펜 바). 없으면(페이지 없음) 누를 수 없음 */
  veilActive?: boolean;
  onVeil?: () => void;
}

// 화면 왼쪽에 떠 있는 즐겨찾는 펜 목록. 위쪽 손잡이를 잡고 끌어 옮기고, 누르면 접는다.
export function PenPalette({ presets, activeId, onSelect, onOpenSettings, onHide, laserActive, onLaser, veilActive, onVeil }: Props) {
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
            aria-label={`${p.tool === "highlighter" ? (p.straight ? "직선 형광펜" : "형광펜") : p.fixedWidth ? "고른 굵기 펜" : "펜"} ${p.color}`}
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
      {!collapsed && onLaser && (
        <>
          <div className="pen-palette-sep" aria-hidden="true" />
          <button
            className={`pen-slot pen-special${laserActive ? " active" : ""}`}
            aria-label="레이저 펜"
            aria-pressed={!!laserActive}
            title="레이저 펜 — 그은 자국이 잠깐 뒤 사라짐 (저장 안 함)"
            onClick={onLaser}
          >
            <LaserGlyph />
            <span className="pen-size">레이저</span>
          </button>
          <button
            className={`pen-slot pen-special${veilActive ? " active" : ""}`}
            aria-label="베일 (가리기)"
            aria-pressed={!!veilActive}
            title="베일 — 끌어서 가릴 곳을 덮기 (강의 모드에서 누르면 걷힘)"
            disabled={!onVeil}
            onClick={onVeil}
          >
            <span className="pen-special-icon">
              <Blinds size={22} />
            </span>
            <span className="pen-size">베일</span>
          </button>
        </>
      )}
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
      {/* 직선 형광펜 (v0.33): 색 띠 위 곧은 줄 */}
      {hl && preset.straight && <rect x="1" y="12" width="20" height="2" fill="rgba(255,255,255,0.85)" />}
      {/* 몸통 */}
      <rect x={hl ? 22 : 14} y="5" width={hl ? 26 : 34} height="16" fill={`url(#barrel-${preset.id})`} />
      {/* 원뿔 */}
      <path d={hl ? "M48 5 L64 9 L64 17 L48 21 Z" : "M48 5 L68 11.5 L68 14.5 L48 21 Z"} fill={`url(#barrel-${preset.id})`} />
      {/* 펜촉 */}
      {hl ? (
        <path d="M64 9 L72 10 L72 16 L64 17 Z" fill={preset.color} />
      ) : preset.fixedWidth ? (
        // 고른 굵기 펜 (v0.33): 볼펜처럼 둥근 끝
        <>
          <path d="M68 11.5 L72 12 L72 14 L68 14.5 Z" fill={`url(#barrel-${preset.id})`} />
          <circle cx="73.5" cy="13" r="2.2" fill={preset.color} />
        </>
      ) : (
        <path d="M68 11.5 L76 13 L68 14.5 Z" fill={preset.color} />
      )}
    </svg>
  );
}

/** 레이저 펜 그림: 빨간 빛을 내는 점 */
function LaserGlyph() {
  return (
    <svg width="76" height="26" viewBox="0 0 76 26" aria-hidden="true">
      <defs>
        <radialGradient id="laser-glow">
          <stop offset="0" stopColor="#ffe9e9" />
          <stop offset="0.35" stopColor="#ff2d2d" />
          <stop offset="1" stopColor="rgba(255,45,45,0)" />
        </radialGradient>
      </defs>
      <rect x="6" y="9" width="40" height="8" rx="4" fill="#5a5a5a" />
      <rect x="40" y="10" width="8" height="6" rx="1" fill="#8a8a8a" />
      <path d="M48 13 L66 13" stroke="rgba(255,60,60,0.55)" strokeWidth="2" />
      <circle cx="68" cy="13" r="8" fill="url(#laser-glow)" />
    </svg>
  );
}
