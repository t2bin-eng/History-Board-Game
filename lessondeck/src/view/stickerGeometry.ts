import { cropOf, shownSticker, visibleAspect } from "../doc/stickers";
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
  // 둥근 모서리: 짧은 변의 20% (0.28.3까지 12%는 사진에서 잘 보이지 않았다)
  const radius = s.shape === "circle" ? Infinity : s.shape === "rounded" ? Math.min(width, height) * 0.2 : 0;
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

/** 페이지에 보이는 모양(팝업 그림은 아이콘, v0.27)의 배치 */
export function shownBox(s: Sticker, natural: { width: number; height: number } | undefined, size: PageSize): StickerBox {
  return stickerBox(shownSticker(s, natural?.width || 4, natural?.height || 3), natural, size);
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

type Box2 = { left: number; top: number; width: number; height: number };

function overlapArea(a: Box2, b: Box2): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * 꾸미기 창 자리 (v0.28.3): 스티커 틀(돌린 모양을 감싸는 네모)과 도구 막대를 가리지 않는 곳.
 * 막대 바깥쪽(막대가 틀 위면 그 위) → 틀 오른쪽 → 틀 왼쪽 → 틀 반대쪽 차례로 페이지 안에 다 들어가는 첫 자리,
 * 없으면 페이지 안으로 당겨 틀과 가장 덜 겹치는 자리. 0.28.2까지는 막대 바로 아래에 열어 막대가 틀 위일 때 그림을 덮었다
 */
export function placeStylePanel(frame: Box2, toolbar: Box2, panel: { width: number; height: number }, page: { width: number; height: number }): { left: number; top: number } {
  const GAP = 10;
  const M = 4;
  const { width: pw, height: ph } = panel;
  const tbAbove = toolbar.top + toolbar.height / 2 < frame.top + frame.height / 2;
  const centerLeft = frame.left + frame.width / 2 - pw / 2;
  const sideTop = tbAbove ? Math.max(frame.top, toolbar.top + toolbar.height + GAP) : frame.top;
  const candidates = [
    tbAbove ? { left: toolbar.left, top: toolbar.top - GAP - ph } : { left: toolbar.left, top: toolbar.top + toolbar.height + GAP },
    { left: frame.left + frame.width + GAP, top: sideTop },
    { left: frame.left - GAP - pw, top: sideTop },
    tbAbove ? { left: centerLeft, top: frame.top + frame.height + GAP } : { left: centerLeft, top: frame.top - GAP - ph },
  ];
  const clampIn = (c: { left: number; top: number }) => ({
    left: Math.min(Math.max(M, c.left), Math.max(M, page.width - pw - M)),
    top: Math.min(Math.max(M, c.top), Math.max(M, page.height - ph - M)),
  });
  const pad = (b: Box2): Box2 => ({ left: b.left - 4, top: b.top - 4, width: b.width + 8, height: b.height + 8 });
  const hits = (c: { left: number; top: number }) => {
    const r = { ...c, width: pw, height: ph };
    return overlapArea(r, pad(frame)) + overlapArea(r, pad(toolbar));
  };
  // 가로로만 페이지 안으로 당겨도 되는 것(위·아래 자리)은 당긴 뒤에 본다
  for (const c of candidates) {
    const fitted = { left: c.left, top: c.top };
    if (c === candidates[0] || c === candidates[3]) fitted.left = clampIn(c).left;
    const inside = fitted.left >= M && fitted.top >= M && fitted.left + pw <= page.width - M && fitted.top + ph <= page.height - M;
    if (inside && hits(fitted) === 0) return fitted;
  }
  let best = clampIn(candidates[0]);
  for (const c of candidates.map(clampIn)) if (hits(c) < hits(best)) best = c;
  return best;
}

/**
 * 손잡이로 크기 바꾸기 (v0.29): 끈 손잡이의 맞은편(모서리면 맞은편 모서리, 변이면 맞은편 변)은 그대로 두고 비율을 지켜 키우고 줄인다.
 * 0.28까지는 가운데를 축으로 사방으로 함께 커졌다. 돌린 틀도 틀 방향대로. 결과는 새 가운데와 크기 (페이지 px)
 */
export function anchoredScale(
  b: Pick<StickerBox, "cx" | "cy" | "width" | "height" | "angle">,
  handle: string,
  p: { x: number; y: number },
  minW: number,
  maxW: number,
): { cx: number; cy: number; width: number; height: number } {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  const dx = p.x - b.cx;
  const dy = p.y - b.cy;
  // 틀 안쪽 좌표 (가운데 0, 돌리기 전)
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const W = Math.max(1, b.width);
  const H = Math.max(1, b.height);
  // 붙들어 둘 곳: 맞은편 모서리 또는 맞은편 변의 가운데
  const ax = (-sx * W) / 2;
  const ay = (-sy * H) / 2;
  const k = sx && sy ? ((lx - ax) * sx * W + (ly - ay) * sy * H) / (W * W + H * H) : sx ? ((lx - ax) * sx) / W : ((ly - ay) * sy) / H;
  const width = Math.min(maxW, Math.max(minW, W * k));
  const height = (H * width) / W;
  const ncx = ax + (sx * width) / 2;
  const ncy = ay + (sy * height) / 2;
  return { cx: b.cx + ncx * cos - ncy * sin, cy: b.cy + ncx * sin + ncy * cos, width, height };
}
