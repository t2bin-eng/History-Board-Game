// 이어 보기 (v0.44, SPEC 6장 "이어 보기"): 페이지를 세로로 이어 붙인 띠의 자리 계산과 스크롤·확대 (DOM과 무관한 순수 함수)
//
// 띠 좌표(배율 1의 CSS px): 페이지는 x 0~width, 위에서부터 차례로 gap만큼 띄워 놓인다.
// 화면 = (띠 좌표 − (x, y)) × z. 즉 (x, y)는 페이지 영역 왼쪽 위에 보이는 띠 좌표다.

export interface Size {
  width: number;
  height: number;
}

export interface Slot {
  id: string;
  top: number;
  height: number;
}

export interface StripLayout {
  /** 페이지 폭 (배율 1) */
  width: number;
  slots: Slot[];
  /** 띠 전체 높이 (맨 아래 새 페이지 자리 포함) */
  total: number;
}

export interface ScrollPos {
  z: number;
  x: number;
  y: number;
}

/** 페이지 사이 · 위 여백 (배율 1 px) */
export const STRIP_GAP = 20;
export const STRIP_TOP = 16;
/** 맨 아래 "새 페이지" 자리 높이 */
export const STRIP_TAIL = 112;
/** 페이지 폭 상한: 아주 넓은 화면에서 A4가 지나치게 커지지 않게 */
export const STRIP_MAX_WIDTH = 1280;
export const SCROLL_MIN_ZOOM = 0.5;
export const SCROLL_MAX_ZOOM = 4;
/** 확대했을 때 가로로 끌면 가장자리 밖으로 더 보여 줄 여백 (화면 px) */
const EDGE = 24;

/** 페이지 폭: 영역 폭에서 양쪽 여백을 뺀 만큼 (상한까지) */
export function stripWidth(area: Size, margin: number): number {
  return Math.max(0, Math.min(STRIP_MAX_WIDTH, Math.floor(area.width - margin * 2)));
}

/** aspect = 가로 ÷ 세로 */
export function layoutStrip(pages: { id: string; aspect: number }[], width: number): StripLayout {
  const slots: Slot[] = [];
  let y = STRIP_TOP;
  for (const p of pages) {
    const height = Math.max(1, Math.round(width / (p.aspect > 0 ? p.aspect : 1)));
    slots.push({ id: p.id, top: y, height });
    y += height + STRIP_GAP;
  }
  return { width, slots, total: y - STRIP_GAP + STRIP_TAIL };
}

/** 가장 아래로 스크롤할 수 있는 y (띠가 화면보다 짧으면 0) */
export function maxScrollY(layout: StripLayout, area: Size, z: number): number {
  return Math.max(0, layout.total - area.height / z);
}

/** 배율 범위, 가로(좁으면 가운데·넓으면 가장자리까지), 세로(위·아래 끝) 안으로 */
export function clampScroll(v: ScrollPos, layout: StripLayout, area: Size): ScrollPos {
  const z = Math.min(SCROLL_MAX_ZOOM, Math.max(SCROLL_MIN_ZOOM, v.z));
  const viewW = area.width / z;
  let x: number;
  if (layout.width <= viewW) x = -(viewW - layout.width) / 2;
  else x = Math.min(layout.width - viewW + EDGE / z, Math.max(-EDGE / z, v.x));
  const y = Math.min(maxScrollY(layout, area, z), Math.max(0, v.y));
  return { z, x, y };
}

/**
 * 두 손가락 확대: 처음 가운데 m0(화면)에 있던 띠의 점이 지금 가운데 m1(화면)에 오도록, 배율 z1로.
 * 가로는 범위 안으로, 세로는 끝을 넘을 수 있다(놓으면 clampScroll)
 */
export function zoomScrollAt(v0: ScrollPos, m0: { x: number; y: number }, m1: { x: number; y: number }, z1: number, layout: StripLayout, area: Size): ScrollPos {
  const z = Math.min(SCROLL_MAX_ZOOM, Math.max(SCROLL_MIN_ZOOM, z1));
  const cx = v0.x + m0.x / v0.z;
  const cy = v0.y + m0.y / v0.z;
  const next = { z, x: cx - m1.x / z, y: cy - m1.y / z };
  const c = clampScroll(next, layout, area);
  return { z: c.z, x: c.x, y: next.y };
}

/** 띠 좌표 y에 있는 페이지 (사이 틈이면 가까운 쪽) */
export function slotAt(layout: StripLayout, y: number): Slot | null {
  let best: Slot | null = null;
  let bestD = Infinity;
  for (const s of layout.slots) {
    if (y >= s.top && y <= s.top + s.height) return s;
    const d = y < s.top ? s.top - y : y - (s.top + s.height);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** 지금 페이지로 볼 곳: 화면 위에서 35% 높이에 걸친 페이지 */
export function currentSlot(layout: StripLayout, v: ScrollPos, area: Size): Slot | null {
  return slotAt(layout, v.y + (area.height / v.z) * 0.35);
}

/** 그릴 페이지: 화면에 보이는 것과 위·아래로 화면 margin배 안 (많아야 max개, 가운데부터) */
export function slotsToRender(layout: StripLayout, v: ScrollPos, area: Size, margin = 0.5, max = 6): string[] {
  const viewH = area.height / v.z;
  const top = v.y - viewH * margin;
  const bottom = v.y + viewH * (1 + margin);
  const mid = v.y + viewH / 2;
  return layout.slots
    .filter((s) => s.top + s.height >= top && s.top <= bottom)
    .sort((a, b) => Math.abs(a.top + a.height / 2 - mid) - Math.abs(b.top + b.height / 2 - mid))
    .slice(0, max)
    .map((s) => s.id);
}

/** 이 페이지가 보이게: 위 끝을 화면 위에서 조금 아래로 (끝은 범위 안으로) */
export function scrollToSlot(layout: StripLayout, v: ScrollPos, area: Size, id: string): ScrollPos {
  const s = layout.slots.find((x) => x.id === id);
  if (!s) return v;
  return clampScroll({ ...v, y: s.top - STRIP_TOP }, layout, area);
}
