import { art } from "./art";
import { useTheme } from "../lib/theme";
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
            aria-label={`${p.tool === "highlighter" ? (p.straight ? "직선 형광펜" : "형광펜") : penName(p)} ${p.color}${p.tool === "pen" && p.opacity && p.opacity < 1 ? ` ${Math.round(p.opacity * 100)}%` : ""}`}
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

/** 펜 이름 (v0.41: 펜 종류) */
function penName(p: PenPreset): string {
  const kind = p.nib === "fountain" ? "만년필" : p.nib === "calligraphy" ? "캘리그래피 펜" : p.nib === "pencil" ? "연필" : "펜";
  return p.fixedWidth ? `고른 굵기 ${kind}` : kind;
}

function PenGlyph({ preset }: { preset: PenPreset }) {
  const hl = preset.tool === "highlighter";
  const nib = hl ? undefined : preset.nib;
  // 불투명도 (v0.41): 색 띠·펜촉을 그만큼 비치게
  const alpha = hl ? 1 : Math.max(0.2, Math.min(1, preset.opacity ?? 1));
  // v0.47 디자인: 먹색 윤곽선 + 크림색 몸통, 뚜껑 띠와 펜촉은 그 펜 색 (src/assets 판서 도구 그림과 같은 결)
  // 윤곽·몸통 색은 테마 토큰 (v0.49)
  const ink = "var(--ink)";
  const body = "var(--pen-body)";
  const capW = hl ? 19 : 12;
  const barrelX = 1.5 + capW;
  const barrelW = hl ? 26 : 32;
  const coneX = barrelX + barrelW;
  return (
    <svg width="76" height="26" viewBox="0 0 76 26" aria-hidden="true">
      <g style={{ stroke: ink }} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        {/* 뚜껑 띠: 펜 색 */}
        <rect x="1.5" y="6.5" width={capW} height="13" rx="3" fill={preset.color} fillOpacity={alpha} />
        {/* 몸통 */}
        <rect x={barrelX} y="6.5" width={barrelW} height="13" rx="1.5" style={{ fill: body }} />
        {/* 직선 형광펜 (v0.33): 몸통에 곧은 줄 */}
        {hl && preset.straight && <path d={`M${barrelX + 4} 13 H${barrelX + barrelW - 4}`} stroke={preset.color} strokeWidth="2.2" />}
        {!hl && <path d={`M${barrelX + barrelW - 9} 6.5 V19.5`} strokeWidth="1.1" />}
        {/* 원뿔 (연필은 깎은 나무) */}
        <path
          d={
            hl || nib === "calligraphy" || nib === "fountain"
              ? `M${coneX} 6.5 L${coneX + 15} 9.5 L${coneX + 15} 16.5 L${coneX} 19.5 Z`
              : nib === "pencil"
                ? `M${coneX} 6.5 L${coneX + 18} 11.2 L${coneX + 18} 14.8 L${coneX} 19.5 Z`
                : `M${coneX} 6.5 L${coneX + 19} 11.6 L${coneX + 19} 14.4 L${coneX} 19.5 Z`
          }
          style={{ fill: nib === "pencil" ? "#F3D6A8" : body }}
        />
        {/* 펜촉: 펜 색 */}
        {hl ? (
          <path d={`M${coneX + 15} 9.5 L${coneX + 22} 10.5 L${coneX + 22} 16.5 L${coneX + 15} 16.5 Z`} fill={preset.color} />
        ) : nib === "fountain" ? (
          // 만년필 (v0.41): 뾰족한 펜촉과 가운데 홈
          <>
            <path d={`M${coneX + 15} 9.5 L${coneX + 26} 13 L${coneX + 15} 16.5 Q${coneX + 13} 13 ${coneX + 15} 9.5 Z`} fill={preset.color} fillOpacity={alpha} />
            <path d={`M${coneX + 16.5} 13 L${coneX + 23} 13`} strokeWidth="0.9" />
          </>
        ) : nib === "calligraphy" ? (
          // 캘리그래피 펜 (v0.41): 비스듬히 납작한 끝
          <path d={`M${coneX + 15} 9.5 L${coneX + 21} 7.5 L${coneX + 24} 18.5 L${coneX + 15} 16.5 Z`} fill={preset.color} fillOpacity={alpha} />
        ) : nib === "pencil" ? (
          // 연필 (v0.41): 깎은 나무 끝의 심
          <path d={`M${coneX + 18} 11.2 L${coneX + 26} 13 L${coneX + 18} 14.8 Z`} fill={preset.color} fillOpacity={alpha} />
        ) : preset.fixedWidth ? (
          // 고른 굵기 펜 (v0.33): 볼펜처럼 둥근 끝
          <circle cx={coneX + 21.5} cy="13" r="2.3" fill={preset.color} fillOpacity={alpha} />
        ) : (
          <path d={`M${coneX + 19} 11.6 L${coneX + 26} 13 L${coneX + 19} 14.4 Z`} fill={preset.color} fillOpacity={alpha} />
        )}
      </g>
    </svg>
  );
}

/** 레이저 펜 그림 (v0.47 디자인 그림) */
function LaserGlyph() {
  const theme = useTheme();
  return <img className="pen-art" src={art("editor-tools/laser-pointer", theme)} alt="" draggable={false} />;
}
