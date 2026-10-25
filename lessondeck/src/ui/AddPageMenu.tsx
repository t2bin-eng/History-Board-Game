import { File, FileCode2, FileText, Globe, Grid3x3 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizeUrl } from "../doc/html";
import type { BlankBackground } from "../doc/types";

interface Props {
  left: number;
  top: number;
  onBlank: (background: BlankBackground) => void;
  onPdf: () => void;
  onHtml: () => void;
  onUrl: (url: string) => void;
  onClose: () => void;
}

// 페이지 추가 메뉴: 빈 페이지·모눈 페이지·PDF 파일·HTML 파일·웹 주소
export function AddPageMenu({ left, top, onBlank, onPdf, onHtml, onUrl, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // 메뉴를 연 바로 그 탭이 닫기로 처리되지 않도록 다음 틱에 등록한다
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown, true));
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submitUrl = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setUrlError(true);
      return;
    }
    onUrl(normalized);
  };

  // 화면 밖으로 넘치지 않게 (상단 오른쪽 버튼에서 열 때 등)
  const maxTop = window.innerHeight - (urlMode ? 360 : 320);
  const maxLeft = window.innerWidth - 276;
  return (
    <div
      ref={ref}
      className="add-menu"
      role="menu"
      style={{ left: Math.max(8, Math.min(left, maxLeft)), top: Math.max(8, Math.min(top, maxTop)) }}
      data-no-gesture
    >
      <div className="ts-title">페이지 추가</div>
      <button role="menuitem" onClick={() => onBlank("plain")}>
        <File size={20} /> 빈 페이지
      </button>
      <button role="menuitem" onClick={() => onBlank("grid")}>
        <Grid3x3 size={20} /> 모눈 페이지
      </button>
      <button role="menuitem" onClick={onPdf}>
        <FileText size={20} /> PDF 파일에서 추가…
      </button>
      <div className="add-menu-sep" />
      <button role="menuitem" onClick={onHtml}>
        <FileCode2 size={20} /> HTML 파일…
        <small>오프라인 실행</small>
      </button>
      <button role="menuitem" aria-expanded={urlMode} onClick={() => setUrlMode((v) => !v)}>
        <Globe size={20} /> 웹 주소(URL)…
        <small>인터넷 필요</small>
      </button>
      {urlMode && (
        <form className="add-menu-url" onSubmit={submitUrl}>
          {/* type="url"은 https:// 없는 주소를 막으므로 text로 받고 normalizeUrl로 정리한다 */}
          <input
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder="예: quiz.vercel.app"
            value={url}
            aria-invalid={urlError}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(false);
            }}
          />
          <button type="submit">추가</button>
          {urlError && <span className="add-menu-error">주소를 확인해 주세요</span>}
        </form>
      )}
    </div>
  );
}
