import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeftRight,
  ArrowRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Italic,
  Keyboard,
  Copy,
  ExternalLink,
  Link2,
  Minus,
  MoveHorizontal,
  MoveUpRight,
  PaintBucket,
  Pencil,
  Play,
  Plus,
  Scissors,
  ScrollText,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
  Wand2,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { arrowEnds, arrowPathD, arrowShape, arrowsOf, bendFromHandle, cleanBend, type ArrowShape, type ArrowTarget, type Rect } from "../doc/arrows";
import { BOX_FONTS, boxTextStyle, type BoxFormat } from "../doc/boxFonts";
import { BOX_BG_COLORS, BOX_COLORS, BOX_SIZES, boxBackground, boxBorder, boxLabel, boxesOf, boxPlainLabel, isAutoPageLink, isDangling } from "../doc/boxes";
import { layoutBox } from "../doc/textLayout";
import { frameAt, typedLines, typingPlan } from "../doc/typing";
import type { BoxAnim, BoxArrow, BoxBorder, BoxLink, Page, TextBox } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { boxRectPx } from "./boxGeometry";
import { measureFor, useFontsVersion } from "./textMeasure";

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
  /** 글자 크기 고르기 (크기가 정해진 상자는 상자를 그만큼 키우고 줄임, v0.25) */
  onFontSize: (id: string, size: number) => void;
  /** 서식: 글꼴·굵게·기울임·밑줄·줄 맞춤 (v0.25) */
  onFormat: (id: string, patch: BoxFormat) => void;
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
  /** 애니메이션 바꾸기 (v0.26, undefined면 없앰) */
  onAnim: (id: string, anim: BoxAnim | undefined) => void;
  /** 강의 모드 (v0.26): 접었다 펼치기 상자는 접혀 있다가 누르면 펼쳐진다 */
  lecture?: boolean;
  /** 이번 강의 모드에서 펼친 상자 */
  revealed?: ReadonlySet<string>;
  onReveal?: (id: string, open: boolean) => void;
}

const DRAG_SLOP = 5;
/** 가장 작은 상자 (페이지 대비) */
const MIN_W = 0.04;
const MIN_H = 0.02;

type HandleMode = "e" | "s" | "se";

/** 애니메이션 (v0.26): 두루마리가 굴러 내려가며 펼쳐지는 시간 · 다시 말려 올라가는 시간 · 미리 보기에서 접힌 채 보여 주는 시간 · 다 친 뒤 커서가 깜빡이는 시간 */
const UNROLL_MS = 560;
const ROLLUP_MS = 340;
const PREVIEW_FOLDED_MS = 700;
const CARET_LINGER_MS = 650;

/** 펼치는 중 · 접는 중 · (미리 보기) 접힌 채 기다리는 중 */
interface Play {
  id: string;
  dir: "fold" | "open" | "close";
  typing: boolean;
}

