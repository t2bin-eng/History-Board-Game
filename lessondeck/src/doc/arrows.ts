import { headParts } from "../ink/arrowHeads";
import type { ArrowHead } from "../ink/types";
import { parseHex, luminance } from "./colors";
import { newId, type BoxArrow, type Page } from "./types";

// 상자 잇는 화살표 (SPEC 5장 arrows): 페이지 목록을 받아 새 목록을 돌려주는 순수 함수와 그리기 계산.

export function arrowsOf(page: Page | undefined): BoxArrow[] {
  return page?.arrows ?? [];
}

function mapArrows(pages: Page[], pageId: string, fn: (arrows: BoxArrow[]) => BoxArrow[]): Page[] {
  return pages.map((p) => (p.id === pageId ? { ...p, arrows: fn(p.arrows ?? []) } : p));
}

/** 화살표 끝: 상자 id 또는 가리키는 곳 [x, y] (페이지 대비 0~1) */
export type ArrowTarget = string | [number, number];

/** 아무 곳을 가리키는 끝은 페이지 안으로 (소수 넷째 자리) */
function clampAt([x, y]: [number, number]): [number, number] {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
  return [c(x), c(y)];
}

/**
 * from 상자에서 화살표를 낸다. 끝은 다른 상자(to) 또는 아무 곳(at, v0.24).
 * 같은 상자끼리·없는 상자는 안 되고, 같은 두 상자를 같은 방향으로 이은 것이 있으면 그것
 */
export function addArrow(
  pages: Page[],
  pageId: string,
  from: string,
  target: ArrowTarget,
  color: string,
  id: string = newId("a"),
): { pages: Page[]; id: string | null } {
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { pages, id: null };
  const boxes = page.boxes ?? [];
  if (!boxes.some((b) => b.id === from)) return { pages, id: null };
  let arrow: BoxArrow;
  if (typeof target === "string") {
    if (target === from || !boxes.some((b) => b.id === target)) return { pages, id: null };
    const same = arrowsOf(page).find((a) => a.from === from && a.to === target);
    if (same) return { pages, id: same.id };
    arrow = { id, from, to: target, color: arrowColor(color) };
  } else {
    arrow = { id, from, at: clampAt(target), color: arrowColor(color) };
  }
  return { pages: mapArrows(pages, pageId, (list) => [...list, arrow]), id: arrow.id };
}

/** 화살 끝을 옮긴다: 다른 상자에 붙이거나 아무 곳으로 (시작 상자에는 안 붙음) */
export function moveArrowEnd(pages: Page[], pageId: string, id: string, target: ArrowTarget): Page[] {
  return mapArrows(pages, pageId, (list) =>
    list.map((a) => {
      if (a.id !== id) return a;
      const { to: _to, at: _at, ...rest } = a;
      if (typeof target === "string") return target === a.from ? a : { ...rest, to: target };
      return { ...rest, at: clampAt(target) };
    }),
  );
}

/** 휜 정도: 거의 곧으면 곧게(없앰), 너무 휘지 않게 */
export function cleanBend(bend: number): number | undefined {
  if (!Number.isFinite(bend) || Math.abs(bend) < 0.03) return undefined;
  return Math.round(Math.max(-0.8, Math.min(0.8, bend)) * 1000) / 1000;
}

/** 흰 종이 위에서 안 보이는 아주 밝은 색(흰 글자 등)은 검정으로 */
export function arrowColor(color: string): string {
  const rgb = parseHex(color);
  return rgb && luminance(rgb) > 0.75 ? "#111111" : color;
}

export function patchArrow(pages: Page[], pageId: string, id: string, patch: Partial<Omit<BoxArrow, "id">>): Page[] {
  return mapArrows(pages, pageId, (list) =>
    list.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a, ...patch };
      // 곧게 되면 bend를 빼 둔다 (0.23까지와 같은 모양). 기본 촉(삼각형)도 빼 둔다
      if ("bend" in patch && next.bend === undefined) delete next.bend;
      if ("head" in patch && (next.head === undefined || next.head === "tri")) delete next.head;
      return next;
    }),
  );
}

export function removeArrow(pages: Page[], pageId: string, id: string): Page[] {
  return mapArrows(pages, pageId, (list) => list.filter((a) => a.id !== id));
}

