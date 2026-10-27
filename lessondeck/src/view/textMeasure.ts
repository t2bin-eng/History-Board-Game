import { layoutBox, type Measure } from "../doc/textLayout";
import type { TextBox } from "../doc/types";

/** 텍스트 상자 글꼴 (styles.css의 .text-box와 같아야 줄바꿈이 맞는다) */
export const BOX_FONT = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, sans-serif';
const REF = 100;
let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

// 글꼴을 늦게 받아 오면 잰 값을 버린다
if (typeof document !== "undefined") document.fonts?.addEventListener?.("loadingdone", () => cache.clear());

/** 앱 글꼴(굵기 500)로 잰 글 너비. 100px로 한 번 재고 비례로 쓴다 */
export const measureText: Measure = (text, size) => {
  let w = cache.get(text);
  if (w == null) {
    ctx ??= document.createElement("canvas").getContext("2d");
    if (!ctx) return [...text].length * size * 0.6;
    ctx.font = `500 ${REF}px ${BOX_FONT}`;
    w = ctx.measureText(text).width;
    if (cache.size > 5000) cache.clear();
    cache.set(text, w);
  }
  return (w * size) / REF;
};

/** 상자 크기에 맞춘 글자 크기 (저장용) */
export function fittedSize(box: TextBox, label: string, heightRatio: number): number {
  return layoutBox(box, label, heightRatio, measureText).size;
}
