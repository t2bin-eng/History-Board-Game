import { Copy, ExternalLink, Link2, Minus, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BOX_COLORS, boxLabel, boxesOf, isDangling } from "../doc/boxes";
import { layoutBox } from "../doc/textLayout";
import type { BoxLink, Page, TextBox } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { measureText } from "./textMeasure";

interface Props {
  page: Page;
  pages: Page[];
  hidden: string[];
  size: PageSize;
  /** 텍스트 모드: 빈 곳을 누르면 상자를 만들고, 상자를 고르고·옮기고·고친다 */
  editMode: boolean;
  selectedId: string | null;
  editingId: string | null;
  onCreate: (x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onStartEdit: (id: string) => void;
  onText: (id: string, text: string) => void;
  onEndEdit: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onFollow: (link: BoxLink) => void;
  onLink: (id: string) => void;
  onResize: (id: string, step: 1 | -1) => void;
  /** 손잡이로 상자 크기를 바꿈 (그 크기에 맞춘 글자 크기 함께) */
  onBoxSize: (id: string, w: number, h: number, size: number) => void;
  onColor: (id: string, color: string) => void;
  onCopy: (id: string) => void;
  onCut: (id: string) => void;
  onDelete: (id: string) => void;
}

const DRAG_SLOP = 5;
/** 가장 작은 상자 (페이지 대비) */
const MIN_W = 0.04;
const MIN_H = 0.02;

type HandleMode = "e" | "s" | "se";

// 페이지 위 텍스트 상자·하이퍼링크 층 (필기층 위). 평소에는 링크만 누를 수 있고 나머지는 필기가 지나간다.
export function BoxLayer(props: Props) {
  const { page, pages, hidden, size, editMode, selectedId, editingId } = props;
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; pointer: number; sx: number; sy: number; dx: number; dy: number; moved: boolean } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const resize = useRef<{ id: string; pointer: number; mode: HandleMode; w0: number; h0: number; x: number; y: number } | null>(null);
  const [liveSize, setLiveSize] = useState<{ id: string; w: number; h: number } | null>(null);
  const heightRatio = size.height / Math.max(1, size.width);

  // 길게 누르기로 메뉴가 열리면 누르고 있던 상자는 고르기·고치기로 넘어가지 않는다
  useEffect(() => {
    const onLongPress = () => {
      drag.current = null;
      setDragPos(null);
    };
    window.addEventListener("lessondeck:longpress", onLongPress);
    return () => window.removeEventListener("lessondeck:longpress", onLongPress);
  }, []);

  // 확대 중이면 화면상 크기가 다르므로 늘 실제 위치로 비율을 잰다
  const toRatio = (clientX: number, clientY: number) => {
    const r = layerRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };

  const boxes = boxesOf(page).filter((b) => !(b.role === "back" && isDangling(b, pages)));

