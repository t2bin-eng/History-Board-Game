import { ClipboardPaste, File, FileCode2, FileText, Film, Globe, Grid3x3, Image, SquarePlay } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BlankBackground } from "../doc/types";

export type LinkKind = "url" | "youtube";

interface Props {
  left: number;
  top: number;
  onBlank: (background: BlankBackground) => void;
  /** 파일 고르기 (PDF·HTML·이미지·동영상) */
  onFile: (kind: "pdf" | "html" | "image" | "video") => void;
  /** 링크로 페이지 추가. 잘못된 링크면 안내 문구를 돌려준다 */
  onLink: (text: string, kind: LinkKind) => string | null;
  /** 복사한 페이지가 있으면: 이 자리에 붙여넣기 */
  paste?: { label: string; run: () => void };
  onClose: () => void;
}

const PLACEHOLDER: Record<LinkKind, string> = {
  url: "예: quiz.vercel.app",
  youtube: "유튜브 링크 붙여넣기",
};

// 페이지 추가 메뉴: 빈 페이지·모눈 페이지·PDF·이미지·동영상·HTML 파일·웹 주소·유튜브
export function AddPageMenu({ left, top, onBlank, onFile, onLink, paste, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [linkKind, setLinkKind] = useState<LinkKind | null>(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

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
    if (linkKind) setUrlError(onLink(url, linkKind));
  };

  const toggleLink = (kind: LinkKind) => {
    setLinkKind((k) => (k === kind ? null : kind));
    setUrlError(null);
  };

  // 화면 밖으로 넘치지 않게 (상단 오른쪽 버튼에서 열 때 등)
  const maxTop = window.innerHeight - (linkKind ? 520 : 470) - (paste ? 50 : 0);
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
      {paste && (
        <button role="menuitem" className="add-paste" onClick={paste.run}>
          <ClipboardPaste size={20} /> {paste.label}
        </button>
      )}
      <button role="menuitem" onClick={() => onBlank("plain")}>
        <File size={20} /> 빈 페이지
      </button>
      <button role="menuitem" onClick={() => onBlank("grid")}>
        <Grid3x3 size={20} /> 모눈 페이지
      </button>
      <button role="menuitem" onClick={() => onFile("pdf")}>
        <FileText size={20} /> PDF 파일에서 추가…
      </button>
      <button role="menuitem" onClick={() => onFile("image")}>
        <Image size={20} /> 이미지…
        <small>여러 장 · HEIC·TIFF</small>
      </button>
      <button role="menuitem" onClick={() => onFile("video")}>
        <Film size={20} /> 동영상…
        <small>기기에 저장된 파일</small>
      </button>
      <div className="add-menu-sep" />
      <button role="menuitem" onClick={() => onFile("html")}>
        <FileCode2 size={20} /> HTML 파일…
        <small>오프라인 실행</small>
      </button>
      <button role="menuitem" aria-expanded={linkKind === "url"} onClick={() => toggleLink("url")}>
        <Globe size={20} /> 웹 주소(URL)…
        <small>인터넷 필요</small>
      </button>
      <button role="menuitem" aria-expanded={linkKind === "youtube"} onClick={() => toggleLink("youtube")}>
        <SquarePlay size={20} /> 유튜브 동영상…
        <small>페이지 안 재생</small>
      </button>
      {linkKind && (
        <form className="add-menu-url" onSubmit={submitUrl}>
          {/* type="url"은 https:// 없는 주소를 막으므로 text로 받고 normalizeUrl로 정리한다 */}
          <input
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            key={linkKind}
            placeholder={PLACEHOLDER[linkKind]}
            value={url}
            aria-invalid={!!urlError}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
          />
          <button type="submit">추가</button>
          {urlError && <span className="add-menu-error">{urlError}</span>}
        </form>
      )}
    </div>
  );
}
