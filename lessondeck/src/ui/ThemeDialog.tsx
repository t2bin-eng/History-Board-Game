import { Check, Palette } from "lucide-react";
import { setTheme, THEMES, useTheme } from "../lib/theme";
import { showToast } from "../lib/platform";
import { art } from "./art";
import { Dialog } from "./FolderDialogs";

// 테마 고르기 (v0.49, SPEC 6장 "테마"): 누르면 바로 바뀐다 (이 기기에 기억, 문서와 상관없음)

/** 카드에 보일 그 테마 그림 세 가지 */
const SAMPLES = ["home-actions/pdf-new", "subjects/korean-history", "editor-tools/fountain-pen"];

export function ThemeDialog({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  return (
    <Dialog title="테마" icon={<Palette size={20} />} className="theme-dialog" onClose={onClose}>
      <div className="theme-options" role="radiogroup" aria-label="테마">
        {THEMES.map((t) => {
          const on = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`테마 ${t.name}`}
              className={`theme-option${on ? " on" : ""}`}
              data-theme-card={t.id}
              onClick={() => {
                if (on) return;
                setTheme(t.id);
                showToast(`테마: ${t.name}`);
              }}
            >
              <span className="theme-preview" style={{ background: t.swatches[0] }}>
                <img className="theme-cover" src={art(t.preview, t.id)} alt="" draggable={false} />
                <span className="theme-samples">
                  {SAMPLES.map((s) => (
                    <img key={s} src={art(s, t.id)} alt="" draggable={false} />
                  ))}
                </span>
              </span>
              <span className="theme-name">
                {on && <Check size={15} />}
                {t.name}
              </span>
              <span className="theme-desc">{t.desc}</span>
              <span className="theme-swatches" aria-hidden="true">
                {t.swatches.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="cover-note">테마는 이 기기에만 적용됩니다. 문서 표지의 자동 그림도 테마를 따라 바뀌고, 직접 고른 표지 그림은 그대로입니다.</p>
    </Dialog>
  );
}
