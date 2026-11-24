import { Check, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { RICH_COLORS, RICH_HIGHLIGHTERS } from "../doc/swatches";
import { ERASER_MODES, ERASER_TARGETS, type EraserMode, type EraserTarget } from "../ink/eraser";
import { PEN_BUTTON_ACTIONS, type PenButtonAction } from "../ink/penButton";
import { ERASER_LEVELS, HIGHLIGHTER_ALPHA, WIDTH_LEVELS } from "../ink/palette";
import type { PenNib, PenPreset } from "../ink/types";

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
      /** S펜 버튼을 누른 채 쓸 때 (v0.33, 기기 설정) */
      penButton?: { action: PenButtonAction; onChange: (a: PenButtonAction) => void };
      onClose: () => void;
    }
  | {
      kind: "eraser";
      anchor: Anchor;
      eraserSize: number;
      onEraserSize: (size: number) => void;
      /** 지울 것 (v0.32): 전부 · 펜만 · 형광펜만 */
      eraserTarget: EraserTarget;
      onEraserTarget: (target: EraserTarget) => void;
      /** 지우는 방법 (v0.40): 획 통째로 · 문지른 부분만 */
      eraserMode: EraserMode;
      onEraserMode: (mode: EraserMode) => void;
      onClearPage: () => void;
      onClose: () => void;
    };

const LEVEL_NAMES = ["가늘게", "보통", "굵게"];

/** 펜 종류 (v0.41): 볼펜은 nib 없음 */
const NIB_CHOICES: { id: PenNib | undefined; label: string }[] = [
  { id: undefined, label: "볼펜" },
  { id: "fountain", label: "만년필" },
  { id: "calligraphy", label: "캘리그래피" },
  { id: "pencil", label: "연필" },
];
/** 불투명도 (v0.41): 1이면 opacity 없음 */
const OPACITY_CHOICES = [1, 0.8, 0.6, 0.4];

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

  // 화면 안에 들어오게 (v0.41: 펜 종류·불투명도로 길어짐): 아래로 넘치면 위로 올리고, 그래도 길면 스크롤
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const room = window.innerHeight - margin * 2;
    el.style.maxHeight = `${room}px`;
    const h = Math.min(el.scrollHeight, room);
    const top = Math.max(margin, Math.min(props.anchor.top, window.innerHeight - margin - h));
    el.style.top = `${top}px`;
  });

  return (
    <div ref={ref} className="tool-settings" style={{ left: props.anchor.left, top: props.anchor.top }} role="dialog">
      {props.kind === "preset" ? (
        <>
          <div className="ts-title">
            {props.preset.tool === "highlighter" ? "형광펜" : `펜 (${NIB_CHOICES.find((n) => n.id === props.preset.nib)?.label ?? "볼펜"})`}
          </div>
          <div className="ts-row ts-colors" role="radiogroup" aria-label="색상">
            {(props.preset.tool === "highlighter" ? RICH_HIGHLIGHTERS : RICH_COLORS).map((c) => (
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
              className={`ts-swatch ts-custom${(props.preset.tool === "highlighter" ? RICH_HIGHLIGHTERS : RICH_COLORS).includes(props.preset.color.toLowerCase()) ? "" : " active"}`}
              title="다른 색"
              style={
                (props.preset.tool === "highlighter" ? RICH_HIGHLIGHTERS : RICH_COLORS).includes(props.preset.color.toLowerCase())
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
                    opacity: props.preset.tool === "highlighter" ? HIGHLIGHTER_ALPHA : (props.preset.opacity ?? 1),
                  }}
                />
                <span className="ts-width-label">{LEVEL_NAMES[i]}</span>
              </button>
            ))}
          </div>
          {props.preset.tool === "pen" && (
            <>
              <div className="ts-row ts-targets" role="radiogroup" aria-label="펜 종류">
                {NIB_CHOICES.map((n) => (
                  <button
                    key={n.label}
                    role="radio"
                    aria-checked={props.preset.nib === n.id}
                    className={`ts-target${props.preset.nib === n.id ? " active" : ""}`}
                    onClick={() => props.onChange({ nib: n.id })}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
              <div className="ts-row ts-targets" role="radiogroup" aria-label="불투명도">
                {OPACITY_CHOICES.map((o) => {
                  const on = Math.abs((props.preset.opacity ?? 1) - o) < 0.05;
                  return (
                    <button
                      key={o}
                      role="radio"
                      aria-checked={on}
                      className={`ts-target${on ? " active" : ""}`}
                      onClick={() => props.onChange({ opacity: o < 1 ? o : undefined })}
                    >
                      {Math.round(o * 100)}%
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {/* 이 펜의 설정 (v0.33): 형광펜 곧게 긋기 · 펜 필압 */}
          <div className="ts-row ts-toggles" aria-label="이 펜">
            {props.preset.tool === "highlighter" ? (
              <Toggle on={!!props.preset.straight} onChange={(on) => props.onChange({ straight: on })} label="곧게 긋기" hint="늘 곧은 밑줄" />
            ) : (
              <Toggle on={!props.preset.fixedWidth} onChange={(on) => props.onChange({ fixedWidth: !on })} label="필압" hint={props.preset.fixedWidth ? "고른 굵기" : "누르는 힘으로 굵기"} />
            )}
          </div>
          <div className="ts-row ts-toggles" aria-label="보정">
            <Toggle on={props.correction.straighten} onChange={props.correction.onStraighten} label="도형 보정" hint="멈추면 도형·직선" />
            {props.preset.tool === "pen" && (
              <Toggle on={props.correction.beautify} onChange={props.correction.onBeautify} label="필기 보정" hint="글씨를 반듯하게" />
            )}
          </div>
          {props.penButton && (
            <>
              <div className="ts-label">S펜 버튼을 누른 채 쓰면</div>
              <div className="ts-row ts-targets" role="radiogroup" aria-label="S펜 버튼">
                {PEN_BUTTON_ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={props.penButton!.action === a.id}
                    className={`ts-target${props.penButton!.action === a.id ? " active" : ""}`}
                    onClick={() => props.penButton!.onChange(a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="ts-title">지우개 ({props.eraserMode === "area" ? "문지른 부분만" : "획 통째로"})</div>
          <div className="ts-row ts-targets" role="radiogroup" aria-label="지우는 방법">
            {ERASER_MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={props.eraserMode === m.id}
                className={`ts-target${props.eraserMode === m.id ? " active" : ""}`}
                onClick={() => props.onEraserMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
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
          <div className="ts-row ts-targets" role="radiogroup" aria-label="지울 것">
            {ERASER_TARGETS.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={props.eraserTarget === t.id}
                className={`ts-target${props.eraserTarget === t.id ? " active" : ""}`}
                onClick={() => props.onEraserTarget(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="ts-danger" onClick={props.onClearPage}>
            <Trash2 size={16} /> {ERASER_TARGETS.find((t) => t.id === props.eraserTarget)?.clearLabel ?? "필기 지우기"}
          </button>
        </>
      )}
    </div>
  );
}
