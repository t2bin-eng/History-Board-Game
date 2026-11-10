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

/** 획 하나를 불투명하게 칠한다 (형광펜 진하기·섞기는 층에서) */
export function fillStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, page: PageSize, last = true, extra: InkPoint[] = []) {
  const d = strokeToSvgPath(stroke, page, last, extra);
  if (!d) return;
  ctx.fillStyle = strokeColor(stroke);
  ctx.fill(new Path2D(d));
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
