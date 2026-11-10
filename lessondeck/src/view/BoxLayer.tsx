import {
  ArrowLeftRight,
  ArrowRight,
  Copy,
  ExternalLink,
  Link2,
  Minus,
  MoveHorizontal,
  MoveUpRight,
  PaintBucket,
  Pencil,
  Plus,
  Scissors,
  Square,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { arrowEnds, arrowPathD, arrowShape, arrowsOf, bendFromHandle, cleanBend, type ArrowShape, type ArrowTarget, type Rect } from "../doc/arrows";
import { BOX_BG_COLORS, BOX_COLORS, boxBackground, boxBorder, boxLabel, boxesOf, boxPlainLabel, isAutoPageLink, isDangling } from "../doc/boxes";
import { layoutBox } from "../doc/textLayout";
import type { BoxArrow, BoxBorder, BoxLink, Page, TextBox } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { boxRectPx } from "./boxGeometry";
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
  /** 배경색: "auto"(글자가 잘 보이는 색) · "#rrggbb" · undefined(없음) */
  onBg: (id: string, bg: string | undefined) => void;
  /** 테두리 (undefined면 없음) */
  onBorder: (id: string, border: BoxBorder | undefined) => void;
  /** 화살표: 이 상자에서 시작 (다음에 누른 상자로 잇거나, 누른 곳을 가리킨다) */
  onStartConnect: (id: string) => void;
  /** 화살표를 낼 상자 (시작한 뒤 끝을 기다리는 중) */
  connectFrom?: string | null;
  /** 끝: 다른 상자 id 또는 누른 곳 [x, y] (페이지 대비 0~1) */
  onConnect: (target: ArrowTarget) => void;
  onCancelConnect: () => void;
  /** 고른 화살표 (텍스트 모드) */
  selectedArrow?: string | null;
  onSelectArrow: (id: string | null) => void;
  onArrowFlip: (id: string) => void;
  onArrowPatch: (id: string, patch: Partial<Pick<BoxArrow, "both" | "color" | "bend">>) => void;
  /** 화살 끝을 옮김: 다른 상자 또는 아무 곳 */
  onArrowEnd: (id: string, target: ArrowTarget) => void;
  onArrowDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onCut: (id: string) => void;
  onDelete: (id: string) => void;
  /** 텍스트 모드에서 빈 곳을 누름: 그 자리의 이미지 스티커를 골랐으면 true (글상자를 만들지 않음) */
  onPickAt?: (clientX: number, clientY: number) => boolean;
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
  /** 고른 화살표의 끝·휘기 손잡이를 끄는 중 (페이지 px) */
  const [arrowDrag, setArrowDrag] = useState<{ id: string; kind: "end" | "bend"; pointer: number; x: number; y: number; moved: boolean } | null>(null);
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
    // 화살표 끝을 기다리는 중: 누른 곳을 가리키는 화살표 (줄 그은 곳·그림 등 아무 곳)
    if (props.connectFrom) {
      const p = toRatio(e.clientX, e.clientY);
      props.onConnect([clamp(p.x, 0, 1), clamp(p.y, 0, 1)]);
      return;
    }
    // 화살표를 골랐으면 놓기만
    if (props.selectedArrow) {
      props.onSelectArrow(null);
      return;
    }
    // 고른 상자가 있으면 이번 누름은 고르기만 푼다 (이미 지워진 상자면 바로 새로 만든다)
    if (boxes.some((b) => b.id === selectedId || b.id === editingId)) {
      props.onSelect(null);
      return;
    }
    if (props.onPickAt?.(e.clientX, e.clientY)) return;
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
    // 화살표로 잇는 중: 누른 상자로 잇는다 (시작 상자를 다시 누르면 그만)
    if (props.connectFrom) {
      if (b.id !== props.connectFrom) props.onConnect(b.id);
      else props.onCancelConnect();
      return;
    }
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

  // 화살표가 이을 상자 자리 (끄는 중·크기를 바꾸는 중의 모양 그대로)
  const rects = new Map<string, Rect>();
  for (const b of boxes) {
    const pos = dragPos?.id === b.id ? dragPos : b;
    const live = liveSize?.id === b.id ? { ...b, w: liveSize.w, h: liveSize.h } : b;
    const label = boxLabel(b, pages, hidden);
    rects.set(b.id, boxRectPx({ ...live, x: pos.x, y: pos.y }, editingId === b.id ? b.text || label : label, size));
  }
  const arrows = arrowsOf(page);
  const lineW = (3 * size.width) / 1000;
  /** (x, y)(페이지 px)에 있는 상자 (위에 있는 것부터, 시작 상자 빼고) */
  const boxAt = (x: number, y: number, except: string) => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const r = rects.get(boxes[i].id);
      if (boxes[i].id !== except && r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return boxes[i].id;
    }
    return null;
  };
  const center = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
  /** 끄는 중이면 그 모양 그대로: 끝은 손가락 밑의 상자나 그 자리, 휘기는 손잡이 자리로 */
  const liveArrow = (a: BoxArrow): { shape: ArrowShape | null; bend: number; target: ArrowTarget | null } => {
    const ends = arrowEnds(a, rects, size);
    if (!ends) return { shape: null, bend: 0, target: null };
    let target: Rect | [number, number] = ends.target;
    let bend = a.bend ?? 0;
    let to: ArrowTarget | null = null;
    if (arrowDrag?.id === a.id && arrowDrag.moved) {
      if (arrowDrag.kind === "end") {
        const hit = boxAt(arrowDrag.x, arrowDrag.y, a.from);
        target = hit ? rects.get(hit)! : [arrowDrag.x, arrowDrag.y];
        to = hit ?? [clamp(arrowDrag.x / size.width, 0, 1), clamp(arrowDrag.y / size.height, 0, 1)];
      } else {
        const p1 = Array.isArray(ends.target) ? ends.target : center(ends.target);
        bend = cleanBend(bendFromHandle(center(ends.from), p1, arrowDrag.x, arrowDrag.y)) ?? 0;
      }
    }
    return { shape: arrowShape(ends.from, target, lineW, a.both, bend), bend, target: to };
  };
  const shapes = arrows.flatMap((a) => {
    const { shape } = liveArrow(a);
    return shape ? [{ arrow: a, shape }] : [];
  });
  const pickedArrow = editMode && props.selectedArrow ? arrows.find((a) => a.id === props.selectedArrow) : undefined;
  const picked = pickedArrow ? shapes.find((s) => s.arrow.id === pickedArrow.id) : undefined;

  // 고른 화살표의 손잡이: 끝(다른 상자에 놓으면 그 상자로 이음, 아니면 그 자리를 가리킴) · 가운데(휘기)
  const onArrowHandleDown = (a: BoxArrow, kind: "end" | "bend", e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button > 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
    const p = toRatio(e.clientX, e.clientY);
    setArrowDrag({ id: a.id, kind, pointer: e.pointerId, x: p.x * size.width, y: p.y * size.height, moved: false });
  };
  const onArrowHandleMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!arrowDrag || arrowDrag.pointer !== e.pointerId) return;
    e.stopPropagation();
    const p = toRatio(e.clientX, e.clientY);
    const x = clamp(p.x, 0, 1) * size.width;
    const y = clamp(p.y, 0, 1) * size.height;
    // 손잡이를 톡 누르기만 한 것은 바꾸지 않는다 (손떨림 몇 px)
    const moved = arrowDrag.moved || Math.hypot(x - arrowDrag.x, y - arrowDrag.y) > DRAG_SLOP;
    if (moved) setArrowDrag({ ...arrowDrag, x, y, moved });
  };
  const onArrowHandleUp = (a: BoxArrow, e: ReactPointerEvent<HTMLElement>) => {
    if (!arrowDrag || arrowDrag.pointer !== e.pointerId) return;
    e.stopPropagation();
    const live = liveArrow(a);
    setArrowDrag(null);
    if (e.type !== "pointerup" || !live.shape || !arrowDrag.moved) return;
    if (arrowDrag.kind === "end" && live.target) props.onArrowEnd(a.id, live.target);
    else if (arrowDrag.kind === "bend" && (live.bend || undefined) !== a.bend) props.onArrowPatch(a.id, { bend: live.bend || undefined });
  };

  return (
    <div
      ref={layerRef}
      className={`box-layer${editMode ? " edit" : ""}${props.connectFrom ? " connecting" : ""}`}
      data-no-gesture={editMode || undefined}
      onClick={onLayerClick}
    >
      {shapes.length > 0 && (
        <svg className="arrow-layer" width={size.width} height={size.height} aria-hidden={!editMode}>
          {shapes.map(({ arrow: a, shape: s }) => {
            const d = arrowPathD(s);
            return (
              <g key={a.id} data-arrow-id={a.id}>
                {picked?.arrow.id === a.id && <path d={d} className="arrow-glow" strokeWidth={lineW + 10} />}
                <path d={d} stroke={a.color} strokeWidth={lineW} strokeLinecap="round" fill="none" />
                {s.heads.map((h, i) => (
                  <polygon key={i} points={h.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill={a.color} stroke={a.color} strokeWidth={lineW * 0.4} strokeLinejoin="round" />
                ))}
                {editMode && !props.connectFrom && (
                  <path
                    d={d}
                    className="arrow-hit"
                    strokeWidth={Math.max(22, lineW * 7)}
                    aria-label="화살표"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onSelectArrow(a.id);
                    }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
      {props.connectFrom && editMode && (
        <div className="connect-hint">
          화살표 끝을 둘 곳이나 이을 상자를 누르세요
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              props.onCancelConnect();
            }}
          >
            그만
          </button>
        </div>
      )}
      {pickedArrow && (picked || arrowDrag?.id === pickedArrow.id) && (
        <>
          {(["bend", "end"] as const).map((kind) => {
            const dragging = arrowDrag?.id === pickedArrow.id && arrowDrag.kind === kind && arrowDrag.moved;
            const at = dragging ? [arrowDrag.x, arrowDrag.y] : picked ? (kind === "end" ? endHandleSpot(picked.shape, !!pickedArrow.to) : picked.shape.mid) : null;
            if (!at || (arrowDrag && arrowDrag.kind !== kind)) return null;
            return (
              <span
                key={kind}
                className={`arrow-handle ${kind}`}
                style={{ left: at[0], top: at[1] }}
                role="slider"
                aria-label={kind === "end" ? "화살 끝 옮기기" : "화살표 휘기"}
                onPointerDown={(e) => onArrowHandleDown(pickedArrow, kind, e)}
                onPointerMove={onArrowHandleMove}
                onPointerUp={(e) => onArrowHandleUp(pickedArrow, e)}
                onPointerCancel={(e) => onArrowHandleUp(pickedArrow, e)}
              />
            );
          })}
        </>
      )}
      {picked && !arrowDrag && (
        <ArrowToolbar
          arrow={picked.arrow}
          at={{ x: picked.shape.mid[0], y: picked.shape.mid[1] }}
          pageWidth={size.width}
          onFlip={() => props.onArrowFlip(picked.arrow.id)}
          onBoth={() => props.onArrowPatch(picked.arrow.id, { both: !picked.arrow.both })}
          onColor={(color) => props.onArrowPatch(picked.arrow.id, { color })}
          onDelete={() => props.onArrowDelete(picked.arrow.id)}
        />
      )}
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
          props.connectFrom === b.id && "connect-from",
        ]
          .filter(Boolean)
          .join(" ");
        const style = {
          left: pos.x * size.width,
          top: pos.y * size.height,
          fontSize,
          color: b.color,
          padding: `${layout.chrome.padY}em ${layout.chrome.padX}em`,
          ...(boxBackground(b) || boxBorder(b) ? { borderRadius: "0.25em" } : {}),
          ...(boxBackground(b) ? { background: boxBackground(b)! } : {}),
          ...(boxBorder(b) ? { boxShadow: `inset 0 0 0 ${boxBorder(b)!.em}em ${boxBorder(b)!.color}` } : {}),
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
            {layout.chrome.trail > 0 && (
              <span className="text-box-trail" aria-hidden="true">
                {b.role === "back" ? <Undo2 size="0.9em" strokeWidth={2.4} /> : <ArrowRight size="0.9em" strokeWidth={2.4} />}
              </span>
            )}
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
            onBg={(bg) => props.onBg(b.id, bg)}
            onBorder={(border) => props.onBorder(b.id, border)}
            onStartConnect={() => props.onStartConnect(b.id)}
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
            title={isAutoPageLink(b) ? boxPlainLabel(b, pages, hidden) : undefined}
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
  onBg,
  onBorder,
  onStartConnect,
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
  onBg: (bg: string | undefined) => void;
  onBorder: (border: BoxBorder | undefined) => void;
  onStartConnect: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
}) {
  // 상자를 끌거나 고르는 동작과 겹치지 않게 막대 위의 누름은 상자에 전달하지 않는다
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(-2);
  /** 펼친 색 고르기 줄: 글자색 / 배경색 */
  const [panel, setPanel] = useState<"color" | "bg" | "border" | null>(null);
  useLayoutEffect(() => {
    const w = ref.current!.offsetWidth;
    setLeft(Math.max(4 - boxLeft, Math.min(-2, pageWidth - 4 - boxLeft - w)));
  }, [boxLeft, pageWidth, panel]);
  const bg = boxBackground(box);
  return (
    <div
      ref={ref}
      className={`box-toolbar${below ? " below" : ""}`}
      style={{ left, maxWidth: pageWidth - 8 }}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <button aria-label="글 고치기" title="글 고치기" onClick={onEdit}>
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
      <button aria-label="글자색" title="글자색" className={panel === "color" ? "on" : undefined} onClick={() => setPanel(panel === "color" ? null : "color")}>
        <span className="box-glyph" style={{ color: box.color, background: bg ?? "transparent" }}>
          가
        </span>
      </button>
      {!box.link && (
        <button aria-label="배경색" title="배경색" className={`box-bg-btn${panel === "bg" ? " on" : ""}`} onClick={() => setPanel(panel === "bg" ? null : "bg")}>
          <PaintBucket size={16} />
          <span className="box-bg-mark" style={{ background: bg ?? "transparent" }} />
        </button>
      )}
      {!box.link && (
        <button aria-label="테두리" title="테두리" className={panel === "border" || box.border ? "on" : undefined} onClick={() => setPanel(panel === "border" ? null : "border")}>
          <Square size={16} />
        </button>
      )}
      <button aria-label="화살표" title="화살표 (다음에 누른 곳이나 상자를 가리킴)" onClick={onStartConnect}>
        <MoveUpRight size={16} />
      </button>
      <button aria-label="상자 복사" title="복사 (Ctrl+C)" onClick={onCopy}>
        <Copy size={16} />
      </button>
      <button aria-label="상자 잘라내기" title="잘라내기 (Ctrl+X)" onClick={onCut}>
        <Scissors size={16} />
      </button>
      <button aria-label="상자 지우기" title="지우기" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
      {panel === "color" && (
        <div className="box-palette" role="radiogroup" aria-label="글자색 고르기">
          {BOX_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={box.color === c} className={`box-color${box.color === c ? " on" : ""}`} aria-label={`글자색 ${c}`} onClick={() => onColor(c)}>
              <span style={{ background: c }} />
            </button>
          ))}
        </div>
      )}
      {panel === "border" && (
        <div className="box-palette" role="radiogroup" aria-label="테두리 고르기">
          <button role="radio" aria-checked={!box.border} className={`box-bg-opt${!box.border ? " on" : ""}`} onClick={() => onBorder(undefined)}>
            없음
          </button>
          <button
            role="radio"
            aria-checked={box.border?.color === "auto"}
            className={`box-bg-opt${box.border?.color === "auto" ? " on" : ""}`}
            title="글자색과 같게"
            onClick={() => onBorder({ color: "auto", w: box.border?.w ?? 2 })}
          >
            글자색
          </button>
          {BOX_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={box.border?.color === c}
              className={`box-color${box.border?.color === c ? " on" : ""}`}
              aria-label={`테두리 ${c}`}
              onClick={() => onBorder({ color: c, w: box.border?.w ?? 2 })}
            >
              <span style={{ background: c }} />
            </button>
          ))}
          <span className="box-sep" />
          {([1, 2, 3] as const).map((w) => (
            <button
              key={w}
              role="radio"
              aria-checked={box.border?.w === w}
              className={`box-bg-opt${box.border?.w === w ? " on" : ""}`}
              aria-label={`테두리 ${["얇게", "보통", "굵게"][w - 1]}`}
              onClick={() => onBorder({ color: box.border?.color ?? "auto", w })}
            >
              <span className="box-border-sample" style={{ borderTopWidth: w + 1 }} />
            </button>
          ))}
        </div>
      )}
      {panel === "bg" && (
        <div className="box-palette" role="radiogroup" aria-label="배경색 고르기">
          <button role="radio" aria-checked={box.bg === "auto"} className={`box-bg-opt${box.bg === "auto" ? " on" : ""}`} title="글자가 잘 보이는 색을 저절로" onClick={() => onBg("auto")}>
            <Wand2 size={15} /> 자동
          </button>
          <button role="radio" aria-checked={!box.bg} className={`box-bg-opt${!box.bg ? " on" : ""}`} onClick={() => onBg(undefined)}>
            없음
          </button>
          {BOX_BG_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={box.bg === c} className={`box-color${box.bg === c ? " on" : ""}`} aria-label={`배경색 ${c}`} onClick={() => onBg(c)}>
              <span style={{ background: c }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 끝 손잡이 자리: 가리키는 화살표는 촉 끝, 상자로 이은 화살표는 상자를 가리지 않게 촉 끝에서 조금 뒤로 */
function endHandleSpot(s: ArrowShape, toBox: boolean): [number, number] {
  if (!toBox) return s.tip;
  const [tip, w1, w2] = s.heads[0];
  const bx = (w1[0] + w2[0]) / 2 - tip[0];
  const by = (w1[1] + w2[1]) / 2 - tip[1];
  const l = Math.hypot(bx, by) || 1;
  return [tip[0] + (bx / l) * 16, tip[1] + (by / l) * 16];
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** 고른 화살표의 막대: 방향 바꾸기 · 양쪽 화살표 · 색 · 지우기 (화살표 가운데 위) */
function ArrowToolbar({
  arrow,
  at,
  pageWidth,
  onFlip,
  onBoth,
  onColor,
  onDelete,
}: {
  arrow: BoxArrow;
  at: { x: number; y: number };
  pageWidth: number;
  onFlip: () => void;
  onBoth: () => void;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const width = 330;
  const left = clamp(at.x - width / 2, 4, Math.max(4, pageWidth - width - 4));
  const top = at.y > 70 ? at.y - 64 : at.y + 18;
  return (
    <div className="box-toolbar arrow-toolbar" style={{ left, top }} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      {arrow.to && (
        <button aria-label="방향 바꾸기" title="방향 바꾸기" onClick={onFlip}>
          <ArrowLeftRight size={16} />
        </button>
      )}
      <button aria-label="양쪽 화살표" title="양쪽 화살표" className={arrow.both ? "on" : undefined} onClick={onBoth}>
        <MoveHorizontal size={16} />
      </button>
      {BOX_COLORS.filter((c) => c !== "#ffffff").map((c) => (
        <button key={c} className={`box-color${arrow.color === c ? " on" : ""}`} aria-label={`화살표 색 ${c}`} onClick={() => onColor(c)}>
          <span style={{ background: c }} />
        </button>
      ))}
      <button aria-label="화살표 지우기" title="지우기" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}
