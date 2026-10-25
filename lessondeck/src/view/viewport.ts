// 손가락 확대·이동 계산 (DOM과 무관한 순수 함수)
//
// 페이지는 페이지 영역 가운데에 놓이고, 그 위에 translate(tx, ty) scale(z)를 건다 (transform-origin: 0 0).
// 화면 점 S = 기준 위치 b + t + z × (페이지 안의 점 P)

export interface View {
  z: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
/** 확대한 페이지를 끌 때 가장자리 바깥으로 더 보여 줄 여백 */
const EDGE = 24;

export const identity: View = { z: 1, tx: 0, ty: 0 };

function clampAxis(size: number, avail: number, t: number, z: number): number {
  const base = (avail - size) / 2;
  const scaled = size * z;
  if (scaled <= avail) return (avail - scaled) / 2 - base;
  const min = avail - scaled - base - EDGE;
  const max = -base + EDGE;
  return Math.min(max, Math.max(min, t));
}

/** 배율 범위를 지키고, 페이지가 화면 밖으로 날아가지 않게 이동량을 제한한다 */
export function clampView(v: View, page: Size, area: Size): View {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z));
  return {
    z,
    tx: clampAxis(page.width, area.width, v.tx, z),
    ty: clampAxis(page.height, area.height, v.ty, z),
  };
}

/** 화면의 한 점(focus, 페이지 영역 기준 좌표)을 고정한 채 배율을 바꾼다 */
export function zoomAt(start: View, focusStart: { x: number; y: number }, focus: { x: number; y: number }, z: number, page: Size, area: Size): View {
  const bx = (area.width - page.width) / 2;
  const by = (area.height - page.height) / 2;
  const px = (focusStart.x - bx - start.tx) / start.z;
  const py = (focusStart.y - by - start.ty) / start.z;
  return clampView({ z, tx: focus.x - bx - z * px, ty: focus.y - by - z * py }, page, area);
}
