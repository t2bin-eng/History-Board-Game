import { newId, type Page, type Sticker } from "./types";

// 이미지 스티커 (SPEC 5장 stickers). 페이지 목록을 받아 새 목록을 돌려주는 순수 함수와 크기 계산만 둔다.

export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };
/** 가장 작은 스티커 폭 (페이지 가로 대비) */
export const MIN_STICKER_W = 0.03;
/** 가장 작게 자를 수 있는 부분 (그림 대비) */
export const MIN_CROP = 0.05;

/** 꾸미기 고르기 */
export const STICKER_BORDER_COLORS = ["#ffffff", "#1a1a1a", "#d32f2f", "#1565c0", "#f9a825", "#2e7d32"];
export const STICKER_BORDER_WIDTHS = [4, 10, 18];

export function stickersOf(page: Page | undefined): Sticker[] {
  return page?.stickers ?? [];
}

export function cropOf(s: Sticker) {
  return s.crop ?? FULL_CROP;
}

/** 보이는 부분의 가로÷세로 (그림 원래 크기와 자른 부분으로) */
export function visibleAspect(s: Sticker, imgW: number, imgH: number): number {
  const c = cropOf(s);
  const w = Math.max(1, imgW) * c.w;
  const h = Math.max(1, imgH) * c.h;
  return w / h;
}

/** 스티커 틀 높이 (페이지 세로 대비). pageAspect = 페이지 가로÷세로 */
export function stickerHeight(s: Sticker, imgW: number, imgH: number, pageAspect: number): number {
  return (s.w * pageAspect) / visibleAspect(s, imgW, imgH);
}

/**
 * 새 스티커: 페이지 가로·세로의 40% 안에 들어가는 크기, at이 있으면 그 점이 가운데, 없으면 페이지 가운데.
 * index: 여러 장을 한 번에 넣을 때 조금씩 비켜 놓는다
 */
export function newSticker(asset: string, imgW: number, imgH: number, pageAspect: number, at?: { x: number; y: number }, index = 0): Sticker {
  const ia = Math.max(1, imgW) / Math.max(1, imgH);
  // 폭 w일 때 높이(세로 대비) = w * pageAspect / ia
  let w = 0.4;
  const h = (w * pageAspect) / ia;
  if (h > 0.4) w = (0.4 * ia) / pageAspect;
  w = Math.max(MIN_STICKER_W, Math.min(0.9, w));
  const hh = (w * pageAspect) / ia;
  const cx = (at?.x ?? 0.5) + index * 0.04;
  const cy = (at?.y ?? 0.5) + index * 0.04;
  return {
    id: newId("s"),
    asset,
    x: clamp(cx - w / 2, 0, 1 - w),
    y: clamp(cy - hh / 2, 0, Math.max(0, 1 - hh)),
    w,
  };
}

function mapStickers(pages: Page[], pageId: string, fn: (list: Sticker[]) => Sticker[]): Page[] {
  return pages.map((p) => (p.id === pageId ? { ...p, stickers: fn(p.stickers ?? []) } : p));
}

export function addStickers(pages: Page[], pageId: string, added: Sticker[]): Page[] {
  return mapStickers(pages, pageId, (list) => [...list, ...added]);
}

