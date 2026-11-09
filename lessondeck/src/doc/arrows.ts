import { parseHex, luminance } from "./colors";
import { newId, type BoxArrow, type Page } from "./types";

// 상자 잇는 화살표 (SPEC 5장 arrows): 페이지 목록을 받아 새 목록을 돌려주는 순수 함수와 그리기 계산.

export function arrowsOf(page: Page | undefined): BoxArrow[] {
  return page?.arrows ?? [];
}

function mapArrows(pages: Page[], pageId: string, fn: (arrows: BoxArrow[]) => BoxArrow[]): Page[] {
  return pages.map((p) => (p.id === pageId ? { ...p, arrows: fn(p.arrows ?? []) } : p));
}

/** from 상자에서 to 상자로 잇는다. 같은 상자끼리나 이미 같은 방향으로 이어져 있으면 그대로 */
export function addArrow(
  pages: Page[],
  pageId: string,
  from: string,
  to: string,
  color: string,
  id: string = newId("a"),
): { pages: Page[]; id: string | null } {
  const page = pages.find((p) => p.id === pageId);
  if (!page || from === to) return { pages, id: null };
  const boxes = page.boxes ?? [];
  if (!boxes.some((b) => b.id === from) || !boxes.some((b) => b.id === to)) return { pages, id: null };
  const same = arrowsOf(page).find((a) => a.from === from && a.to === to);
  if (same) return { pages, id: same.id };
  const arrow: BoxArrow = { id, from, to, color: arrowColor(color) };
  return { pages: mapArrows(pages, pageId, (list) => [...list, arrow]), id: arrow.id };
}

/** 흰 종이 위에서 안 보이는 아주 밝은 색(흰 글자 등)은 검정으로 */
export function arrowColor(color: string): string {
  const rgb = parseHex(color);
  return rgb && luminance(rgb) > 0.75 ? "#111111" : color;
}

export function patchArrow(pages: Page[], pageId: string, id: string, patch: Partial<Omit<BoxArrow, "id">>): Page[] {
  return mapArrows(pages, pageId, (list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function removeArrow(pages: Page[], pageId: string, id: string): Page[] {
  return mapArrows(pages, pageId, (list) => list.filter((a) => a.id !== id));
}

/** 방향 바꾸기 */
export function flipArrow(pages: Page[], pageId: string, id: string): Page[] {
  return mapArrows(pages, pageId, (list) => list.map((a) => (a.id === id ? { ...a, from: a.to, to: a.from } : a)));
}

/** 상자를 지울 때: 그 상자에 닿은 화살표도 */
export function dropArrowsOf(page: Page, boxId: string): Page {
  if (!page.arrows?.some((a) => a.from === boxId || a.to === boxId)) return page;
  return { ...page, arrows: page.arrows.filter((a) => a.from !== boxId && a.to !== boxId) };
}

/** 상자를 새 id로 복사할 때 화살표도 (한쪽 상자가 없으면 버림) */
export function remapArrows(arrows: BoxArrow[] | undefined, idMap: Map<string, string>): BoxArrow[] | undefined {
  if (!arrows?.length) return undefined;
  const out = arrows.flatMap((a) => {
    const from = idMap.get(a.from);
    const to = idMap.get(a.to);
    return from && to ? [{ ...a, id: newId("a"), from, to }] : [];
  });
  return out.length ? out : undefined;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrowShape {
  /** 선 (시작 x, y, 끝 x, y) */
  line: [number, number, number, number];
  /** 화살촉 삼각형들 */
  heads: [number, number][][];
}

/** 가운데에서 (dx, dy) 방향으로 나가는 반직선이 사각형 테두리와 만나는 곳까지의 비율 */
function exitScale(r: Rect, dx: number, dy: number): number {
  const sx = dx ? r.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? r.h / 2 / Math.abs(dy) : Infinity;
  return Math.min(sx, sy);
}

/**
 * 두 상자(페이지 px)를 잇는 화살표 모양. lineW는 선 굵기(px).
 * 가운데끼리 잇는 선을 각 상자 테두리에서 조금 띄워 자르고, 끝(양쪽이면 시작도)에 화살촉. 상자가 겹치면 null
 */
export function arrowShape(a: Rect, b: Rect, lineW: number, both = false): ArrowShape | null {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const gap = Math.max(3, lineW * 1.5);
  const t0 = exitScale(a, dx, dy) + gap / len;
  const t1 = 1 - exitScale(b, -dx, -dy) - gap / len;
  if (t1 - t0 < 0.02) return null;
  const x0 = ax + dx * t0;
  const y0 = ay + dy * t0;
  const x1 = ax + dx * t1;
  const y1 = ay + dy * t1;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.max(8, lineW * 4.2);
  const half = head * 0.55;
  const tip = (x: number, y: number, dirX: number, dirY: number): [number, number][] => [
    [x, y],
    [x - dirX * head - dirY * half, y - dirY * head + dirX * half],
    [x - dirX * head + dirY * half, y - dirY * head - dirX * half],
  ];
  const heads = [tip(x1, y1, ux, uy)];
  if (both) heads.push(tip(x0, y0, -ux, -uy));
  // 선은 화살촉 안쪽까지만 (촉 끝이 뭉툭해지지 않게)
  const inset = head * 0.6;
  const lx1 = x1 - ux * inset;
  const ly1 = y1 - uy * inset;
  const lx0 = both ? x0 + ux * inset : x0;
  const ly0 = both ? y0 + uy * inset : y0;
  return { line: [lx0, ly0, lx1, ly1], heads };
}
