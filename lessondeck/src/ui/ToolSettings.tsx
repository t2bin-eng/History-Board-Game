import { Check, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { ERASER_LEVELS, HIGHLIGHTER_ALPHA, HIGHLIGHTER_COLORS, PEN_COLORS, WIDTH_LEVELS } from "../ink/palette";
import type { PenPreset } from "../ink/types";

interface Anchor {
  left: number;
  top: number;
}

type Props =
  | {
      kind: "preset";
      anchor: Anchor;
      preset: PenPreset;
      onChange: (patch: Partial<PenPreset>) => void;
      /** 도형 보정·필기 보정 켜고 끄기 (기기 설정) */
      correction: { straighten: boolean; beautify: boolean; onStraighten: (on: boolean) => void; onBeautify: (on: boolean) => void };
      onClose: () => void;
    }
  | {
      kind: "eraser";
      anchor: Anchor;
      eraserSize: number;
      onEraserSize: (size: number) => void;
      onClearPage: () => void;
      onClose: () => void;
    };

const LEVEL_NAMES = ["가늘게", "보통", "굵게"];

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (on: boolean) => void; label: string; hint: string }) {
  return (
    <button role="switch" aria-checked={on} className={`ts-toggle${on ? " on" : ""}`} title={hint} onClick={() => onChange(!on)}>
      <span className="ts-check">{on && <Check size={13} strokeWidth={3} />}</span>
      <span className="ts-toggle-text">
        {label}
        <small>{hint}</small>
      </span>
    </button>
  );
}

export function ToolSettings(props: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    // 이 팝오버를 연 바로 그 탭이 닫기로 처리되지 않도록 다음 틱에 등록한다
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown, true));
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [props.onClose]);

  return (
    <div ref={ref} className="tool-settings" style={{ left: props.anchor.left, top: props.anchor.top }} role="dialog">
      {props.kind === "preset" ? (
        <>
          <div className="ts-title">{props.preset.tool === "highlighter" ? "형광펜" : "펜"}</div>
          <div className="ts-row ts-colors" role="radiogroup" aria-label="색상">
            {(props.preset.tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={props.preset.color.toLowerCase() === c}
                aria-label={c}
                className={`ts-swatch${props.preset.color.toLowerCase() === c ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => props.onChange({ color: c })}
              />
            ))}
            {/* 다른 색: 기기의 색 고르기 창 (목록에 없는 색이면 그 색으로 보여 준다) */}
            <label
              className={`ts-swatch ts-custom${(props.preset.tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS).includes(props.preset.color.toLowerCase()) ? "" : " active"}`}
              title="다른 색"
              style={
                (props.preset.tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS).includes(props.preset.color.toLowerCase())
                  ? undefined
                  : { background: props.preset.color }
              }
            >
              <input type="color" aria-label="다른 색" value={props.preset.color} onChange={(e) => props.onChange({ color: e.target.value })} />
            </label>
          </div>
          <div className="ts-row" role="radiogroup" aria-label="굵기">
            {WIDTH_LEVELS[props.preset.tool].map((w, i) => (
              <button
                key={w}
                role="radio"
                aria-checked={props.preset.width === w}
                className={`ts-width${props.preset.width === w ? " active" : ""}`}
                onClick={() => props.onChange({ width: w })}
              >
                <span
                  className="ts-width-line"
                  style={{
                    height: props.preset.tool === "highlighter" ? 4 + i * 4 : 2 + i * 2,
                    background: props.preset.color,
                    opacity: props.preset.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1,
                  }}
                />
                <span className="ts-width-label">{LEVEL_NAMES[i]}</span>
              </button>
            ))}
          </div>
          <div className="ts-row ts-toggles" aria-label="보정">
            <Toggle on={props.correction.straighten} onChange={props.correction.onStraighten} label="도형 보정" hint="멈추면 도형·직선" />
            {props.preset.tool === "pen" && (
              <Toggle on={props.correction.beautify} onChange={props.correction.onBeautify} label="필기 보정" hint="글씨를 반듯하게" />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="ts-title">지우개 (획 단위)</div>
          <div className="ts-row" role="radiogroup" aria-label="지우개 크기">
            {ERASER_LEVELS.map((s, i) => (
              <button
                key={s}
                role="radio"
                aria-checked={props.eraserSize === s}
                className={`ts-width${props.eraserSize === s ? " active" : ""}`}
                onClick={() => props.onEraserSize(s)}
              >
                <span className="ts-eraser-dot" style={{ width: 8 + i * 8, height: 8 + i * 8 }} />
                <span className="ts-width-label">{LEVEL_NAMES[i]}</span>
              </button>
            ))}
          </div>
          <button className="ts-danger" onClick={props.onClearPage}>
            <Trash2 size={16} /> 필기 지우기
          </button>
        </>
      )}
    </div>
  );
}
