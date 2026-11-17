import { isLightColor, normalizeHex } from "../doc/swatches";

interface Props {
  colors: string[];
  /** 지금 색 (목록에 없으면 "다른 색" 칸이 그 색으로 켜짐) */
  value: string | undefined;
  onPick: (color: string) => void;
  /** 칸 이름 (화면 읽기·시험): 예 "글자색 #ff1e1e" */
  label: (color: string) => string;
  /** "다른 색" 칸 이름. 주면 기기의 색 고르기 창으로 아무 색이나 */
  custom?: string;
  /** 한 줄 칸 수 (기본 10) */
  columns?: number;
  /** 지금 값이 이 목록과 상관없는 것(자동·없음 등)이면 아무 칸도 켜지 않는다 */
  inactive?: boolean;
}

// 색 칸 모음 (v0.29): 글자·배경·테두리·화살표·스티커 테두리·쪽지·베일이 함께 쓴다
export function ColorGrid({ colors, value, onPick, label, custom, columns = 10, inactive }: Props) {
  const now = inactive ? null : normalizeHex(value);
  const known = !!now && colors.includes(now);
  return (
    <div className="color-grid" role="radiogroup" style={{ gridTemplateColumns: `repeat(${columns}, var(--cg-size, 28px))` }}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={now === c}
          aria-label={label(c)}
          title={c}
          className={`cg-swatch${now === c ? " on" : ""}${isLightColor(c) ? " light" : ""}`}
          onClick={() => onPick(c)}
        >
          <span style={{ background: c }} />
        </button>
      ))}
      {custom && (
        <label className={`cg-swatch cg-custom${now && !known ? " on" : ""}`} title={`${custom} (직접 고르기)`}>
          <span style={now && !known ? { background: now } : undefined} />
          <input type="color" aria-label={custom} value={now ?? "#000000"} onChange={(e) => onPick(e.target.value)} />
        </label>
      )}
    </div>
  );
}
