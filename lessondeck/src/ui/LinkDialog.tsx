import { File, FileCode2, FileText, Film, Globe, Grid3x3, Image, Link2, SquarePlay, Unlink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { pageNumberLabel } from "../doc/boxes";
import { normalizeUrl } from "../doc/html";
import { htmlAsset, mediaAsset, pdfAsset, type Asset, type BoxLink, type Page } from "../doc/types";

interface Props {
  pages: Page[];
  hidden: string[];
  assets: Record<string, Asset>;
  /** 링크를 거는 상자가 있는 페이지 */
  fromPageId: string;
  current?: BoxLink;
  onApply: (link: BoxLink, addBack: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}

// 텍스트 상자에 하이퍼링크 걸기: 이 문서의 페이지 또는 웹 주소
export function LinkDialog({ pages, hidden, assets, fromPageId, current, onApply, onRemove, onClose }: Props) {
  const [tab, setTab] = useState<"page" | "url">(current?.type === "url" ? "url" : "page");
  const [addBack, setAddBack] = useState(true);
  const [url, setUrl] = useState(current?.type === "url" ? current.url : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const applyUrl = () => {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("주소를 확인해 주세요 (예: encykorea.aks.ac.kr)");
      return;
    }
    onApply({ type: "url", url: normalized }, false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal link-dialog" role="dialog" aria-label="링크 걸기" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>
            <Link2 size={18} /> 링크 걸기
          </strong>
          <button className="pp-icon" aria-label="닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="link-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "page"} onClick={() => setTab("page")}>
            <FileText size={16} /> 이 문서의 페이지
          </button>
          <button role="tab" aria-selected={tab === "url"} onClick={() => setTab("url")}>
            <Globe size={16} /> 웹 주소
          </button>
        </div>

        {tab === "page" ? (
          <>
            <label className="link-back">
              <input type="checkbox" checked={addBack} onChange={(e) => setAddBack(e.target.checked)} />
              연결한 페이지에 "돌아가기" 링크 자동으로 넣기
            </label>
            <ul className="link-pages">
              {pages.map((p) => {
                const self = p.id === fromPageId;
                const chosen = current?.type === "page" && current.pageId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      className={chosen ? "on" : undefined}
                      disabled={self}
                      onClick={() => onApply({ type: "page", pageId: p.id }, addBack)}
                    >
                      <span className="link-page-no">{pageNumberLabel(pages, hidden, p.id)}</span>
                      <KindIcon page={p} />
                      <span className="link-page-name">{pageName(p, assets)}</span>
                      {self && <small>지금 페이지</small>}
                      {chosen && <small>연결됨</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <form
            className="link-url"
            // "example.com"처럼 https:// 없이 써도 받는다 (브라우저 기본 주소 검사는 끔)
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              applyUrl();
            }}
          >
            <input
              autoFocus
              type="url"
              inputMode="url"
              placeholder="https://..."
              aria-label="웹 주소"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
            />
            {error && <p className="link-error">{error}</p>}
            <div className="sync-actions">
              <button type="submit" className="primary">
                <Link2 size={18} /> 연결
              </button>
            </div>
          </form>
        )}

        {current && (
          <div className="sync-actions">
            <button onClick={onRemove}>
              <Unlink size={18} /> 링크 없애기
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/** 페이지를 알아볼 이름 (원본 파일 이름·주소 등) */
export function pageName(page: Page, assets: Record<string, Asset>): string {
  switch (page.kind) {
    case "pdf": {
      const a = pdfAsset(assets, page.asset);
      return a ? `${a.name} · ${page.pageIndex + 1}쪽` : "PDF";
    }
    case "blank":
      return page.background === "grid" ? "모눈 페이지" : "빈 페이지";
    case "html":
      return htmlAsset(assets, page.asset)?.name ?? "HTML";
    case "url":
      try {
        return new URL(page.url).hostname;
      } catch {
        return page.url;
      }
    case "youtube":
      return "유튜브 동영상";
    case "image":
    case "video":
      return mediaAsset(assets, page.asset)?.name ?? (page.kind === "image" ? "이미지" : "동영상");
  }
}

function KindIcon({ page }: { page: Page }) {
  switch (page.kind) {
    case "blank":
      return page.background === "grid" ? <Grid3x3 size={16} /> : <File size={16} />;
    case "html":
    case "url":
      return <FileCode2 size={16} />;
    case "youtube":
      return <SquarePlay size={16} />;
    case "image":
      return <Image size={16} />;
    case "video":
      return <Film size={16} />;
    default:
      return <FileText size={16} />;
  }
}