/**
 * 방향 바꾸기: 상자끼리 이은 것은 두 상자를 맞바꾸고(휜 쪽도 그대로 보이게 bend 부호를 바꾼다),
 * 아무 곳을 가리키는 것은 촉을 상자 쪽으로 (rev, v0.30 — 가리키는 곳에서 상자로 들어오는 화살표)
 */
export function flipArrow(pages: Page[], pageId: string, id: string): Page[] {
  return mapArrows(pages, pageId, (list) =>
    list.map((a) => {
      if (a.id !== id) return a;
      if (a.to) return { ...a, from: a.to, to: a.from, ...(a.bend ? { bend: -a.bend } : {}) };
      if (a.rev) {
        const { rev: _rev, ...rest } = a;
        return rest;
      }
      return { ...a, rev: true };
    }),
  );
}

/** 상자를 지울 때: 그 상자에 닿은 화살표도 */
export function dropArrowsOf(page: Page, boxId: string): Page {
  if (!page.arrows?.some((a) => a.from === boxId || a.to === boxId)) return page;
  return { ...page, arrows: page.arrows.filter((a) => a.from !== boxId && a.to !== boxId) };
}

/** 상자를 새 id로 복사할 때 화살표도 (한쪽 상자가 없으면 버림) */
export function remapArrows(arrows: BoxArrow[] | undefined, idMap: Map<string, string>): BoxArrow[] | undefined {
  if (!arrows?.length) return undefined;
  const out = arrows.flatMap((a): BoxArrow[] => {
    const from = idMap.get(a.from);
    if (!from) return [];
    // 아무 곳을 가리키는 화살표는 시작 상자만 있으면 따라간다
    if (!a.to) return a.at ? [{ ...a, id: newId("a"), from }] : [];
    const to = idMap.get(a.to);
    return to ? [{ ...a, id: newId("a"), from, to }] : [];
  });
  return out.length ? out : undefined;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = [number, number];

export interface ArrowShape {
  /** 몸통: 2차 베지어 [시작, 조절점, 끝] (페이지 px). 곧으면 조절점이 가운데 */
  curve: [Pt, Pt, Pt];
  /** 화살촉 (v0.30 촉 모양): 선으로 그을 것 · 채울 면 */
  heads: { lines: Pt[][]; fills: Pt[][] };
  /** 끝(촉 끝 쪽)에서 곡선이 나가는 방향 (단위 벡터) — 끝 손잡이 자리 */
  endDir: Pt;
  /** 화살 끝(촉 끝) — 끝 손잡이 자리 */
  tip: Pt;
  /** 곡선 가운데 (상자 가운데 → 끝 곡선의 t = 0.5) — 휘기 손잡이·막대 자리 */
  mid: Pt;
}

const inRect = (r: Rect, [x, y]: Pt) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

function quad(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
}

function quadTangent(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return [2 * u * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), 2 * u * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])];
}

/** t0~t1 부분의 2차 베지어 조절점 (blossom) */
function subControl(p0: Pt, c: Pt, p1: Pt, t0: number, t1: number): Pt {
  const a = (1 - t0) * (1 - t1);
  const b = (1 - t0) * t1 + t0 * (1 - t1);
  const d = t0 * t1;
  return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]];
}

