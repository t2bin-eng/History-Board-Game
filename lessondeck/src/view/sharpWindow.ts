// 선명한 창 (v0.50, SPEC 6장 "확대한 필기·PDF"): 페이지 전체 캔버스는 픽셀 수 상한 때문에 크게 확대하면 흐려진다.
// 그때 지금 화면에 보이는 자리(+ 둘레 여유)만 실제 배율로 따로 그려 위에 덮는다. 필기(InkCanvas)와 PDF(PdfPageView)가 같이 쓴다.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 페이지 px 자리·크기(x, y, w, h), 배율 s(페이지 px당 캔버스 픽셀), 그 창을 잡을 때 보이던 자리 */
export interface SharpWindow extends Rect {
  s: number;
  visible: Rect;
}

/** 원하는 배율이 전체 캔버스 배율보다 이만큼 넘게 클 때만 선명한 창을 쓴다 */
export const SHARP_MIN_GAIN = 1.15;

/**
 * 지금 화면에 보이는 이 페이지 자리(페이지 px)와 그 둘레 여유로 창을 잡는다. 보이지 않으면 null.
 * el: 페이지와 같은 크기의 요소(확대·이동된 채로), page: 페이지 CSS 크기, want: 원하는 배율, budget: 창 한 장의 픽셀 수 상한
 */
export function sharpWindow(el: HTMLElement, page: { width: number; height: number }, want: number, budget: number): SharpWindow | null {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const area = el.closest(".page-area")?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const left = Math.max(r.left, area.left);
  const top = Math.max(r.top, area.top);
  const right = Math.min(r.right, area.right);
  const bottom = Math.min(r.bottom, area.bottom);
  if (right - left < 1 || bottom - top < 1) return null;
  const kx = page.width / r.width;
  const ky = page.height / r.height;
  const visible = { x: (left - r.left) * kx, y: (top - r.top) * ky, w: (right - left) * kx, h: (bottom - top) * ky };
  return windowAround(visible, page, want, budget);
}

/** 보이는 자리 둘레로 여유를 두어 창을 정한다 (상한 안에서, 한쪽에 보이는 폭의 절반까지) */
export function windowAround(visible: Rect, page: { width: number; height: number }, want: number, budget: number): SharpWindow {
  const visPx = visible.w * visible.h * want * want;
  const m = Math.max(0, Math.min(0.5, (Math.sqrt(budget / Math.max(1, visPx)) - 1) / 2));
  const x = Math.max(0, visible.x - visible.w * m);
  const y = Math.max(0, visible.y - visible.h * m);
  const w = Math.min(page.width, visible.x + visible.w * (1 + m)) - x;
  const h = Math.min(page.height, visible.y + visible.h * (1 + m)) - y;
  let s = want;
  if (w * h * s * s > budget) s = Math.sqrt(budget / (w * h));
  return { x, y, w, h, s, visible };
}

/** 창이 그 자리를 다 덮는지 (조금 옮겨도 다시 그리지 않으려고) */
export function contains(win: Rect, r: Rect): boolean {
  const e = 0.5;
  return r.x >= win.x - e && r.y >= win.y - e && r.x + r.w <= win.x + win.w + e && r.y + r.h <= win.y + win.h + e;
}
