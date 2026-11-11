import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeftRight,
  ArrowRight,
  Bold,
  ChevronUp,
  EyeOff,
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
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  Type,
  Underline,
  Undo2,
  Wand2,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { arrowEnds, arrowPathD, arrowShape, arrowsOf, bendFromHandle, cleanBend, type ArrowShape, type ArrowTarget, type Rect } from "../doc/arrows";
import { EMPHASES, MAX_NOTE_W, MIN_NOTE_W, NOTE_COLORS, NOTE_LABEL_MAX, noteOf, VEIL_COLORS, veilLabel } from "../doc/boxAnim";
import { BOX_FONTS, boxTextStyle, type BoxFormat } from "../doc/boxFonts";
import { BOX_BG_COLORS, BOX_COLORS, BOX_SIZES, boxBackground, boxBorder, boxLabel, boxesOf, boxPlainLabel, isAutoPageLink, isDangling } from "../doc/boxes";
import { layoutBox } from "../doc/textLayout";
import { frameAt, typedLines, typingPlan } from "../doc/typing";
import type { BoxAnim, BoxArrow, BoxBorder, BoxEmphasis, BoxLink, Page, TextBox } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { boxRectPx } from "./boxGeometry";
import { measureFor, useFontsVersion } from "./textMeasure";
import { pointerKind } from "../lib/inputState";

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
  /** 이번 강의 모드에서 펼친 상자·걷은 베일 */
  revealed?: ReadonlySet<string>;
  onReveal?: (id: string, open: boolean) => void;
  /** 베일 그리기 (v0.28, 텍스트 모드의 한 갈래): 끌어서 그 자리를 덮는 베일을 만든다 (톡 누르면 기본 크기) */
  veilDraw?: boolean;
  /** 베일 만들기: 페이지 대비 [x, y, w, h], 톡 누름이면 w·h 0 */
  onCreateVeil?: (r: { x: number; y: number; w: number; h: number }) => void;
  /** 베일 색 바꾸기 */
  onVeilColor?: (id: string, color: string) => void;
}

const DRAG_SLOP = 5;
/** 가장 작은 상자 (페이지 대비) */
const MIN_W = 0.04;
const MIN_H = 0.02;

type HandleMode = "e" | "s" | "se";

/**
 * 애니메이션 (v0.26 · 쪽지 v0.28): 쪽지가 떼어지며 상자가 펼쳐지는 시간 · 다시 접히는 시간 · 미리 보기에서 접힌 채 보여 주는 시간 ·
 * 다 친 뒤 커서가 깜빡이는 시간 · 베일이 걷히는 시간 · 다시 씌우는 시간 · 미리 보기의 형광펜이 남아 있는 시간
 */
const UNFOLD_MS = 520;
const REFOLD_MS = 360;
const PREVIEW_FOLDED_MS = 800;
const CARET_LINGER_MS = 650;
const LIFT_MS = 620;
const COVER_MS = 320;
const PREVIEW_MARK_MS = 2200;
/** 강조를 부르는 톡 누름: 이만큼 안 움직이고 이 시간 안에 뗌 */
const TAP_SLOP = 10;
const TAP_MS = 600;

/** 펼치는 중 · 접는 중 · (미리 보기) 접힌 채 기다리는 중 · 베일 걷는 중 · 베일 씌우는 중 */
interface Play {
  id: string;
  dir: "fold" | "open" | "close" | "lift" | "cover";
  typing: boolean;
  /** 다 펼친 뒤 부를 강조 */
  emphasis?: BoxEmphasis;
  /** 텍스트 모드의 미리 보기 (강의 모드의 펼친 상태는 바꾸지 않음) */
  preview?: boolean;
}

