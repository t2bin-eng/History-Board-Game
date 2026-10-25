import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isWebPage, type DocState } from "../doc/types";
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
  /** 끌어서 놓기: 원래 목록 기준 삽입 위치(0~길이)로 옮기기 */
  onReorder: (id: string, toIndex: number) => void;
  onDelete: (id: string) => void;
  /** 숨기기 ↔ 보이기 (SPEC F3: HTML로 대체한 원본 쪽 등) */
  onToggleHidden: (id: string) => void;
  /** HTML·URL 페이지 화면 비율 바꾸기 (16:9 → 4:3 → A4) */
  onCycleAspect: (id: string) => void;
  onClose: () => void;
}

const THUMB_WIDTH = 112;
/** 손가락은 이만큼 누르고 있어야 끌기 시작 (그 전에 움직이면 목록 스크롤) */
const LONG_PRESS_MS = 350;
/** 펜·마우스는 이만큼 움직이면 끌기 시작 */
const DRAG_SLOP = 8;
/** 목록 위·아래 끝 이 거리 안에서는 자동으로 스크롤 */
const EDGE_SCROLL = 56;

interface Drag {
  id: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

// 왼쪽 페이지 바 (SPEC F3·F4·F7): 썸네일, 사이사이 + 버튼, 선택한 페이지의 이동·복제·삭제·숨기기·비율
export function PagePanel({
  doc,
  ink,
  currentId,
  onSelect,
  onAdd,
  onDuplicate,
  onMove,
  onReorder,
  onDelete,
  onToggleHidden,
  onCycleAspect,
  onClose,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const count = doc.pages.length;
  const hidden = new Set(doc.hidden);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [dragView, setDragView] = useState<{ id: string; x: number; y: number; dropIndex: number } | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const activateRef = useRef<() => void>(() => undefined);

  /** 손가락 위치 → 놓일 자리(원래 목록의 사이 위치 0~count) */
  const dropIndexAt = (y: number): number => {
    const cards = listRef.current?.querySelectorAll<HTMLElement>(".pp-card") ?? [];
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return cards.length;
  };

  // 끌기: 창 전체에서 움직임을 받는다. 목록 끝에서는 자동 스크롤.
  useEffect(() => {
    const list = listRef.current!;
    let raf = 0;
    const update = () => {
      const d = drag.current;
      if (!d?.active) return;
      setDragView({ id: d.id, x: d.x, y: d.y, dropIndex: dropIndexAt(d.y) });
    };
    const autoScroll = () => {
      const d = drag.current;
      if (!d?.active) return;
      const r = list.getBoundingClientRect();
      const speed = d.y < r.top + EDGE_SCROLL ? -(r.top + EDGE_SCROLL - d.y) / 3 : d.y > r.bottom - EDGE_SCROLL ? (d.y - (r.bottom - EDGE_SCROLL)) / 3 : 0;
      if (speed) {
        list.scrollTop += speed;
        update();
      }
      raf = requestAnimationFrame(autoScroll);
    };
    const activate = () => {
      const d = drag.current;
      if (!d || d.active) return;
      clearTimeout(d.timer);
      d.active = true;
      navigator.vibrate?.(12);
      update();
      raf = requestAnimationFrame(autoScroll);
    };
    const end = (commit: boolean) => {
      const d = drag.current;
      drag.current = null;
      cancelAnimationFrame(raf);
      if (!d) return;
      clearTimeout(d.timer);
      if (d.active) {
        // 끌기가 끝난 직후의 클릭(페이지 선택)은 무시한다
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
        if (commit) onReorderRef.current(d.id, dropIndexAt(d.y));
      }
      setDragView(null);
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.active) {
        const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_SLOP;
        if (!moved) return;
        // 손가락이 길게 누르기 전에 움직이면 스크롤로 본다
        if (d.pointerType === "touch") end(false);
        else activate();
        return;
      }
      update();
    };
    const onUp = (e: PointerEvent) => drag.current?.pointerId === e.pointerId && end(true);
    const onCancel = (e: PointerEvent) => drag.current?.pointerId === e.pointerId && end(false);
    // 끄는 중에는 목록이 손가락을 따라 스크롤되지 않게 막는다
    const blockScroll = (e: TouchEvent) => drag.current?.active && e.preventDefault();
    activateRef.current = activate;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    list.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      list.removeEventListener("touchmove", blockScroll);
    };
  }, []);

  const onThumbDown = (e: ReactPointerEvent, id: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = {
      id,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      // 손가락은 길게 눌러야 끌기 시작
      timer: e.pointerType === "touch" ? setTimeout(() => activateRef.current(), LONG_PRESS_MS) : undefined,
    };
  };

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
          const isHidden = hidden.has(page.id);
          return (
            <div key={page.id} className="pp-item">
              <AddSlot index={i} onAdd={onAdd} dropTarget={dragView?.dropIndex === i} />
              <div
                className={`pp-card${current ? " current" : ""}${isHidden ? " is-hidden" : ""}${dragView?.id === page.id ? " dragging" : ""}`}
                data-page-id={page.id}
              >
                <button
                  className="pp-thumb"
                  aria-label={`${i + 1}쪽${isHidden ? " (숨김)" : ""}`}
                  aria-current={current}
                  title="길게 눌러 끌면 순서를 바꿉니다"
                  onPointerDown={(e) => onThumbDown(e, page.id)}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!suppressClick.current) onSelect(page.id);
                  }}
                >
                  <PageThumb page={page} doc={doc} strokes={ink[page.id]?.present ?? []} width={THUMB_WIDTH} />
                  <span className="pp-num">{i + 1}</span>
                  {isHidden && (
                    <span className="pp-hidden-badge">
                      <EyeOff size={12} /> 숨김
                    </span>
                  )}
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
                    <button
                      className="wide"
                      aria-label={isHidden ? "보이기" : "숨기기"}
                      title={isHidden ? "보이기" : "숨기기 (넘길 때 건너뜀)"}
                      onClick={() => onToggleHidden(page.id)}
                    >
                      {isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      {/* 웹 페이지는 비율 버튼과 나눠 쓰므로 아이콘만 */}
                      {!isWebPage(page) && (isHidden ? "보이기" : "숨기기")}
                    </button>
                    {isWebPage(page) && (
                      <button className="wide" title="화면 비율 바꾸기" onClick={() => onCycleAspect(page.id)}>
                        {page.aspect}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <AddSlot index={count} onAdd={onAdd} last dropTarget={dragView?.dropIndex === count} />
      </div>
      {dragView && (
        <div className="pp-ghost" style={{ left: dragView.x - 44, top: dragView.y - 30 }} aria-hidden="true">
          {(() => {
            const page = doc.pages.find((p) => p.id === dragView.id);
            return page ? <PageThumb page={page} doc={doc} strokes={ink[page.id]?.present ?? []} width={88} /> : null;
          })()}
        </div>
      )}
    </aside>
  );
}

function AddSlot({ index, onAdd, last, dropTarget }: { index: number; onAdd: Props["onAdd"]; last?: boolean; dropTarget?: boolean }) {
  return (
    <button
      className={`pp-add${last ? " last" : ""}${dropTarget ? " drop-target" : ""}`}
      aria-label={last ? "맨 뒤에 페이지 추가" : `${index + 1}쪽 앞에 페이지 추가`}
      onClick={(e) => onAdd(index, e.currentTarget.getBoundingClientRect())}
    >
      <Plus size={last ? 20 : 14} />
      {last && <span>페이지 추가</span>}
    </button>
  );
}
