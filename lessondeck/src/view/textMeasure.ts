import { useEffect, useState } from "react";
import { BOX_FONT, boxTextStyle, canvasFont, type BoxTextStyle } from "../doc/boxFonts";
import { layoutBox, type Measure } from "../doc/textLayout";
import type { TextBox } from "../doc/types";

export { BOX_FONT };

const REF = 100;
let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();
const measures = new Map<string, Measure>();

// 글꼴을 늦게 받아 오면(앱에 넣은 글꼴도 쓰는 글자 묶음만 그때그때 불러옴) 잰 값을 버린다
if (typeof document !== "undefined") document.fonts?.addEventListener?.("loadingdone", () => cache.clear());

function measureWith(style: BoxTextStyle): Measure {
  return (text, size) => {
    const key = `${style.key}\u0000${text}`;
    let w = cache.get(key);
    if (w == null) {
      ctx ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
      if (!ctx) return [...text].length * size * 0.6;
      ctx.font = canvasFont(style, REF);
      w = ctx.measureText(text).width;
      if (cache.size > 8000) cache.clear();
      cache.set(key, w);
    }
    return (w * size) / REF;
  };
}

/** 이 상자의 글꼴·굵기·기울임으로 잰 글 너비 (100px로 한 번 재고 비례로 쓴다) */
export function measureFor(box: Pick<TextBox, "font" | "bold" | "italic">): Measure {
  const style = boxTextStyle(box);
  let m = measures.get(style.key);
  if (!m) {
    m = measureWith(style);
    measures.set(style.key, m);
  }
  return m;
}

/** 기본 글꼴(굵기 500)로 잰 글 너비 */
export const measureText: Measure = (text, size) => measureFor({})(text, size);

/** 상자 크기에 맞춘 글자 크기 (저장용) */
export function fittedSize(box: TextBox, label: string, heightRatio: number): number {
  return layoutBox(box, label, heightRatio, measureFor(box)).size;
}

/** 글꼴을 다 받아 올 때마다 바뀌는 수 — 글상자 층이 다시 재고 그리게 (v0.25) */
export function useFontsVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const bump = () => setV((x) => x + 1);
    fonts?.addEventListener?.("loadingdone", bump);
    return () => fonts?.removeEventListener?.("loadingdone", bump);
  }, []);
  return v;
}

/**
 * 캔버스에 그리기 전에 상자들의 글꼴(쓰인 글자 묶음)을 받아 둔다 — 캔버스는 글꼴을 스스로 불러오지 않는다.
 * 새로 받은 것이 있으면 잰 값을 버린다
 */
export async function loadBoxFonts(boxes: Pick<TextBox, "font" | "bold" | "italic" | "text">[]): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts?.load) return;
  let fresh = false;
  await Promise.all(
    boxes
      .filter((b) => b.font)
      .map(async (b) => {
        const font = canvasFont(boxTextStyle(b), 24);
        const text = b.text || " ";
        if (fonts.check(font, text)) return;
        fresh = true;
        await fonts.load(font, text).catch(() => []);
      }),
  );
  if (fresh) cache.clear();
}