/** 상자마다 조금씩 다르게 기운 쪽지 (-4.5° ~ 4.5°, id로 정해져 늘 같음) */
function noteTilt(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 7) - 3) * 1.5;
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
  /** 고른 상자 막대에서 연 창 (애니메이션 창이면 접힌 쪽지를 미리 보여 준다) */
  const [boxPanel, setBoxPanel] = useState<{ id: string; panel: ToolbarPanel } | null>(null);
  useEffect(() => setBoxPanel(null), [selectedId]);
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

  // ── 애니메이션 (v0.26 · v0.28): 강의 모드에서 쪽지로 접혀 있다가 누르면 쪽지가 떼어지며 펼쳐지고, 글자가 입력되듯 나온다 ──
  const foldable = (b: TextBox) => b.anim?.reveal === "fold" && !b.link && !b.veil;
  /** 지금 쪽지로 접혀 보이는 상자: 강의 모드에서 아직 펼치지 않은 것, 미리 보기의 접힌 때 */
  const isFolded = (b: TextBox) => foldable(b) && (play?.id === b.id ? play.dir === "fold" : !!props.lecture && !editMode && !props.revealed?.has(b.id));
  /** 강의 모드에서 아직 걷지 않은 베일 (씌우는 중 포함) */
  const isVeiled = (b: TextBox) => !!b.veil && !!props.lecture && !editMode && (!props.revealed?.has(b.id) || (play?.id === b.id && play.dir === "cover"));
  const onRevealRef = useRef(props.onReveal);
  onRevealRef.current = props.onReveal;
  const openBox = (b: TextBox) => {
    onRevealRef.current?.(b.id, true);
    setPlay({ id: b.id, dir: "open", typing: !!b.anim?.typing, emphasis: b.anim?.emphasis });
  };
  const liftVeil = (b: TextBox) => {
    onRevealRef.current?.(b.id, true);
    setPlay({ id: b.id, dir: "lift", typing: false });
  };
  const coverVeil = (b: TextBox) => {
    onRevealRef.current?.(b.id, false);
    setPlay({ id: b.id, dir: "cover", typing: false });
  };

  // ── 강조 (v0.28): 형광펜(칠해지고 남음, 다시 누르면 지움) · 통통 · 반짝 ──
  const [emph, setEmph] = useState<{ id: string; kind: "bounce" | "glow" } | null>(null);
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  const markTimer = useRef(0);
  const emphasize = (id: string, kind: BoxEmphasis | undefined, preview = false) => {
    if (!kind) return;
    if (kind === "highlight") {
      setMarked((prev) => {
        const next = new Set(prev);
        if (next.has(id) && !preview) next.delete(id);
        else next.add(id);
        return next;
      });
      if (preview) {
        clearTimeout(markTimer.current);
        markTimer.current = window.setTimeout(() => setMarked((prev) => new Set([...prev].filter((x) => x !== id))), PREVIEW_MARK_MS);
      }
      return;
    }
    setEmph((e) => (e?.id === id ? e : { id, kind }));
  };
  // 강의 모드를 시작하거나 끝내면 칠한 형광펜은 지운다
  useEffect(() => {
    setMarked(new Set());
    setEmph(null);
  }, [props.lecture]);
  useEffect(() => () => clearTimeout(markTimer.current), []);

  // 펼치기(타자 없음)·접기·미리 보기의 접힌 때·베일 걷기/씌우기가 끝나면 다음으로. 타자는 다 치면 TypedText가 끝낸다
  useEffect(() => {
    if (!play) return;
    const ms = { fold: PREVIEW_FOLDED_MS, close: REFOLD_MS, lift: LIFT_MS, cover: COVER_MS, open: play.typing ? 0 : UNFOLD_MS }[play.dir];
    if (!ms) return;
    const t = window.setTimeout(() => {
      if (play.dir === "fold") return setPlay({ ...play, dir: "open" });
      if (play.dir === "close" && !play.preview) onRevealRef.current?.(play.id, false);
      setPlay(null);
      if (play.dir === "open") emphasize(play.id, play.emphasis, play.preview);
    }, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);
  const finishTyping = (id: string) => {
    const p = play;
    if (p?.id !== id || p.dir !== "open") return;
    setPlay(null);
    emphasize(id, p.emphasis, p.preview);
  };

  // 강의 모드: 강조가 있는 상자를 손가락(마우스)으로 톡 누르면 강조. 상자는 필기가 지나가야 하므로 누름을 가로채지 않고 자리로 찾는다
  const tapTargets = useRef<{ boxes: TextBox[]; rects: Map<string, Rect>; folded: (b: TextBox) => boolean; emphasize: typeof emphasize }>(null!);
  useEffect(() => {
    if (!props.lecture) return;
    let tap: { id: number; x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      tap = pointerKind(e) === "pen" || !e.isPrimary ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const up = (e: PointerEvent) => {
      const t = tap;
      tap = null;
      if (!t || t.id !== e.pointerId || Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP || performance.now() - t.t > TAP_MS) return;
      const target = e.target as Element | null;
      // 쪽지·베일·단추·팝업 그림·넘기기 바 같은 것을 누른 것은 빼고
      if (target?.closest?.(".tb-note, .tb-veil, .tb-refold, .popup-icon, .popup-backdrop, .popup-frame, .spotlight-tools") || (target?.closest?.("[data-no-gesture]") && !target.closest(".text-box"))) return;
      const layer = layerRef.current;
      if (!layer) return;
      const lr = layer.getBoundingClientRect();
      const { boxes: list, rects: rs, folded, emphasize: go } = tapTargets.current;
      const x = ((e.clientX - lr.left) * size.width) / Math.max(1, lr.width);
      const y = ((e.clientY - lr.top) * size.height) / Math.max(1, lr.height);
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        const r = rs.get(b.id);
        if (!b.anim?.emphasis || b.veil || b.link || folded(b) || !r) continue;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return go(b.id, b.anim.emphasis);
      }
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, [props.lecture, size.width, size.height]);

  // ── 베일 그리기 (v0.28): 텍스트 모드에서 끌어 그 자리를 덮는 베일 ──
  const band = useRef<{ pointer: number; x0: number; y0: number } | null>(null);
  const [bandRect, setBandRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const onBandDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editMode || !props.veilDraw || e.target !== e.currentTarget || e.button > 0) return;
    const p = toRatio(e.clientX, e.clientY);
    band.current = { pointer: e.pointerId, x0: clamp(p.x, 0, 1), y0: clamp(p.y, 0, 1) };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
  };
  const onBandMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = band.current;
    if (!g || g.pointer !== e.pointerId) return;
    const p = toRatio(e.clientX, e.clientY);
    const x1 = clamp(p.x, 0, 1);
    const y1 = clamp(p.y, 0, 1);
    setBandRect({ x: Math.min(g.x0, x1), y: Math.min(g.y0, y1), w: Math.abs(x1 - g.x0), h: Math.abs(y1 - g.y0) });
  };
  const onBandUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = band.current;
    if (!g || g.pointer !== e.pointerId) return;
    band.current = null;
    const r = bandRect;
    setBandRect(null);
    if (e.type !== "pointerup") return;
    const dragged = r && r.w * size.width > 8 && r.h * size.height > 8;
    // 톡 누름: 고른 것이 있으면 고르기만 풀고, 아니면 그 자리에 기본 크기 베일
    if (!dragged && (selectedId || props.selectedArrow)) {
      props.onSelect(null);
      props.onSelectArrow(null);
      return;
    }
    props.onCreateVeil?.(dragged ? r! : { x: g.x0, y: g.y0, w: 0, h: 0 });
  };

  const onLayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode || e.target !== e.currentTarget || props.veilDraw) return;
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
  tapTargets.current = { boxes, rects, folded: isFolded, emphasize };
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
      className={`box-layer${editMode ? " edit" : ""}${props.connectFrom ? " connecting" : ""}${editMode && props.veilDraw ? " veil-draw" : ""}`}
      data-no-gesture={editMode || undefined}
      onClick={onLayerClick}
      onPointerDown={onBandDown}
      onPointerMove={onBandMove}
      onPointerUp={onBandUp}
      onPointerCancel={onBandUp}
    >
      {bandRect && (
        <div
          className="veil-band"
          style={{ left: bandRect.x * size.width, top: bandRect.y * size.height, width: bandRect.w * size.width, height: bandRect.h * size.height }}
        />
      )}
      {shapes.length > 0 && (
        <svg className="arrow-layer" width={size.width} height={size.height} aria-hidden={!editMode}>
          {shapes.map(({ arrow: a, shape: s }) => {
            const d = arrowPathD(s);
            const grow = growing(a);
            return (
              <g key={a.id} data-arrow-id={a.id} className={grow ? "arrow-grow" : undefined} style={grow ? ({ "--grow-delay": `${UNFOLD_MS}ms` } as CSSProperties) : undefined}>
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
        const note = noteOf(b.anim);
        const notePx = note.w * size.width;
        // 접힌 쪽지 (v0.28, 0.26은 두루마리 띠): 누르면 펼친다 (손가락·S펜). 필기층 위라 펜으로 눌러도 글씨가 되지 않는다
        if (isFolded(b)) {
          return (
            <button
              key={b.id}
              type="button"
              className="tb-note"
              data-no-gesture
              data-box-id={b.id}
              style={noteStyle(rect, notePx, note, b.id)}
              aria-label="접힌 쪽지 펼치기"
              title="눌러서 펼치기"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (play?.id !== b.id) openBox(b);
              }}
            >
              <NoteLabel note={note} px={notePx} />
            </button>
          );
        }
        // 베일 (v0.28): 강의 모드에서는 천으로 덮고, 누르면 걷힌다. 걷은 뒤에는 오른쪽 위 작은 단추로 다시 씌운다
        if (b.veil && props.lecture && !editMode) {
          const lifting = play?.id === b.id && play.dir === "lift";
          if (isVeiled(b) || lifting) {
            return (
              <button
                key={b.id}
                type="button"
                className={`tb-veil${lifting ? " lifting" : ""}${play?.id === b.id && play.dir === "cover" ? " dropping" : ""}`}
                data-no-gesture
                data-box-id={b.id}
                style={veilStyle(rect, b)}
                aria-label="베일 걷기"
                title="눌러서 걷기"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!lifting) liftVeil(b);
                }}
              >
                <VeilLabel b={b} rect={rect} />
              </button>
            );
          }
          return (
            <button
              key={b.id}
              type="button"
              className="tb-refold veil-refold"
              data-no-gesture
              style={{ left: rect.x + rect.w, top: rect.y }}
              aria-label="베일 다시 씌우기"
              title="다시 씌우기"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                coverVeil(b);
              }}
            >
              <EyeOff size={13} strokeWidth={2.6} aria-hidden="true" />
            </button>
          );
        }
        const playing = play?.id === b.id && (play.dir === "open" || play.dir === "close");
        const typingNow = playing && play!.dir === "open" && play!.typing;
        const playMs = play?.dir === "close" ? REFOLD_MS : UNFOLD_MS;
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
          playing && (play!.dir === "open" ? "unfolding" : "folding"),
          b.veil && "veil-box",
          marked.has(b.id) && "marked",
          emph?.id === b.id && `emph-${emph.kind}`,
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
          ...(playing ? ({ "--note-w": `${notePx}px`, "--play-ms": `${playMs}ms` } as CSSProperties) : {}),
          ...(b.veil ? ({ "--veil": b.veil.color, background: undefined, boxShadow: undefined } as CSSProperties) : {}),
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
              <TypedText lines={layout.lines} delay={UNFOLD_MS} onDone={() => finishTyping(b.id)} />
            ) : b.veil ? (
              <VeilLabel b={b} rect={rect} />
            ) : (
              <span className="text-box-text">
                {layout.lines.map((line, i) =>
                  b.anim?.emphasis === "highlight" ? (
                    // 형광펜 강조: 줄마다 글 너비만큼 칠한다 (줄마다 조금씩 늦게)
                    <span key={i} className="tb-line">
                      <span className="tb-ink" style={{ "--i": i } as CSSProperties}>
                        {line || "\u00a0"}
                      </span>
                    </span>
                  ) : (
                    <span key={i} className="tb-line">
                      {line || "\u00a0"}
                    </span>
                  ),
                )}
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
            below={pos.y * size.height < toolbarRoom(boxPanel?.id === b.id ? boxPanel.panel : null)}
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
            onPreview={() => {
              if (foldable(b)) setPlay({ id: b.id, dir: "fold", typing: !!b.anim?.typing, emphasis: b.anim?.emphasis, preview: true });
              else emphasize(b.id, b.anim?.emphasis, true);
            }}
            onVeilColor={(c) => props.onVeilColor?.(b.id, c)}
            panel={boxPanel?.id === b.id ? boxPanel.panel : null}
            setPanel={(panel) => setBoxPanel(panel ? { id: b.id, panel } : null)}
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
        // 펼칠 때 떼어져 날아가는 쪽지 · 접을 때 다시 붙는 쪽지 (상자는 잘려 보이므로 상자 밖에 따로)
        const peel = playing ? (
          <span className={`tb-note ${play!.dir === "open" ? "peel" : "drop"}`} aria-hidden="true" style={{ ...noteStyle(rect, notePx, note, b.id), "--play-ms": `${playMs}ms` } as CSSProperties}>
            <NoteLabel note={note} px={notePx} />
          </span>
        ) : null;
        // 텍스트 모드에서 애니메이션 창을 연 동안: 접혔을 때의 쪽지 (크기·색·글을 바꾸면 바로 보임)
        const ghost =
          selected && boxPanel?.id === b.id && boxPanel.panel === "anim" && foldable(b) && !playing && !dragPos && !liveSize ? (
            <span className="tb-note ghost" aria-hidden="true" style={noteStyle(rect, notePx, note, b.id)}>
              <NoteLabel note={note} px={notePx} />
            </span>
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
                if (playing && play!.dir === "open") return finishTyping(b.id);
                if (!editMode && b.link && !dangling) props.onFollow(b.link);
              }}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget && emph?.id === b.id) setEmph(null);
              }}
            >
              {body}
              {toolbar}
              {handles}
              {editMode && b.anim && !b.veil && !playing && (
                <span className="tb-anim-badge" aria-label="애니메이션 있음" title={foldable(b) ? "강의 모드에서 쪽지로 접혀 있다가 누르면 펼쳐짐" : "강의 모드에서 손가락으로 누르면 강조"}>
                  {foldable(b) ? <StickyNote size={11} strokeWidth={2.6} /> : <Sparkles size={11} strokeWidth={2.6} />}
                </span>
              )}
            </div>
            {ghost}
            {peel}
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
  onVeilColor,
  panel,
  setPanel,
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
  /** 접힌 모양부터 펼치기·강조까지 한 번 보여 주기 */
  onPreview: () => void;
  onVeilColor: (color: string) => void;
  /** 펼친 창 (상자 층이 기억: 미리 보기 동안 막대가 잠깐 사라져도 그대로) */
  panel: ToolbarPanel | null;
  setPanel: (panel: ToolbarPanel | null) => void;
  onStartConnect: () => void;
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
  }, [boxLeft, pageWidth, panel]);
  const bg = boxBackground(box);
  // 베일 (v0.28): 베일 위 글 · 색 · 복사 · 잘라내기 · 지우기만
  if (box.veil) {
    return (
      <div ref={ref} className={`box-toolbar${below ? " below" : ""}`} style={{ left, maxWidth: pageWidth - 8 }} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
        <button aria-label="베일 글 고치기" title="베일 위에 보일 글 (없으면 ?)" onClick={onEdit}>
          <Pencil size={16} />
        </button>
        <span className="box-sep" />
        <span role="radiogroup" aria-label="베일 색" className="box-veil-colors">
          {VEIL_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={box.veil!.color === c} className={`box-color${box.veil!.color === c ? " on" : ""}`} aria-label={`베일 색 ${c}`} onClick={() => onVeilColor(c)}>
              <span style={{ background: c }} />
            </button>
          ))}
        </span>
        <span className="box-sep" />
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
  const anim = box.anim;
  const fold = anim?.reveal === "fold";
  const note = noteOf(anim);
  const notePct = Math.round(note.w * 100);
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
        <button aria-label="애니메이션" title="애니메이션: 쪽지 접기 · 강조 (강의 모드)" className={panel === "anim" || box.anim ? "on" : undefined} onClick={() => setPanel(panel === "anim" ? null : "anim")}>
          <Sparkles size={16} />
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
            <span className="box-anim-title">나타나기</span>
            <button role="radio" aria-checked={!fold} className={`box-bg-opt${!fold ? " on" : ""}`} onClick={() => onAnim({ ...anim, reveal: undefined })}>
              늘 보임
            </button>
            <button
              role="radio"
              aria-checked={fold}
              className={`box-bg-opt${fold ? " on" : ""}`}
              title="강의 모드에서 쪽지로 접혀 있다가, 누르면 펼쳐짐"
              onClick={() => onAnim({ ...anim, reveal: "fold", typing: fold ? anim?.typing : true })}
            >
              <StickyNote size={15} /> 쪽지 접기
            </button>
          </div>
          {fold && (
            <>
              <div className="box-format-row" role="radiogroup" aria-label="쪽지 색">
                <span className="box-anim-title">쪽지</span>
                {NOTE_COLORS.map((c) => (
                  <button key={c} role="radio" aria-checked={note.color === c} className={`box-color${note.color === c ? " on" : ""}`} aria-label={`쪽지 색 ${c}`} onClick={() => onAnim({ ...anim, note: { ...anim?.note, color: c } })}>
                    <span style={{ background: c }} />
                  </button>
                ))}
                <button
                  aria-pressed={!!anim?.typing}
                  className={`box-bg-opt${anim?.typing ? " on" : ""}`}
                  title="펼친 뒤 글자가 한 자씩 입력되듯 나옴"
                  onClick={() => onAnim({ ...anim, typing: !anim?.typing })}
                >
                  <Keyboard size={15} /> 타자 효과
                </button>
              </div>
              <label className="box-format-row">
                <span className="box-anim-title">크기</span>
                <input
                  type="range"
                  min={Math.round(MIN_NOTE_W * 100)}
                  max={Math.round(MAX_NOTE_W * 100)}
                  step={1}
                  value={notePct}
                  aria-label="쪽지 크기"
                  onChange={(e) => onAnim({ ...anim, note: { ...anim?.note, w: Number(e.target.value) / 100 } })}
                />
                <span className="ss-value">{notePct}%</span>
              </label>
              <label className="box-format-row">
                <span className="box-anim-title">쪽지 글</span>
                <input
                  type="text"
                  className="box-anim-label"
                  maxLength={NOTE_LABEL_MAX}
                  defaultValue={anim?.note?.label ?? ""}
                  placeholder="?"
                  aria-label="쪽지에 쓸 글"
                  onChange={(e) => onAnim({ ...anim, note: { ...anim?.note, label: e.target.value } })}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
            </>
          )}
          <div className="box-format-row" role="radiogroup" aria-label="강조">
            <span className="box-anim-title">강조</span>
            <button role="radio" aria-checked={!anim?.emphasis} className={`box-bg-opt${!anim?.emphasis ? " on" : ""}`} onClick={() => onAnim({ ...anim, emphasis: undefined })}>
              없음
            </button>
            {EMPHASES.map((x) => (
              <button key={x.id} role="radio" aria-checked={anim?.emphasis === x.id} className={`box-bg-opt${anim?.emphasis === x.id ? " on" : ""}`} onClick={() => onAnim({ ...anim, emphasis: x.id })}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="box-format-row">
            <button className="box-bg-opt" aria-label="애니메이션 미리 보기" disabled={!anim} onClick={onPreview}>
              <Play size={15} /> 미리 보기
            </button>
            <span className="box-anim-hint">
              {fold && anim?.emphasis ? "강의 모드: 쪽지를 누르면 펼쳐지고 강조" : fold ? "강의 모드: 쪽지를 누르면 펼쳐짐" : anim?.emphasis ? "강의 모드: 손가락으로 상자를 톡 누르면 강조" : "강의 모드에서 어떻게 보일지 고르세요"}
            </span>
          </div>
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

type ToolbarPanel = "format" | "color" | "bg" | "border" | "anim";

/** 막대를 상자 위에 둘 때 필요한 자리 (페이지 px): 창을 펼치면 더. 모자라면 상자 아래로 */
function toolbarRoom(panel: ToolbarPanel | null): number {
  return panel === "anim" ? 330 : panel === "format" ? 190 : panel ? 120 : 60;
}

/** 접힌 쪽지 자리: 상자 왼쪽 위 모서리에 살짝 걸쳐 붙음, 한 변 px, 상자마다 조금씩 기울어짐 */
function noteStyle(r: Rect, px: number, note: { color: string }, id: string): CSSProperties {
  return {
    left: r.x - px * 0.12,
    top: r.y - px * 0.16,
    width: px,
    height: px,
    "--note": note.color,
    "--tilt": `${noteTilt(id)}deg`,
  } as CSSProperties;
}

/** 쪽지 위 손글씨 (한 글자면 크게, 길면 작게 여러 줄) */
function NoteLabel({ note, px }: { note: { label: string }; px: number }) {
  const n = [...note.label].length;
  // 4자까지는 한 줄, 그보다 길면 두 줄로
  const k = n <= 1 ? 0.6 : n <= 2 ? 0.36 : n <= 3 ? 0.26 : n <= 4 ? 0.2 : 0.21;
  return (
    <span className="tb-note-label" style={{ fontSize: Math.max(8, px * k), ...(n > 4 ? { "--note-wrap": "normal" } : {}) } as CSSProperties}>
      {note.label}
    </span>
  );
}

/** 베일 자리·색 */
function veilStyle(r: Rect, b: TextBox): CSSProperties {
  return { left: r.x, top: r.y, width: r.w, height: r.h, "--veil": b.veil?.color } as CSSProperties;
}

/** 베일 위 글: 베일 높이·너비에 맞는 크기로 한 줄 (없으면 ?) */
function VeilLabel({ b, rect }: { b: TextBox; rect: Rect }) {
  const label = veilLabel(b);
  const n = Math.max(1, [...label].length);
  const px = clamp(Math.min(rect.h * 0.58, (rect.w * 0.86) / n), 9, 72);
  return (
    <span className="veil-label" style={{ fontSize: px }}>
      {label}
    </span>
  );
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
