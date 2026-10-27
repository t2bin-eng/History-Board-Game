import { boxLabel, boxesOf, isDangling } from "../doc/boxes";
import { layoutBox, LINE_HEIGHT } from "../doc/textLayout";
import type { Page } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { BOX_FONT, measureText } from "./textMeasure";

// 페이지 바 축소 이미지에 텍스트 상자를 그린다 (화면의 BoxLayer와 같은 배치: 같은 줄·글자 크기·링크 단추 모양)
export function paintBoxes(ctx: CanvasRenderingContext2D, page: Page, pages: Page[], hidden: string[], size: PageSize) {
  ctx.save();
  ctx.textBaseline = "top";
  const heightRatio = size.height / Math.max(1, size.width);
  const scale = size.width / 1000;
  for (const b of boxesOf(page)) {
    const dangling = isDangling(b, pages);
    if (b.role === "back" && dangling) continue;
    const label = boxLabel(b, pages, hidden);
    if (!label.trim()) continue;
    const layout = layoutBox(b, label, heightRatio, measureText);
    const fs = layout.size * scale;
    const lh = fs * LINE_HEIGHT;
    const { padX, padY, icon } = layout.chrome;
    const x = b.x * size.width;
    const y = b.y * size.height;
    const textWidth = Math.max(...layout.lines.map((l) => measureText(l, layout.size))) * scale;
    const boxW = layout.fitted ? b.w! * size.width : textWidth + fs * (padX * 2 + icon);
    const boxH = layout.fitted ? b.h! * size.height : lh * layout.lines.length + fs * padY * 2;
    ctx.globalAlpha = dangling ? 0.45 : 1;
    if (b.link) {
      // 링크는 필기와 헷갈리지 않게 단추 모양 (화면과 같은 색)
      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH, b.role === "back" ? Math.min(boxH, boxW) / 2 : fs * 0.45);
      ctx.fillStyle = dangling ? "rgba(240, 240, 240, 0.95)" : "rgba(227, 242, 253, 0.95)";
      ctx.fill();
      ctx.strokeStyle = dangling ? "rgba(120, 120, 120, 0.6)" : "rgba(21, 101, 192, 0.6)";
      ctx.lineWidth = Math.max(0.5, fs * 0.08);
      ctx.stroke();
      if (icon) {
        ctx.fillStyle = "#1565c0";
        ctx.beginPath();
        ctx.arc(x + fs * (padX + 0.45), y + fs * padY + lh / 2, fs * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.font = `500 ${fs}px ${BOX_FONT}`;
    ctx.fillStyle = b.color;
    layout.lines.forEach((line, i) => {
      ctx.fillText(line, x + fs * (padX + icon), y + fs * padY + i * lh + (lh - fs) / 2);
    });
  }
  ctx.restore();
}
