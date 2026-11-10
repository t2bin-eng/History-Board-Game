import type { Rect } from "../doc/arrows";
import { chromeWidth, layoutBox, LINE_HEIGHT } from "../doc/textLayout";
import type { TextBox } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { measureFor } from "./textMeasure";

/** 상자가 페이지에서 차지하는 자리 (페이지 px). 화면 글상자·썸네일·화살표가 같은 값을 쓴다 */
export function boxRectPx(b: TextBox, label: string, size: PageSize): Rect {
  const measure = measureFor(b);
  const layout = layoutBox(b, label, size.height / Math.max(1, size.width), measure);
  const scale = size.width / 1000;
  const fs = layout.size * scale;
  const textWidth = Math.max(0, ...layout.lines.map((l) => measure(l, layout.size))) * scale;
  const w = layout.fitted ? b.w! * size.width : textWidth + fs * chromeWidth(layout.chrome);
  const h = layout.fitted ? b.h! * size.height : fs * LINE_HEIGHT * layout.lines.length + fs * layout.chrome.padY * 2;
  return { x: b.x * size.width, y: b.y * size.height, w, h };
}
