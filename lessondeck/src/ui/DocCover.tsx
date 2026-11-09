import { BookImage, BookOpen, Check, X } from "lucide-react";
import type { CSSProperties } from "react";
import { COVER_COLORS, coverKindLabel, coverLook, splitCoverTitle } from "../doc/cover";
import type { DocRecord } from "../store/db";
import type { CoverChoice } from "../store/folders";
import { Dialog } from "./FolderDialogs";

// 홈 문서 카드의 표지 (v0.21): 차시 번호를 크게, 그 아래 제목, 아래쪽에 첫 페이지 종류.
// 썸네일 페이지를 골랐으면 (v0.22) 표지 아래쪽 주머니에 그 페이지 그림이 반쯤 꽂혀 보인다.

const COLOR_NAMES: Record<string, string> = {
  "#24497a": "남색",
  "#1f6f9e": "바다",
  "#0d6b6e": "청록",
  "#2e6b45": "숲",
  "#5b6420": "올리브",
  "#8a5a12": "황토",
  "#9a3b26": "벽돌",
  "#7a2e4a": "자주",
  "#4f3d8f": "보라",
  "#3a3f4a": "먹",
};

/** 표지 아래 꽂을 그림: 고른 페이지의 그림이 이 기기에 있을 때만 */
export function peekThumb(doc: DocRecord, choice: CoverChoice | undefined): string | null {
  return choice?.page && doc.thumb && doc.thumbPage === choice.page ? doc.thumb : null;
}

export function DocCover({ doc, choice, className }: { doc: DocRecord; choice?: CoverChoice; className?: string }) {
  const look = coverLook(doc.id, choice?.cover, !!doc.thumb);
  if (look.type === "page") {
    return (
      <span className={`doc-thumb ${className ?? ""}`}>
        <img src={doc.thumb} alt="" draggable={false} />
      </span>
    );
  }
  const t = splitCoverTitle(doc.title);
  const peek = peekThumb(doc, choice);
  const kind = <span className="cover-kind">{coverKindLabel(doc.manifest.pages[0])}</span>;
  return (
    <span
      className={`doc-thumb doc-cover${t.num ? "" : " no-num"}${peek ? " with-peek" : ""} ${className ?? ""}`}
      style={{ "--cover": look.color } as CSSProperties}
    >
      {t.num && (
        <span className="cover-num">
          {t.num}
          {t.unit && <small>{t.unit}</small>}
        </span>
      )}
      <span className="cover-rule" />
      <span className="cover-title">{t.title || doc.title}</span>
      {peek ? (
        <>
          <span className="cover-sheet">
            <img src={peek} alt="" draggable={false} />
          </span>
          <span className="cover-pocket">{kind}</span>
        </>
      ) : (
        kind
      )}
    </span>
  );
}

interface CoverDialogProps {
  docs: DocRecord[];
  /** 지금 표지 (여러 개면 첫 문서) */
  current?: CoverChoice;
  onPick: (cover: string) => void;
  /** 표지 아래 꽂힌 썸네일 빼기 */
  onRemoveThumb: () => void;
  onClose: () => void;
}

/** 표지 고르기: 자동 · 10가지 색 · 페이지 그림. 고르면 바로 바뀐다 */
export function CoverDialog({ docs, current, onPick, onRemoveThumb, onClose }: CoverDialogProps) {
  const sample = docs.find((d) => d.thumb) ?? docs[0];
  const chosen = current?.cover ?? "auto";
  const option = (value: string, label: string) => {
    const on = value === chosen;
    return (
      <button key={value} type="button" role="radio" aria-checked={on} aria-label={`표지 ${label}`} className={`cover-option${on ? " on" : ""}`} onClick={() => onPick(value)}>
        {value === "page" && !sample.thumb ? (
          <span className="doc-thumb cover-mini cover-none">
            <BookOpen size={20} />
          </span>
        ) : (
          <DocCover doc={sample} choice={{ cover: value, page: current?.page, updatedAt: 0 }} className="cover-mini" />
        )}
        <span className="cover-label">
          {on && <Check size={13} />}
          {label}
        </span>
      </button>
    );
  };
  const withThumb = docs.some((d) => d.thumb && d.thumbPage);
  return (
    <Dialog title={docs.length > 1 ? `표지 (${docs.length}개)` : "표지"} icon={<BookOpen size={20} />} className="cover-dialog" onClose={onClose}>
      <div className="cover-options" role="radiogroup" aria-label="표지">
        {option("auto", "자동")}
        {COVER_COLORS.map((c) => option(c, COLOR_NAMES[c] ?? c))}
        {option("page", "페이지 그림")}
      </div>
      <div className="cover-thumb-row">
        <BookImage size={18} />
        {current?.page ? (
          <>
            <span>표지 아래에 썸네일 페이지가 꽂혀 있습니다.</span>
            <button type="button" className="btn" onClick={onRemoveThumb}>
              <X size={15} /> 썸네일 빼기
            </button>
          </>
        ) : (
          <span>문서를 열고 페이지 메뉴(⋯ 또는 길게 누르기)의 ‘썸네일로 고르기’를 누르면 그 페이지가 표지 아래에 반쯤 보입니다.</span>
        )}
      </div>
      <p className="cover-note">
        자동은 문서마다 정해진 색입니다. 페이지 그림은 표지 대신 썸네일 페이지(고르지 않았으면 첫 페이지)를 통째로 보여 줍니다.
        {!withThumb && " 그림은 이 기기에서 만들어지는 대로 보입니다."}
      </p>
    </Dialog>
  );
}
