import { newId, type BoxAnim, type BoxEmphasis, type TextBox } from "./types";

// 글상자 애니메이션 · 베일 (v0.26 · v0.28, SPEC 5장 boxes "애니메이션"·"베일"): 값 다듬기와 기본값.

/** 쪽지 색: 노랑 · 분홍 · 민트 · 하늘 · 라벤더 (첫 것이 기본) */
export const NOTE_COLORS = ["#ffe27a", "#ffc4d3", "#bfeedb", "#c2e2ff", "#e2d4ff"];
/** 쪽지 한 변 (페이지 가로 대비): 기본 · 가장 작게 · 가장 크게 */
export const NOTE_W = 0.05;
export const MIN_NOTE_W = 0.03;
export const MAX_NOTE_W = 0.15;
/** 쪽지 글은 이만큼까지 (손글씨로 작게 쓰이는 표시) */
export const NOTE_LABEL_MAX = 8;

export const EMPHASES: { id: BoxEmphasis; label: string }[] = [
  { id: "highlight", label: "형광펜" },
  { id: "bounce", label: "통통" },
  { id: "glow", label: "반짝" },
];

/** 베일 색: 남색 벨벳 · 버건디 · 숲 · 먹 · 모래 (첫 것이 기본) */
export const VEIL_COLORS = ["#34336b", "#7a2a3c", "#2d5c4f", "#262626", "#b08d57"];
/** 새 베일 크기 (페이지 가로·세로 대비) */
export const VEIL_W = 0.16;
export const VEIL_H = 0.05;

const HEX = /^#[0-9a-f]{6}$/i;

/** 쪽지 모양 (기본값 채움) */
export function noteOf(anim: BoxAnim | undefined): { w: number; color: string; label: string } {
  const n = anim?.note;
  return {
    w: clamp(n?.w ?? NOTE_W, MIN_NOTE_W, MAX_NOTE_W),
    color: n?.color && HEX.test(n.color) ? n.color : NOTE_COLORS[0],
    label: n?.label?.trim() || "?",
  };
}

/** 애니메이션 값 다듬기: 이상한 값·기본값은 빼고, 나타나기도 강조도 없으면 undefined (상자에서 뺀다) */
export function cleanAnim(anim: BoxAnim | undefined): BoxAnim | undefined {
  if (!anim) return undefined;
  const out: BoxAnim = {};
  if (anim.reveal === "fold") {
    out.reveal = "fold";
    if (anim.typing) out.typing = true;
    const n = anim.note;
    const note: NonNullable<BoxAnim["note"]> = {};
    if (n?.w != null && Number.isFinite(n.w) && Math.abs(n.w - NOTE_W) > 1e-6) note.w = clamp(n.w, MIN_NOTE_W, MAX_NOTE_W);
    if (n?.color && HEX.test(n.color) && n.color.toLowerCase() !== NOTE_COLORS[0]) note.color = n.color.toLowerCase();
    const label = [...(n?.label ?? "").trim()].slice(0, NOTE_LABEL_MAX).join("");
    if (label && label !== "?") note.label = label;
    if (Object.keys(note).length) out.note = note;
  }
  if (anim.emphasis && EMPHASES.some((e) => e.id === anim.emphasis)) out.emphasis = anim.emphasis;
  return out.reveal || out.emphasis ? out : undefined;
}

/** 새 베일: (cx, cy)가 가운데, 페이지 밖으로 나가지 않게 */
export function newVeil(cx: number, cy: number, color = VEIL_COLORS[0]): TextBox {
  return {
    id: newId("b"),
    x: clamp(cx - VEIL_W / 2, 0, 1 - VEIL_W),
    y: clamp(cy - VEIL_H / 2, 0, 1 - VEIL_H),
    w: VEIL_W,
    h: VEIL_H,
    text: "",
    size: 24,
    color: "#ffffff",
    veil: { color },
  };
}

/** 베일 위에 보이는 글 */
export function veilLabel(b: Pick<TextBox, "text">): string {
  return b.text.trim() || "?";
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