/** 곡선이 사각형 경계를 지나는 t (lo는 inside 쪽, hi는 반대쪽) */
function crossing(p0: Pt, c: Pt, p1: Pt, r: Rect, lo: number, hi: number): number {
  const loInside = inRect(r, quad(p0, c, p1, lo));
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (inRect(r, quad(p0, c, p1, m)) === loInside) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** 곡선 위에서 t에서 거리 dist만큼 (dir = +1 앞, -1 뒤) 떨어진 t (짧은 거리용) */
function stepAlong(p0: Pt, c: Pt, p1: Pt, t: number, dist: number, dir: 1 | -1): number {
  const [dx, dy] = quadTangent(p0, c, p1, t);
  const speed = Math.hypot(dx, dy) || 1;
  return t + (dir * dist) / speed;
}

/** 모서리에서 이만큼(상자 크기의 15%, 10~24px) 안쪽까지만 화살표가 붙는다 — 모서리에 딱 붙으면 상자와 겹쳐 보임 */
const CORNER_INSET = 0.15;
const CORNER_MIN = 10;
const CORNER_MAX = 24;

/**
 * 상자 테두리에서 t(점) 쪽을 보는 자리 (v0.47.2): t 쪽을 보는 변 위에서, 그 변을 따라 t에 가장 가까운 점
 * (모서리 가까이는 피함). 0.47.1까지는 늘 상자 가운데에서 나가 휘면 상자를 다시 가로질렀다
 */
export function borderAnchor(r: Rect, [tx, ty]: Pt): Pt {
  const ix = Math.min(r.w / 2, Math.max(CORNER_MIN, Math.min(r.w * CORNER_INSET, CORNER_MAX)));
  const iy = Math.min(r.h / 2, Math.max(CORNER_MIN, Math.min(r.h * CORNER_INSET, CORNER_MAX)));
  const cx = Math.min(r.x + r.w - ix, Math.max(r.x + ix, tx));
  const cy = Math.min(r.y + r.h - iy, Math.max(r.y + iy, ty));
  // 변 고르기: 상자 가운데에서 t로 가는 방향을 상자 크기로 나눠 견줌 (가로로 넓은 상자도 위·아래에 있는 것은 위·아래 변)
  const nx = (tx - (r.x + r.w / 2)) / Math.max(1, r.w / 2);
  const ny = (ty - (r.y + r.h / 2)) / Math.max(1, r.h / 2);
  if (Math.abs(nx) > Math.abs(ny)) return nx < 0 ? [r.x, cy] : [r.x + r.w, cy];
  return ny < 0 ? [cx, r.y] : [cx, r.y + r.h];
}

/** 화살표 곡선의 두 끝 (휘기의 기준이 되는 곧은 선): 시작 상자 테두리 → 끝 상자 테두리(또는 가리키는 점). 끝이 시작 상자 안이면 null */
export function arrowChord(a: Rect, target: Rect | Pt): [Pt, Pt] | null {
  const toRect = Array.isArray(target) ? null : target;
  const aim: Pt = toRect ? [toRect.x + toRect.w / 2, toRect.y + toRect.h / 2] : (target as Pt);
  if (inRect(a, aim)) return null;
  // 겹친 두 상자는 잇지 않는다
  if (toRect && toRect.x < a.x + a.w && a.x < toRect.x + toRect.w && toRect.y < a.y + a.h && a.y < toRect.y + toRect.h) return null;
  const p0 = borderAnchor(a, aim);
  const p1 = toRect ? borderAnchor(toRect, p0) : aim;
  return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1 ? null : [p0, p1];
}

/**
 * 화살표 모양 (페이지 px). a: 시작 상자, target: 끝 상자 또는 가리키는 점, lineW: 선 굵기(px), bend: 휜 정도.
 * 시작 상자 테두리의 끝 쪽 자리 → 끝(상자면 그 테두리, 점이면 그 점)을 잇는 2차 베지어 (arrowChord).
 * 휘어 상자 안으로 들어갔다 나오면 나온 뒤부터, 두 끝은 상자에서 조금 띄운다. 끝이 시작 상자 안이거나 남는 길이가 없으면 null
 */
export function arrowShape(
  a: Rect,
  target: Rect | Pt,
  lineW: number,
  both = false,
  bend = 0,
  head: ArrowHead = "tri",
  rev = false,
): ArrowShape | null {
  const chord = arrowChord(a, target);
  if (!chord) return null;
  const toRect = Array.isArray(target) ? null : target;
  const [p0, p1] = chord;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  // 조절점: 곧은 선 가운데에서 (가는 방향의 오른쪽 = (-dy, dx)) 2 × bend × 길이
  const nx = -dy / len;
  const ny = dx / len;
  const c: Pt = [(p0[0] + p1[0]) / 2 + nx * 2 * bend * len, (p0[1] + p1[1]) / 2 + ny * 2 * bend * len];
  const gap = Math.max(3, lineW * 1.5);
  // 시작: 앞쪽 절반에서 곡선이 시작 상자 안에 있는 마지막 자리 (휘어 상자 안으로 들어갔다 나오는 경우) 뒤부터
  let tA = 0;
  for (let i = 1; i <= 32; i++) if (inRect(a, quad(p0, c, p1, i / 64))) tA = i / 64;
  if (tA > 0) tA = crossing(p0, c, p1, a, tA, Math.min(1, tA + 1 / 64));
  let t0 = stepAlong(p0, c, p1, tA, gap, 1);
  let t1 = 1;
  if (toRect) {
    // 끝: 뒤쪽 절반에서 곡선이 끝 상자에 처음 들어가는 자리 앞까지
    let tB = 1;
    for (let i = 32; i <= 63; i++) {
      if (inRect(toRect, quad(p0, c, p1, i / 64))) {
        tB = i / 64;
        break;
      }
    }
    if (tB < 1) tB = crossing(p0, c, p1, toRect, tB, Math.max(0, tB - 1 / 64));
    t1 = stepAlong(p0, c, p1, tB, gap, -1);
  }
  if (t1 - t0 < 0.02) return null;
  const headLen = Math.max(8, lineW * 4.2);
  const tipAt = (t: number, sign: 1 | -1): { tip: Pt; dir: Pt } => {
    const [tx, ty] = quadTangent(p0, c, p1, t);
    const l = Math.hypot(tx, ty) || 1;
    return { tip: quad(p0, c, p1, t), dir: [(sign * tx) / l, (sign * ty) / l] };
  };
  const end = tipAt(t1, 1);
  const start = tipAt(t0, -1);
  // 촉: 끝(rev가 아니거나 양쪽) · 시작(양쪽이거나 rev)
  const atEnd = !rev || both;
  const atStart = both || rev;
  const heads: { lines: Pt[][]; fills: Pt[][] } = { lines: [], fills: [] };
  let insetEnd = 0;
  let insetStart = 0;
  if (atEnd) {
    const h = headParts(head, end.tip, end.dir, headLen, lineW);
    heads.lines.push(...h.lines);
    heads.fills.push(...h.fills);
    insetEnd = h.inset;
  }
  if (atStart) {
    const h = headParts(head, start.tip, start.dir, headLen, lineW);
    heads.lines.push(...h.lines);
    heads.fills.push(...h.fills);
    insetStart = h.inset;
  }
  // 선은 채운 촉 안쪽까지만 (촉 끝이 뭉툭해지지 않게)
  const s1 = insetEnd ? Math.max(t0, stepAlong(p0, c, p1, t1, insetEnd, -1)) : t1;
  const s0 = insetStart ? Math.min(s1, stepAlong(p0, c, p1, t0, insetStart, 1)) : t0;
  return {
    curve: [quad(p0, c, p1, s0), subControl(p0, c, p1, s0, s1), quad(p0, c, p1, s1)],
    heads,
    endDir: end.dir,
    tip: end.tip,
    mid: quad(p0, c, p1, 0.5),
  };
}

/** 휘기 손잡이를 (x, y)(페이지 px)로 끌었을 때의 bend: 시작 상자 가운데 p0 → 끝 p1 */
export function bendFromHandle(p0: Pt, p1: Pt, x: number, y: number): number {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy) || 1;
  // 곡선 가운데(t=0.5)는 곧은 선 가운데에서 bend × 길이만큼 옆
  return ((x - (p0[0] + p1[0]) / 2) * -dy + (y - (p0[1] + p1[1]) / 2) * dx) / (len * len);
}

