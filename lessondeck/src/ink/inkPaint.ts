import { strokeToSvgPath, type PageSize } from "./geometry";
import { HIGHLIGHTER_ALPHA, LEGACY_HIGHLIGHTER } from "./palette";
import type { InkPoint, Stroke } from "./types";

// 필기를 칠하는 규칙 (v0.23, 화면·썸네일·표지 그림 모두 같게)
// - 형광펜은 펜 필기 아래 따로 한 층에 모아 칠하고, 그 층을 페이지와 "곱하기"로 섞는다.
//   곱하기는 밝은 곳(종이)만 물들이고 어두운 곳(글자)은 그대로 두므로 글자가 흐려지지 않는다.
// - 층 안에서는 형광펜끼리 불투명하게 겹친다(겹친 곳이 더 진해지지 않음). 진하기는 층 전체에 HIGHLIGHTER_ALPHA.

export const isHighlighter = (s: Stroke) => s.tool === "highlighter";

/** 칠할 색: 0.22까지의 기본 형광 노랑은 새 노랑으로 보여 준다 */
export function strokeColor(s: Stroke): string {
  return isHighlighter(s) ? (LEGACY_HIGHLIGHTER[s.color.toLowerCase()] ?? s.color) : s.color;
}

/** 펜의 불투명도 (v0.41): 0.2~1, 형광펜은 늘 1 (진하기는 층에서) */
export function strokeOpacity(s: Stroke): number {
  if (s.tool !== "pen" || typeof s.opacity !== "number" || !(s.opacity < 1)) return 1;
  return Math.max(0.2, s.opacity);
}

/**
 * 획 하나를 칠한다 (형광펜 진하기·섞기는 층에서). 펜은 불투명도(v0.41)만큼 비치고,
 * 연필은 종이 결(점점이 옅은 자리)이 있는 무늬로 칠한다.
 */
export function fillStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, page: PageSize, last = true, extra: InkPoint[] = []) {
  const d = strokeToSvgPath(stroke, page, last, extra);
  if (!d) return;
  const alpha = strokeOpacity(stroke);
  const grain = stroke.tool === "pen" && stroke.nib === "pencil" ? pencilPattern(ctx, strokeColor(stroke), page) : null;
  if (alpha < 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
  }
  ctx.fillStyle = grain ?? strokeColor(stroke);
  ctx.fill(new Path2D(d));
  if (alpha < 1) ctx.restore();
}

// ── 연필 결 (v0.41) ──

/** 결 무늬 한 칸 (px) — 페이지 너비 GRAIN_PAGE에서 결 하나가 CSS 1px */
const GRAIN_TILE = 64;
const GRAIN_PAGE = 1000;
const grainTiles = new Map<string, HTMLCanvasElement | null>();

/** 색 하나의 결 무늬 칸: 대부분 진하고, 군데군데 옅거나 빈 점 (늘 같은 무늬) */
function grainTile(color: string): HTMLCanvasElement | null {
  const key = color.toLowerCase();
  if (grainTiles.has(key)) return grainTiles.get(key)!;
  let tile: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    tile = document.createElement("canvas");
    tile.width = tile.height = GRAIN_TILE;
    const c = tile.getContext("2d");
    if (c) {
      c.fillStyle = color;
      c.fillRect(0, 0, GRAIN_TILE, GRAIN_TILE);
      const img = c.getImageData(0, 0, GRAIN_TILE, GRAIN_TILE);
      let seed = 0x2f6b9d;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let i = 3; i < img.data.length; i += 4) {
        const r = rand();
        // 종이 결: 14%는 거의 비고, 나머지는 진하기가 조금씩 다르다
        img.data[i] = Math.round(255 * (r < 0.14 ? 0.18 + r : 0.72 + 0.28 * rand()));
      }
      c.putImageData(img, 0, 0);
    } else tile = null;
  }
  if (grainTiles.size > 64) grainTiles.clear();
  grainTiles.set(key, tile);
  return tile;
}

function pencilPattern(ctx: CanvasRenderingContext2D, color: string, page: PageSize): CanvasPattern | null {
  const tile = grainTile(color);
  if (!tile) return null;
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return null;
  // 결을 종이에 붙인다: 확대·썸네일에서도 페이지에 대해 같은 크기
  const k = page.width / GRAIN_PAGE;
  if (typeof DOMMatrix !== "undefined" && pattern.setTransform) pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  return pattern;
}

/**
 * 이미 페이지(와 스티커)가 그려진 캔버스 위에 필기를 화면과 같게 칠한다:
 * 형광펜 층을 곱하기로 깔고 그 위에 펜. ctx의 변환은 페이지 CSS px → 캔버스 px.
 */
export function paintInk(ctx: CanvasRenderingContext2D, strokes: Stroke[], page: PageSize) {
  const marks = strokes.filter(isHighlighter);
  if (marks.length) {
    const layer = document.createElement("canvas");
    layer.width = ctx.canvas.width;
    layer.height = ctx.canvas.height;
    const lctx = layer.getContext("2d");
    if (lctx) {
      lctx.setTransform(ctx.getTransform());
      for (const s of marks) fillStroke(lctx, s, page);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = HIGHLIGHTER_ALPHA;
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    }
    layer.width = 0;
    layer.height = 0;
  }
  for (const s of strokes) if (!isHighlighter(s)) fillStroke(ctx, s, page);
}

/** 형광펜만 칠한다 (CSS로 곱하기를 거는 따로 된 캔버스용) */
export function paintHighlighters(ctx: CanvasRenderingContext2D, strokes: Stroke[], page: PageSize) {
  for (const s of strokes) if (isHighlighter(s)) fillStroke(ctx, s, page);
}

/** CSS 형광펜 층 스타일 (편집 화면·썸네일) */
export const HIGHLIGHT_LAYER_STYLE = { mixBlendMode: "multiply", opacity: HIGHLIGHTER_ALPHA } as const;
