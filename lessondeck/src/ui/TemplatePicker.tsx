import { useEffect, useRef } from "react";
import { TEMPLATES, templateUrl } from "../doc/templates";
import type { BlankBackground } from "../doc/types";

/** 템플릿 작은 그림: 흰 종이(세로 A4) 위 무늬 */
export function TemplateIcon({ background }: { background: BlankBackground }) {
  // 작은 그림: 간격을 넓히고 선을 굵게 (페이지 그대로면 30px 안에서 보이지 않음)
  const url = templateUrl(background, 0.75, { stroke: 14, spacing: 4 });
  return <span className="tpl-icon" style={url ? { backgroundImage: `url("${url}")` } : undefined} aria-hidden="true" />;
}

interface Props {
  anchor: { left: number; top: number };
  current: BlankBackground;
  onPick: (bg: BlankBackground) => void;
  onClose: () => void;
}

// 빈 페이지 바탕 바꾸기 (v0.45, SPEC 6장 "템플릿"): 백지 · 줄 · 모눈 · 점 · 코넬
export function TemplatePicker({ anchor, current, onPick, onClose }: Props) {
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
    <div ref={ref} className="tool-settings tpl-picker" style={{ left: anchor.left, top: anchor.top }} role="dialog" aria-label="바탕 고르기">
      <div className="ts-title">바탕 (이 페이지)</div>
      <div className="tpl-grid" role="radiogroup" aria-label="바탕">
        {TEMPLATES.map((t) => (
          <button key={t.id} role="radio" aria-checked={current === t.id} aria-label={t.label} className={current === t.id ? "on" : undefined} onClick={() => onPick(t.id)}>
            <TemplateIcon background={t.id} />
            <span>{t.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
