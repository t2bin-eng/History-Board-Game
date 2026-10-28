import { cropOf, visibleAspect } from "../doc/stickers";
import type { Sticker } from "../doc/types";
import type { PageSize } from "../ink/geometry";

// 스티커 한 장의 화면 배치 (px). 화면(StickerLayer)·편집(StickerEditor)·썸네일(stickerPaint)이 같이 쓴다.
export interface StickerBox {
  /** 틀 왼쪽 위·크기 (돌리기 전) */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 가운데 */
  cx: number;
  cy: number;
  /** 라디안 */
  angle: number;
  /** 그림 전체 크기와, 틀 안에서 그림 왼쪽 위 위치 (자른 만큼 밖으로 나감) */
  imgW: number;
  imgH: number;
  imgLeft: number;
  imgTop: number;
  /** 모서리 둥글기 (px). 원이면 Infinity */
  radius: number;
  borderWidth: number;
}

/** 원본 크기를 모를 때(아직 받지 못한 그림)는 4:3으로 */
export function stickerBox(s: Sticker, natural: { width: number; height: number } | undefined, size: PageSize): StickerBox {
  const nw = natural?.width || 4;
  const nh = natural?.height || 3;
  const c = cropOf(s);
  const width = s.w * size.width;
  const height = width / visibleAspect(s, nw, nh);
  const left = s.x * size.width;
  const top = s.y * size.height;
  const imgW = width / c.w;
  const imgH = height / c.h;
  const radius = s.shape === "circle" ? Infinity : s.shape === "rounded" ? Math.min(width, height) * 0.12 : 0;
  return {
    left,
    top,
    width,
    height,
    cx: left + width / 2,
    cy: top + height / 2,
    angle: ((s.rotation ?? 0) * Math.PI) / 180,
    imgW,
    imgH,
    imgLeft: -c.x * imgW,
    imgTop: -c.y * imgH,
    radius,
    borderWidth: s.border ? (s.border.width * size.width) / 1000 : 0,
  };
}

/** 돌린 틀을 감싸는 반쪽 너비·높이 (도구 막대 자리 잡기) */
export function rotatedExtent(b: StickerBox): { ex: number; ey: number } {
  const c = Math.abs(Math.cos(b.angle));
  const s = Math.abs(Math.sin(b.angle));
  return { ex: (b.width / 2) * c + (b.height / 2) * s, ey: (b.width / 2) * s + (b.height / 2) * c };
}

/** CSS 그림자: 테두리(굵은 흰 테두리 = 스티커)와 그림자 */
export function stickerShadow(s: Sticker, b: StickerBox, pageWidth: number): string | undefined {
  const parts: string[] = [];
  if (s.border && b.borderWidth > 0) parts.push(`0 0 0 ${b.borderWidth}px ${s.border.color}`);
  if (s.shadow) {
    const k = pageWidth / 1000;
    parts.push(`0 ${Math.max(1, 5 * k)}px ${Math.max(2, 16 * k)}px rgba(0, 0, 0, 0.38)`);
  }
  return parts.length ? parts.join(", ") : undefined;
}