/** 접힌 띠(두루마리) 높이: 글자 한 줄쯤, 24~44px (손가락으로 누르기 쉽게) */
function foldHeight(fontPx: number): number {
  return Math.round(clamp(fontPx * 1.1, 24, 44));
}

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
  /** 애니메이션 상자를 펼치거나 접는 중 (v0.26) */
  const [play, setPlay] = useState<Play | null>(null);
  const heightRatio = size.height / Math.max(1, size.width);
  // 앱에 넣은 글꼴은 쓰는 글자 묶음을 그때그때 받아 오므로, 다 받으면 다시 재서 그린다
  useFontsVersion();

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

  // ── 애니메이션 (v0.26): 강의 모드에서 접혀 있다가 누르면 두루마리처럼 펼쳐지고, 글자가 입력되듯 나온다 ──
  const foldable = (b: TextBox) => b.anim?.reveal === "fold" && !b.link;
  /** 지금 접힌 띠로 보이는 상자: 강의 모드에서 아직 펼치지 않은 것, 미리 보기의 접힌 때 */
  const isFolded = (b: TextBox) => foldable(b) && (play?.id === b.id ? play.dir === "fold" : !!props.lecture && !editMode && !props.revealed?.has(b.id));
  const onRevealRef = useRef(props.onReveal);
  onRevealRef.current = props.onReveal;
  const openBox = (b: TextBox) => {
    onRevealRef.current?.(b.id, true);
    setPlay({ id: b.id, dir: "open", typing: !!b.anim?.typing });
  };
  // 펼치기(타자 없음)·접기·미리 보기의 접힌 때가 끝나면 다음으로. 타자는 다 치면 TypedText가 끝낸다
  useEffect(() => {
    if (!play) return;
    const ms = play.dir === "fold" ? PREVIEW_FOLDED_MS : play.dir === "close" ? ROLLUP_MS : play.typing ? 0 : UNROLL_MS;
    if (!ms) return;
    const t = window.setTimeout(() => {
      if (play.dir === "fold") return setPlay({ ...play, dir: "open" });
      if (play.dir === "close") onRevealRef.current?.(play.id, false);
      setPlay(null);
    }, ms);
    return () => clearTimeout(t);
  }, [play]);

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
      props.onBoxSize(b.id, liveSize.w, liveSize.h, layoutBox(sized, boxLabel(sized, pages, hidden), heightRatio, measureFor(sized)).size);
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
  // 접힌 상자에 닿은 화살표는 펼칠 때까지 감추고, 펼치는 상자의 화살표는 펼친 뒤 그려 나간다 (v0.26)
  const veiled = new Set(boxes.filter((b) => isFolded(b) || (play?.id === b.id && play.dir === "close")).map((b) => b.id));
  const growing = (a: BoxArrow) => play?.dir === "open" && (a.from === play.id || a.to === play.id);
  const shapes = arrows.flatMap((a) => {
    if (veiled.has(a.from) || (a.to && veiled.has(a.to))) return [];
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
            const grow = growing(a);
            return (
              <g key={a.id} data-arrow-id={a.id} className={grow ? "arrow-grow" : undefined} style={grow ? ({ "--grow-delay": `${UNROLL_MS}ms` } as CSSProperties) : undefined}>
                {picked?.arrow.id === a.id && <path d={d} className="arrow-glow" strokeWidth={lineW + 10} />}
                <path d={d} className="arrow-line" pathLength={grow ? 1 : undefined} stroke={a.color} strokeWidth={lineW} strokeLinecap="round" fill="none" />
                {s.heads.map((h, i) => (
                  <polygon key={i} className="arrow-head" points={h.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill={a.color} stroke={a.color} strokeWidth={lineW * 0.4} strokeLinejoin="round" />
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
        const layout = layoutBox({ ...live, x: pos.x }, editing ? b.text || label : label, heightRatio, measureFor(b));
        const fontSize = (layout.size * size.width) / 1000;
        const rect = rects.get(b.id)!;
        const foldH = foldHeight(fontSize);
        // 접힌 띠 (v0.26): 누르면 펼친다 (손가락·S펜). 필기층 위라 펜으로 눌러도 글씨가 되지 않는다
        if (isFolded(b)) {
          return (
            <button
              key={b.id}
              type="button"
              className="tb-fold"
              data-no-gesture
              data-box-id={b.id}
              style={rollerStyle(rect, foldH, b)}
              aria-label="접힌 글상자 펼치기"
              title="눌러서 펼치기"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (play?.id !== b.id) openBox(b);
              }}
            >
              <ChevronDown className="tb-fold-hint" size={Math.round(foldH * 0.62)} strokeWidth={2.6} aria-hidden="true" />
            </button>
          );
        }
        const playing = play?.id === b.id && play.dir !== "fold";
        const typingNow = playing && play!.dir === "open" && play!.typing;
        const rollMs = play?.dir === "close" ? ROLLUP_MS : UNROLL_MS;
        // 서식 (v0.25): 글꼴·굵기·기울임·밑줄·줄 맞춤
        const ts = boxTextStyle(b);
        const textStyle = {
          fontFamily: ts.family,
          fontWeight: ts.weight,
          fontStyle: ts.italic ? "italic" : undefined,
          textAlign: b.align,
        } as const;
        const className = [
          "text-box",
          b.link && "link",
          b.role === "back" && "back",
          layout.fitted && "fitted",
          dangling && "dangling",
          selected && "selected",
          editing && "editing",
          props.connectFrom === b.id && "connect-from",
          b.underline && "underline",
          b.align && `align-${b.align}`,
          playing && "playing",
          playing && (play!.dir === "open" ? "unrolling" : "rolling-up"),
        ]
          .filter(Boolean)
          .join(" ");
        const style = {
          left: pos.x * size.width,
          top: pos.y * size.height,
          fontSize,
          color: b.color,
          ...textStyle,
          padding: `${layout.chrome.padY}em ${layout.chrome.padX}em`,
          ...(boxBackground(b) || boxBorder(b) ? { borderRadius: "0.25em" } : {}),
          ...(boxBackground(b) ? { background: boxBackground(b)! } : {}),
          ...(boxBorder(b) ? { boxShadow: `inset 0 0 0 ${boxBorder(b)!.em}em ${boxBorder(b)!.color}` } : {}),
          ...(layout.fitted ? { width: live.w! * size.width, height: live.h! * size.height } : {}),
          ...(playing ? ({ "--fold-h": `${foldH}px`, "--roll-ms": `${rollMs}ms` } as CSSProperties) : {}),
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
            <Fragment key={b.id}>
              <div {...common}>
                <textarea
                  autoFocus
                  value={b.text}
                  placeholder={b.link ? label : "글자 입력"}
                  aria-label="텍스트 상자 글자"
                  className={layout.fitted ? "fill" : undefined}
                  style={{ fontSize, color: b.color, ...textStyle, textDecoration: b.underline ? "underline" : undefined }}
                  onChange={(e) => props.onText(b.id, e.target.value)}
                  onBlur={() => props.onEndEdit(b.id)}
                  onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
                />
              </div>
            </Fragment>
          );
        }

        const body = (
          <>
            {layout.chrome.icon > 0 && (
              <span className="text-box-icon" aria-hidden="true">
                {b.link?.type === "url" ? <ExternalLink size="0.9em" strokeWidth={2.4} /> : <Link2 size="0.9em" strokeWidth={2.4} />}
              </span>
            )}
            {typingNow ? (
              <TypedText lines={layout.lines} delay={UNROLL_MS} onDone={() => setPlay((p) => (p?.id === b.id && p.dir === "open" ? null : p))} />
            ) : (
              <span className="text-box-text">
                {layout.lines.map((line, i) => (
                  <span key={i} className="tb-line">
                    {line || "\u00a0"}
                  </span>
                ))}
              </span>
            )}
            {layout.chrome.trail > 0 && (
              <span className="text-box-trail" aria-hidden="true">
                {b.role === "back" ? <Undo2 size="0.9em" strokeWidth={2.4} /> : <ArrowRight size="0.9em" strokeWidth={2.4} />}
              </span>
            )}
          </>
        );
        const handles =
          selected && !dragPos && !editing && !playing ? (
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
        const toolbar = selected && !dragPos && !liveSize && !playing && (
          <BoxToolbar
            box={b}
            below={pos.y < 0.12}
            boxLeft={pos.x * size.width}
            pageWidth={size.width}
            onEdit={() => props.onStartEdit(b.id)}
            onLink={() => props.onLink(b.id)}
            onResize={(s) => props.onResize(b.id, s)}
            fittedSize={layout.size}
            onFontSize={(s) => props.onFontSize(b.id, s)}
            onFormat={(patch) => props.onFormat(b.id, patch)}
            onColor={(c) => props.onColor(b.id, c)}
            onBg={(bg) => props.onBg(b.id, bg)}
            onBorder={(border) => props.onBorder(b.id, border)}
            onAnim={(anim) => props.onAnim(b.id, anim)}
            onPreview={() => setPlay({ id: b.id, dir: "fold", typing: !!b.anim?.typing })}
            onStartConnect={() => props.onStartConnect(b.id)}
            onCopy={() => props.onCopy(b.id)}
            onCut={() => props.onCut(b.id)}
            onDelete={() => props.onDelete(b.id)}
          />
        );

        // 평소: 웹 주소 링크는 진짜 링크(새 창·외부 앱), 페이지 링크는 그 페이지로
        if (!editMode && b.link?.type === "url") {
          return (
            <Fragment key={b.id}>
              <a {...common} href={b.link.url} target="_blank" rel="noopener noreferrer" title={b.link.url} draggable={false}>
                {body}
              </a>
            </Fragment>
          );
        }
        // 펼치거나 접는 동안 상자 위를 굴러가는 두루마리 축 (상자는 잘려 보이므로 상자 밖에 따로)
        const roller = playing ? (
          <span
            className={`tb-roller${play!.dir === "close" ? " up" : ""}`}
            aria-hidden="true"
            style={{ ...rollerStyle(rect, foldH, b), "--travel": `${Math.max(0, rect.h - foldH / 2)}px`, "--roll-ms": `${rollMs}ms` } as CSSProperties}
          />
        ) : null;
        // 강의 모드에서 펼친 상자: 오른쪽 위 작은 단추로 다시 접는다 (상자 위로는 필기가 지나감)
        const refold =
          props.lecture && !editMode && foldable(b) && props.revealed?.has(b.id) && play?.id !== b.id ? (
            <button
              type="button"
              className="tb-refold"
              data-no-gesture
              style={{ left: rect.x + rect.w, top: rect.y }}
              aria-label="다시 접기"
              title="다시 접기"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setPlay({ id: b.id, dir: "close", typing: false });
              }}
            >
              <ChevronUp size={15} strokeWidth={2.6} aria-hidden="true" />
            </button>
          ) : null;
        return (
          <Fragment key={b.id}>
            <div
              {...common}
              role={b.link && !editMode ? "link" : undefined}
              aria-disabled={dangling || undefined}
              title={isAutoPageLink(b) ? boxPlainLabel(b, pages, hidden) : undefined}
              onClick={() => {
                // 펼치는 중에 누르면 바로 다 보인다
                if (playing && play!.dir === "open") return setPlay(null);
                if (!editMode && b.link && !dangling) props.onFollow(b.link);
              }}
            >
              {body}
              {toolbar}
              {handles}
              {editMode && foldable(b) && !playing && (
                <span className="tb-anim-badge" aria-label="애니메이션: 접었다 펼치기" title="강의 모드에서 접혀 있다가 누르면 펼쳐짐">
                  <ScrollText size={11} strokeWidth={2.6} />
                </span>
              )}
            </div>
            {roller}
            {refold}
          </Fragment>
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
  fittedSize,
  onFontSize,
  onFormat,
  onColor,
  onBg,
  onBorder,
  onAnim,
  onPreview,
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
  /** 지금 보이는 글자 크기 (크기가 정해진 상자는 맞춘 크기) */
  fittedSize: number;
  onFontSize: (size: number) => void;
  onFormat: (patch: BoxFormat) => void;
  onColor: (color: string) => void;
  onBg: (bg: string | undefined) => void;
  onBorder: (border: BoxBorder | undefined) => void;
  onAnim: (anim: BoxAnim | undefined) => void;
  /** 접힌 모양부터 펼치기까지 한 번 보여 주기 */
  onPreview: () => void;
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
  const [panel, setPanel] = useState<"format" | "color" | "bg" | "border" | "anim" | null>(null);
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
      <button aria-label="서식" title="서식: 글꼴·크기·굵게·정렬" className={panel === "format" ? "on" : undefined} onClick={() => setPanel(panel === "format" ? null : "format")}>
        <Type size={16} />
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
      {!box.link && (
        <button aria-label="애니메이션" title="애니메이션: 강의 모드에서 접었다 펼치기" className={panel === "anim" || box.anim ? "on" : undefined} onClick={() => setPanel(panel === "anim" ? null : "anim")}>
          <ScrollText size={16} />
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
      {panel === "format" && (
        <div className="box-format" aria-label="서식">
          <div className="box-format-row" role="radiogroup" aria-label="글꼴">
            {BOX_FONTS.map((f) => (
              <button
                key={f.label}
                role="radio"
                aria-checked={box.font === f.id}
                aria-label={`글꼴 ${f.label}`}
                className={`box-font-opt${box.font === f.id ? " on" : ""}`}
                style={{ fontFamily: f.family, fontWeight: f.weights[0] }}
                onClick={() => onFormat({ font: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="box-format-row" role="radiogroup" aria-label="글자 크기">
            {BOX_SIZES.map((v) => {
              const on = Math.abs(v - fittedSize) < 0.5;
              return (
                <button key={v} role="radio" aria-checked={on} aria-label={`글자 크기 ${v}`} className={`box-size-opt${on ? " on" : ""}`} onClick={() => onFontSize(v)}>
                  {v}
                </button>
              );
            })}
          </div>
          <div className="box-format-row">
            <button aria-label="굵게" aria-pressed={!!box.bold} className={box.bold ? "on" : undefined} onClick={() => onFormat({ bold: !box.bold })}>
              <Bold size={16} />
            </button>
            <button aria-label="기울임" aria-pressed={!!box.italic} className={box.italic ? "on" : undefined} onClick={() => onFormat({ italic: !box.italic })}>
              <Italic size={16} />
            </button>
            <button aria-label="밑줄" aria-pressed={!!box.underline} className={box.underline ? "on" : undefined} onClick={() => onFormat({ underline: !box.underline })}>
              <Underline size={16} />
            </button>
            <span className="box-sep" />
            {(
              [
                [undefined, "왼쪽 맞춤", <AlignLeft key="l" size={16} />],
                ["center", "가운데 맞춤", <AlignCenter key="c" size={16} />],
                ["right", "오른쪽 맞춤", <AlignRight key="r" size={16} />],
              ] as const
            ).map(([v, label, icon]) => (
              <button key={label} role="radio" aria-checked={box.align === v} aria-label={label} className={box.align === v ? "on" : undefined} onClick={() => onFormat({ align: v })}>
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}
      {panel === "anim" && (
        <div className="box-format box-anim" aria-label="애니메이션">
          <div className="box-format-row" role="radiogroup" aria-label="나타나기">
            <button role="radio" aria-checked={!box.anim} className={`box-bg-opt${!box.anim ? " on" : ""}`} onClick={() => onAnim(undefined)}>
              없음
            </button>
            <button
              role="radio"
              aria-checked={box.anim?.reveal === "fold"}
              className={`box-bg-opt${box.anim?.reveal === "fold" ? " on" : ""}`}
              onClick={() => onAnim({ reveal: "fold", typing: box.anim?.typing ?? true })}
            >
              <ScrollText size={15} /> 접었다 펼치기
            </button>
          </div>
          {box.anim && (
            <div className="box-format-row">
              <button
                aria-pressed={!!box.anim.typing}
                className={`box-bg-opt${box.anim.typing ? " on" : ""}`}
                title="펼친 뒤 글자가 한 자씩 입력되듯 나옴"
                onClick={() => onAnim({ ...box.anim!, typing: !box.anim!.typing })}
              >
                <Keyboard size={15} /> 타자 효과
              </button>
              <span className="box-sep" />
              <button className="box-bg-opt" aria-label="애니메이션 미리 보기" onClick={onPreview}>
                <Play size={15} /> 미리 보기
              </button>
            </div>
          )}
          <p className="box-anim-hint">{box.anim ? "강의 모드에서 접혀 있다가, 누르면 펼쳐집니다" : "강의 모드에서 어떻게 나타날지 고르세요"}</p>
        </div>
      )}
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

/** 접힌 띠·두루마리 축 자리: 상자 위쪽, 상자보다 양옆으로 조금 길게. 종이색은 직접 고른 배경색, 아니면(자동·없음) 옛 종이색 */
function rollerStyle(r: Rect, foldH: number, b: TextBox): CSSProperties {
  const paper = b.bg && b.bg !== "auto" ? b.bg : "#ecd7a4";
  return { left: r.x - 4, top: r.y, width: r.w + 8, height: foldH, "--paper": paper } as CSSProperties;
}

/**
 * 타자 효과 (v0.26): 두루마리가 다 펼쳐진 뒤(delay) 글자가 한 자씩 입력되듯 나온다 (doc/typing.ts).
 * 아직 안 친 글자도 자리를 차지해(안 보이게) 줄 모양·맞춤이 처음부터 끝까지 같다. 다 치면 커서가 잠깐 깜빡이고 onDone
 */
function TypedText({ lines, delay, onDone }: { lines: string[]; delay: number; onDone: () => void }) {
  const text = lines.join("\n");
  const plan = useMemo(() => typingPlan(text.split("\n")), [text]);
  const [frame, setFrame] = useState(-1);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t0 = performance.now() + delay;
    let raf = 0;
    const tick = () => {
      const ms = performance.now() - t0;
      if (ms >= plan.total + CARET_LINGER_MS) return doneRef.current();
      setFrame(ms < 0 ? -1 : frameAt(plan, ms));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, delay]);
  const rows = frame < 0 ? plan.lines.map((cs) => ({ shown: "", comp: "", rest: cs.join(""), caret: false })) : typedLines(plan, frame);
  return (
    <span className="text-box-text typing">
      {rows.map((r, i) => (
        <span key={i} className="tb-line">
          {r.shown}
          {r.comp}
          {r.caret && <span className="tb-caret" aria-hidden="true" />}
          {r.rest && <span className="tb-rest">{r.rest}</span>}
          {!r.shown && !r.comp && !r.rest && "\u00a0"}
        </span>
      ))}
    </span>
  );
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
