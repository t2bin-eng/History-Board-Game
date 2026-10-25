import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DocState } from "../doc/types";
import type { InkBook } from "../ink/history";
import { PageThumb } from "./PageThumb";

interface Props {
  doc: DocState;
  ink: InkBook;
  currentId: string;
  onSelect: (id: string) => void;
  /** index 위치에 페이지 추가 메뉴 열기 */
  onAdd: (index: number, anchor: DOMRect) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const THUMB_WIDTH = 112;

// 왼쪽 페이지 바 (SPEC F4·F7): 썸네일, 사이사이 + 버튼, 선택한 페이지의 이동·복제·삭제
export function PagePanel({ doc, ink, currentId, onSelect, onAdd, onDuplicate, onMove, onDelete, onClose }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const count = doc.pages.length;

  // 현재 페이지가 보이도록 스크롤
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-page-id="${currentId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  return (
    <aside className="page-panel" aria-label="페이지 관리">
      <header className="page-panel-head">
        <strong>페이지 {count}</strong>
        <button className="pp-icon" aria-label="페이지 바 닫기" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="page-panel-list" ref={listRef}>
        {doc.pages.map((page, i) => {
          const current = page.id === currentId;
          return (
            <div key={page.id} className="pp-item">
              <AddSlot index={i} onAdd={onAdd} />
              <div className={`pp-card${current ? " current" : ""}`} data-page-id={page.id}>
                <button className="pp-thumb" aria-label={`${i + 1}쪽`} aria-current={current} onClick={() => onSelect(page.id)}>
                  <PageThumb page={page} doc={doc} strokes={ink[page.id]?.present ?? []} width={THUMB_WIDTH} />
                  <span className="pp-num">{i + 1}</span>
                </button>
                {current && (
                  <div className="pp-actions">
                    <button aria-label="앞으로 이동" title="앞으로 이동" disabled={i === 0} onClick={() => onMove(page.id, -1)}>
                      <ArrowUp size={16} />
                    </button>
                    <button aria-label="뒤로 이동" title="뒤로 이동" disabled={i === count - 1} onClick={() => onMove(page.id, 1)}>
                      <ArrowDown size={16} />
                    </button>
                    <button aria-label="복제" title="복제" onClick={() => onDuplicate(page.id)}>
                      <Copy size={16} />
                    </button>
                    <button
                      className="danger"
                      aria-label="삭제"
                      title={count === 1 ? "마지막 한 장은 삭제할 수 없습니다" : "삭제"}
                      disabled={count === 1}
                      onClick={() => onDelete(page.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <AddSlot index={count} onAdd={onAdd} last />
      </div>
    </aside>
  );
}

function AddSlot({ index, onAdd, last }: { index: number; onAdd: Props["onAdd"]; last?: boolean }) {
  return (
    <button
      className={`pp-add${last ? " last" : ""}`}
      aria-label={last ? "맨 뒤에 페이지 추가" : `${index + 1}쪽 앞에 페이지 추가`}
      onClick={(e) => onAdd(index, e.currentTarget.getBoundingClientRect())}
    >
      <Plus size={last ? 20 : 14} />
      {last && <span>페이지 추가</span>}
    </button>
  );
}