/** 2차 베지어 몸통의 SVG path */
export function arrowPathD(s: ArrowShape): string {
  const [[x0, y0], [cx, cy], [x1, y1]] = s.curve;
  return `M${x0.toFixed(1)},${y0.toFixed(1)}Q${cx.toFixed(1)},${cy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

/** 화살표의 시작 상자 자리와 끝(상자 자리 또는 점, 페이지 px). 상자가 없거나 끝이 없으면 null */
export function arrowEnds(
  a: BoxArrow,
  rects: Map<string, Rect>,
  size: { width: number; height: number },
): { from: Rect; target: Rect | Pt } | null {
  const from = rects.get(a.from);
  if (!from) return null;
  if (a.to) {
    const to = rects.get(a.to);
    return to ? { from, target: to } : null;
  }
  return a.at ? { from, target: [a.at[0] * size.width, a.at[1] * size.height] } : null;
}

/** 이 화살표의 모양 (그릴 수 없으면 null) */
export function shapeOfArrow(
  a: BoxArrow,
  rects: Map<string, Rect>,
  size: { width: number; height: number },
  lineW: number,
): ArrowShape | null {
  const ends = arrowEnds(a, rects, size);
  return ends ? arrowShape(ends.from, ends.target, lineW, a.both, a.bend ?? 0, a.head ?? "tri", !!a.rev) : null;
}