  const onLayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode || e.target !== e.currentTarget) return;
    // 고른 상자가 있으면 이번 누름은 고르기만 푼다 (이미 지워진 상자면 바로 새로 만든다)
    if (boxes.some((b) => b.id === selectedId || b.id === editingId)) {
      props.onSelect(null);
      return;
    }
    const p = toRatio(e.clientX, e.clientY);
    // 누른 곳이 첫 줄 가운데쯤 오도록
    const lineRatio = (props.size.width * 0.024 * 1.3) / Math.max(1, props.size.height);
    props.onCreate(clamp(p.x, 0, 0.95), clamp(p.y - lineRatio / 2, 0, 0.97));
  };

  const onBoxDown = (b: TextBox, e: ReactPointerEvent<HTMLElement>) => {
    if (!editMode || editingId === b.id || e.button > 0) return;
    const p = toRatio(e.clientX, e.clientY);
    drag.current = { id: b.id, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, dx: p.x - b.x, dy: p.y - b.y, moved: false };
    // 빨리 끌어도 손가락·펜이 작은 상자 밖으로 빠지지 않게 바로 잡는다
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
    e.stopPropagation();
  };

  const onBoxMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_SLOP) return;
      d.moved = true;
      props.onSelect(d.id);
    }
    const p = toRatio(e.clientX, e.clientY);
    setDragPos({ id: d.id, x: clamp(p.x - d.dx, 0, 0.98), y: clamp(p.y - d.dy, 0, 0.98) });
  };

  const onBoxUp = (b: TextBox, e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      if (dragPos && dragPos.id === b.id) props.onMove(b.id, dragPos.x, dragPos.y);
      setDragPos(null);
      return;
    }
    if (e.type !== "pointerup") return;
    // 고른 상자를 한 번 더 누르면 글 고치기
    if (selectedId === b.id) props.onStartEdit(b.id);
    else props.onSelect(b.id);
  };

  // 크기 손잡이: 오른쪽(가로), 아래(세로), 모서리(둘 다). 줄바꿈과 글자 크기는 상자에 맞춰 저절로
  const onHandleDown = (b: TextBox, mode: HandleMode, e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (e.button > 0) return;
    // 크기가 정해지지 않은 상자는 지금 보이는 크기에서 시작한다
    const el = (e.currentTarget as HTMLElement).closest(".text-box") as HTMLElement;
    const w0 = b.w ?? el.offsetWidth / size.width;
    const h0 = b.h ?? el.offsetHeight / size.height;
    resize.current = { id: b.id, pointer: e.pointerId, mode, w0, h0, x: b.x, y: b.y };
    setLiveSize({ id: b.id, w: w0, h: h0 });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
  };

  const onHandleMove = (e: ReactPointerEvent<HTMLElement>) => {
    const r = resize.current;
    if (!r || r.pointer !== e.pointerId) return;
    e.stopPropagation();
    const p = toRatio(e.clientX, e.clientY);
    const w = r.mode === "s" ? r.w0 : clamp(p.x - r.x, MIN_W, 1 - r.x);
    const h = r.mode === "e" ? r.h0 : clamp(p.y - r.y, MIN_H, 1 - r.y);
    setLiveSize({ id: r.id, w, h });
  };

  const onHandleUp = (b: TextBox, e: ReactPointerEvent<HTMLElement>) => {
    const r = resize.current;
    if (!r || r.pointer !== e.pointerId) return;
    e.stopPropagation();
    resize.current = null;
    if (liveSize && liveSize.id === b.id) {
      const sized = { ...b, w: liveSize.w, h: liveSize.h };
      props.onBoxSize(b.id, liveSize.w, liveSize.h, layoutBox(sized, boxLabel(sized, pages, hidden), heightRatio, measureText).size);
    }
    setLiveSize(null);
  };

  return (
    <div ref={layerRef} className={`box-layer${editMode ? " edit" : ""}`} data-no-gesture={editMode || undefined} onClick={onLayerClick}>
      {boxes.map((b) => {
        const pos = dragPos?.id === b.id ? dragPos : b;
        const live = liveSize?.id === b.id ? { ...b, w: liveSize.w, h: liveSize.h } : b;
        const label = boxLabel(b, pages, hidden);
        const dangling = isDangling(b, pages);
        const editing = editingId === b.id;
        const selected = selectedId === b.id && editMode;
        // 줄은 직접 나눈다 (썸네일과 같은 결과). 크기가 정해진 상자는 글자 크기도 상자에 맞춘다
        const layout = layoutBox({ ...live, x: pos.x }, editing ? b.text || label : label, heightRatio, measureText);
        const fontSize = (layout.size * size.width) / 1000;
        const className = [
          "text-box",
          b.link && "link",
          b.role === "back" && "back",
          layout.fitted && "fitted",
          dangling && "dangling",
          selected && "selected",
          editing && "editing",
        ]
          .filter(Boolean)
          .join(" ");
        const style = {
          left: pos.x * size.width,
          top: pos.y * size.height,
          fontSize,
          color: b.color,
          padding: `${layout.chrome.padY}em ${layout.chrome.padX}em`,
          ...(layout.fitted ? { width: live.w! * size.width, height: live.h! * size.height } : {}),
        };
        const common = {
          className,
          style,
          "data-no-gesture": true,
          "data-box-id": b.id,
          onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onBoxDown(b, e),
          onPointerMove: onBoxMove,
          onPointerUp: (e: ReactPointerEvent<HTMLElement>) => onBoxUp(b, e),
          onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => onBoxUp(b, e),
        };

        if (editing) {
          return (
            <div key={b.id} {...common}>
              <textarea
                autoFocus
                value={b.text}
                placeholder={b.link ? label : "글자 입력"}
                aria-label="텍스트 상자 글자"
                className={layout.fitted ? "fill" : undefined}
                style={{ fontSize, color: b.color }}
                onChange={(e) => props.onText(b.id, e.target.value)}
                onBlur={() => props.onEndEdit(b.id)}
                onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
              />
            </div>
          );
        }

        const body = (
          <>
            {layout.chrome.icon > 0 && (
              <span className="text-box-icon" aria-hidden="true">
                {b.link?.type === "url" ? <ExternalLink size="0.9em" strokeWidth={2.4} /> : <Link2 size="0.9em" strokeWidth={2.4} />}
              </span>
            )}
            <span className="text-box-text">
              {layout.lines.map((line, i) => (
                <span key={i} className="tb-line">
                  {line || "\u00a0"}
                </span>
              ))}
            </span>
          </>
        );
        const handles =
          selected && !dragPos && !editing ? (
            <>
              {(["e", "s", "se"] as const).map((mode) => (
                <span
                  key={mode}
                  className={`tb-handle ${mode}`}
                  aria-hidden="true"
                  onPointerDown={(e) => onHandleDown(b, mode, e)}
                  onPointerMove={onHandleMove}
                  onPointerUp={(e) => onHandleUp(b, e)}
                  onPointerCancel={(e) => onHandleUp(b, e)}
                />
              ))}
            </>
          ) : null;
        const toolbar = selected && !dragPos && !liveSize && (
          <BoxToolbar
            box={b}
            below={pos.y < 0.12}
            boxLeft={pos.x * size.width}
            pageWidth={size.width}
            onEdit={() => props.onStartEdit(b.id)}
            onLink={() => props.onLink(b.id)}
            onResize={(s) => props.onResize(b.id, s)}
            onColor={(c) => props.onColor(b.id, c)}
            onCopy={() => props.onCopy(b.id)}
            onCut={() => props.onCut(b.id)}
            onDelete={() => props.onDelete(b.id)}
          />
        );

        // 평소: 웹 주소 링크는 진짜 링크(새 창·외부 앱), 페이지 링크는 그 페이지로
        if (!editMode && b.link?.type === "url") {
          return (
            <a key={b.id} {...common} href={b.link.url} target="_blank" rel="noopener noreferrer" title={b.link.url} draggable={false}>
              {body}
            </a>
          );
        }
        return (
          <div
            key={b.id}
            {...common}
            role={b.link && !editMode ? "link" : undefined}
            aria-disabled={dangling || undefined}
            onClick={() => {
              if (!editMode && b.link && !dangling) props.onFollow(b.link);
            }}
          >
            {body}
            {toolbar}
            {handles}
          </div>
        );
      })}
    </div>
  );
}