export function patchSticker(pages: Page[], pageId: string, id: string, patch: Partial<Omit<Sticker, "id">>): Page[] {
  return mapStickers(pages, pageId, (list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function removeSticker(pages: Page[], pageId: string, id: string): Page[] {
  return mapStickers(pages, pageId, (list) => list.filter((s) => s.id !== id));
}

/** 맨 앞(위)으로 / 맨 뒤(아래)로 */
export function reorderSticker(pages: Page[], pageId: string, id: string, to: "front" | "back"): Page[] {
  return mapStickers(pages, pageId, (list) => {
    const s = list.find((x) => x.id === id);
    if (!s) return list;
    const rest = list.filter((x) => x.id !== id);
    return to === "front" ? [...rest, s] : [s, ...rest];
  });
}

/** 페이지를 복제할 때: 새 id로 */
export function copyStickers(list: Sticker[] | undefined, assetMap: Record<string, string> = {}): Sticker[] | undefined {
  return list?.map((s) => ({
    ...s,
    id: newId("s"),
    asset: assetMap[s.asset] ?? s.asset,
  }));
}

/**
 * 붙이기: 새 id, 같은 자리(이미 스티커가 있으면 조금씩 비켜서). at이 있으면 첫 스티커의 가운데를 그 점에.
 * assetMap: 다른 문서에 붙일 때 바뀐 원본 id
 */
export function placePasted(
  existing: Sticker[],
  clip: Sticker[],
  assetMap: Record<string, string>,
  at?: { x: number; y: number },
  heights?: number[],
): Sticker[] {
  const first = clip[0];
  const dx = at && first ? at.x - (first.x + first.w / 2) : 0;
  const dy = at && first ? at.y - (first.y + (heights?.[0] ?? 0) / 2) : 0;
  const placed: Sticker[] = [];
  for (const src of clip) {
    let x = clamp(src.x + dx, -src.w / 2, 1 - src.w / 2);
    let y = clamp(src.y + dy, -0.1, 0.95);
    const taken = [...existing, ...placed];
    for (let k = 0; k < 30 && taken.some((t) => Math.abs(t.x - x) < 0.01 && Math.abs(t.y - y) < 0.01); k++) {
      x = Math.min(0.9, x + 0.03);
      y = Math.min(0.92, y + 0.03);
    }
    placed.push({
      ...src,
      id: newId("s"),
      asset: assetMap[src.asset] ?? src.asset,
      x,
      y,
    });
  }
  return placed;
}

/**
 * 자르기를 끝낼 때: 그림이 화면에서 제자리에 남도록 새 틀 위치·폭을 구한다 (돌린 스티커 포함).
 * 모든 길이는 화면 px. 돌려주는 x·y·w는 페이지 대비.
 */
export function applyCrop(
  s: Sticker,
  next: { x: number; y: number; w: number; h: number },
  page: { width: number; height: number },
  imgW: number,
  imgH: number,
): Pick<Sticker, "x" | "y" | "w" | "crop"> {
  const c = cropOf(s);
  const fw = s.w * page.width;
  const fh = fw / visibleAspect(s, imgW, imgH);
  // 그림 전체 크기 (화면 px)
  const FW = fw / c.w;
  const FH = fh / c.h;
  // 틀 가운데를 원점으로 한 (돌리기 전) 좌표에서 새 부분의 가운데
  const lx = -fw / 2 - c.x * FW + (next.x + next.w / 2) * FW;
  const ly = -fh / 2 - c.y * FH + (next.y + next.h / 2) * FH;
  const t = ((s.rotation ?? 0) * Math.PI) / 180;
  const cx = s.x * page.width + fw / 2 + lx * Math.cos(t) - ly * Math.sin(t);
  const cy = s.y * page.height + fh / 2 + lx * Math.sin(t) + ly * Math.cos(t);
  const nw = next.w * FW;
  const nh = next.h * FH;
  const full = next.x <= 0 && next.y <= 0 && next.w >= 1 && next.h >= 1;
  return {
    x: (cx - nw / 2) / page.width,
    y: (cy - nh / 2) / page.height,
    w: Math.max(MIN_STICKER_W, nw / page.width),
    crop: full ? undefined : next,
  };
}

/** 자르는 부분을 그림 안에, 최소 크기 이상으로 */
export function clampCrop(c: { x: number; y: number; w: number; h: number }) {
  const w = clamp(c.w, MIN_CROP, 1);
  const h = clamp(c.h, MIN_CROP, 1);
  return { x: clamp(c.x, 0, 1 - w), y: clamp(c.y, 0, 1 - h), w, h };
}

/** 돌리기: 15° 단위 가까이면 붙인다. -180~180 */
export function snapAngle(deg: number): number {
  let a = ((((deg + 180) % 360) + 360) % 360) - 180;
  const near = Math.round(a / 15) * 15;
  if (Math.abs(a - near) < 4) a = near;
  return a === -180 ? 180 : a;
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
