import { BookOpen, Check } from "lucide-react";
import type { CSSProperties } from "react";
import { COVER_COLORS, coverKindLabel, coverLook, splitCoverTitle } from "../doc/cover";
import type { DocRecord } from "../store/db";
import { Dialog } from "./FolderDialogs";

// 홈 문서 카드의 표지 (v0.21): 차시 번호를 크게, 그 아래 제목, 아래쪽에 첫 페이지 종류

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

export function DocCover({ doc, choice, className }: { doc: DocRecord; choice?: string; className?: string }) {
  const look = coverLook(doc.id, choice, !!doc.thumb);
  if (look.type === "page") {
    return (
      <span className={`doc-thumb ${className ?? ""}`}>
        <img src={doc.thumb} alt="" draggable={false} />
      </span>
    );
  }
  const t = splitCoverTitle(doc.title);
  return (
    <span className={`doc-thumb doc-cover${t.num ? "" : " no-num"} ${className ?? ""}`} style={{ "--cover": look.color } as CSSProperties}>
      {t.num && (
        <span className="cover-num">
          {t.num}
          {t.unit && <small>{t.unit}</small>}
        </span>
      )}
      <span className="cover-rule" />
      <span className="cover-title">{t.title || doc.title}</span>
      <span className="cover-kind">{coverKindLabel(doc.manifest.pages[0])}</span>
    </span>
  );
}

interface CoverDialogProps {
  docs: DocRecord[];
  /** 지금 표지 (여러 개면 첫 문서) */
  current: string;
  onPick: (cover: string) => void;
  onClose: () => void;
}

/** 표지 고르기: 자동 · 10가지 색 · 첫 페이지. 고르면 바로 바뀐다 */
export function CoverDialog({ docs, current, onPick, onClose }: CoverDialogProps) {
  const sample = docs.find((d) => d.thumb) ?? docs[0];
  const anyThumb = docs.some((d) => d.thumb);
  const option = (value: string, label: string) => {
    const on = value === current;
    return (
      <button key={value} type="button" role="radio" aria-checked={on} aria-label={`표지 ${label}`} className={`cover-option${on ? " on" : ""}`} onClick={() => onPick(value)}>
        {value === "page" && !sample.thumb ? (
          <span className="doc-thumb cover-mini cover-none">
            <BookOpen size={20} />
          </span>
        ) : (
          <DocCover doc={sample} choice={value} className="cover-mini" />
        )}
        <span className="cover-label">
          {on && <Check size={13} />}
          {label}
        </span>
      </button>
    );
  };
  return (
    <Dialog title={docs.length > 1 ? `표지 (${docs.length}개)` : "표지"} icon={<BookOpen size={20} />} className="cover-dialog" onClose={onClose}>
      <div className="cover-options" role="radiogroup" aria-label="표지">
        {option("auto", "자동")}
        {COVER_COLORS.map((c) => option(c, COLOR_NAMES[c] ?? c))}
        {option("page", "첫 페이지")}
      </div>
      <p className="cover-note">
        자동은 문서마다 정해진 색입니다. {anyThumb ? "첫 페이지는 PDF·그림의 첫 쪽 그림입니다." : "첫 페이지 그림은 PDF·그림 문서를 이 기기에서 한 번 열면 생깁니다."}
      </p>
    </Dialog>
  );
}