function BoxToolbar({
  box,
  below,
  boxLeft,
  pageWidth,
  onEdit,
  onLink,
  onResize,
  onColor,
  onCopy,
  onCut,
  onDelete,
}: {
  box: TextBox;
  below: boolean;
  /** 상자 왼쪽 위치와 페이지 폭: 막대가 페이지 밖으로 나가지 않게 옆으로 민다 */
  boxLeft: number;
  pageWidth: number;
  onEdit: () => void;
  onLink: () => void;
  onResize: (step: 1 | -1) => void;
  onColor: (color: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
}) {
  // 상자를 끌거나 고르는 동작과 겹치지 않게 막대 위의 누름은 상자에 전달하지 않는다
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(-2);
  useLayoutEffect(() => {
    const w = ref.current!.offsetWidth;
    setLeft(Math.max(4 - boxLeft, Math.min(-2, pageWidth - 4 - boxLeft - w)));
  }, [boxLeft, pageWidth]);
  return (
    <div
      ref={ref}
      className={`box-toolbar${below ? " below" : ""}`}
      style={{ left, maxWidth: pageWidth - 8 }}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <button aria-label="글자 고치기" title="글자 고치기" onClick={onEdit}>
        <Pencil size={16} />
      </button>
      <button aria-label="링크" title="링크 걸기" className={box.link ? "on" : undefined} onClick={onLink}>
        <Link2 size={16} />
      </button>
      <button aria-label="글자 작게" title="글자 작게" onClick={() => onResize(-1)}>
        <Minus size={16} />
      </button>
      <button aria-label="글자 크게" title="글자 크게" onClick={() => onResize(1)}>
        <Plus size={16} />
      </button>
      {BOX_COLORS.map((c) => (
        <button
          key={c}
          className={`box-color${box.color === c ? " on" : ""}`}
          aria-label={`글자색 ${c}`}
          onClick={() => onColor(c)}
        >
          <span style={{ background: c }} />
        </button>
      ))}
      <button aria-label="상자 복사" title="복사 (Ctrl+C)" onClick={onCopy}>
        <Copy size={16} />
      </button>
      <button aria-label="상자 잘라내기" title="잘라내기 (Ctrl+X)" onClick={onCut}>
        <Scissors size={16} />
      </button>
      <button aria-label="상자 지우기" title="지우기" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
