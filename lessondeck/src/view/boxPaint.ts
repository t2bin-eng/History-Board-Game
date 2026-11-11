import { arrowsOf, shapeOfArrow, type Rect } from "../doc/arrows";
import { boxBackground, boxBorder, boxLabel, boxesOf, isDangling } from "../doc/boxes";
import { chromeWidth, layoutBox, LINE_HEIGHT } from "../doc/textLayout";
import type { Page } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { boxRectPx } from "./boxGeometry";
import { boxTextStyle, canvasFont } from "../doc/boxFonts";
import { measureFor } from "./textMeasure";

// 페이지 바 축소 이미지에 텍스트 상자를 그린다 (화면의 BoxLayer와 같은 배치: 같은 줄·글자 크기·링크 단추 모양)
export function paintBoxes(ctx: CanvasRenderingContext2D, page: Page, pages: Page[], hidden: string[], size: PageSize) {
  ctx.save();
  ctx.textBaseline = "top";
  const heightRatio = size.height / Math.max(1, size.width);
  const scale = size.width / 1000;
  // 상자 잇는 화살표 (상자 아래)
  const rects = new Map<string, Rect>();
  for (const b of boxesOf(page)) rects.set(b.id, boxRectPx(b, boxLabel(b, pages, hidden), size));
  const lineW = 3 * scale;
  for (const a of arrowsOf(page)) {
    const shape = shapeOfArrow(a, rects, size, lineW);
    if (!shape) continue;
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = lineW;
    ctx.lineCap = "round";
    const [[x0, y0], [cx, cy], [x1, y1]] = shape.curve;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
    for (const head of shape.heads) {
      ctx.beginPath();
      head.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
  }
  for (const b of boxesOf(page)) {
    const dangling = isDangling(b, pages);
    if (b.role === "back" && dangling) continue;
    // 베일 (v0.28): 썸네일은 선생님이 보는 것이라 반투명(그 밑이 보임)·점선 테두리
    if (b.veil) {
      const r = rects.get(b.id)!;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = b.veil.color;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.12);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([Math.max(2, 4 * scale), Math.max(2, 3 * scale)]);
      ctx.lineWidth = Math.max(1, 1.5 * scale);
      ctx.strokeStyle = b.veil.color;
      ctx.stroke();
      ctx.restore();
      continue;
    }
    const label = boxLabel(b, pages, hidden);
    if (!label.trim()) continue;
    const measure = measureFor(b);
    const layout = layoutBox(b, label, heightRatio, measure);
    const fs = layout.size * scale;
    const lh = fs * LINE_HEIGHT;
    const { padX, padY, icon, trail } = layout.chrome;
    const x = b.x * size.width;
    const y = b.y * size.height;
    const lineWidths = layout.lines.map((l) => measure(l, layout.size) * scale);
    const textWidth = Math.max(...lineWidths);
    const boxW = layout.fitted ? b.w! * size.width : textWidth + fs * chromeWidth(layout.chrome);
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
      if (trail) {
        // 뒤 화살표: 가기 →, 돌아가기 ←
        const cx = x + boxW - fs * (padX + 0.45);
        const cy = y + fs * padY + lh / 2;
        const d = b.role === "back" ? -1 : 1;
        ctx.strokeStyle = "#1565c0";
        ctx.lineWidth = Math.max(0.6, fs * 0.13);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - d * fs * 0.32, cy);
        ctx.lineTo(cx + d * fs * 0.32, cy);
        ctx.moveTo(cx + d * fs * 0.1, cy - fs * 0.22);
        ctx.lineTo(cx + d * fs * 0.32, cy);
        ctx.lineTo(cx + d * fs * 0.1, cy + fs * 0.22);
        ctx.stroke();
      }
    }
    const bg = boxBackground(b);
    if (bg) {
      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH, fs * 0.25);
      ctx.fillStyle = bg;
      ctx.fill();
    }
    const border = boxBorder(b);
    if (border) {
      // 상자 안쪽에 (화면의 inset 그림자와 같은 자리)
      const bw = border.em * fs;
      ctx.beginPath();
      ctx.roundRect(x + bw / 2, y + bw / 2, boxW - bw, boxH - bw, Math.max(0, fs * 0.25 - bw / 2));
      ctx.strokeStyle = border.color;
      ctx.lineWidth = bw;
      ctx.stroke();
    }
    // 서식 (v0.25): 글꼴·굵기·기울임, 줄 맞춤(글자 자리 폭 안에서), 밑줄
    ctx.font = canvasFont(boxTextStyle(b), fs);
    ctx.fillStyle = b.color;
    const textLeft = x + fs * (padX + icon);
    const room = boxW - fs * chromeWidth(layout.chrome);
    const k = b.align === "center" ? 0.5 : b.align === "right" ? 1 : 0;
    layout.lines.forEach((line, i) => {
      const lx = textLeft + Math.max(0, room - lineWidths[i]) * k;
      const ly = y + fs * padY + i * lh + (lh - fs) / 2;
      ctx.fillText(line, lx, ly);
      if (b.underline && line.trim()) ctx.fillRect(lx, ly + fs * 1.02, lineWidths[i], Math.max(0.5, fs * 0.07));
    });
  }
  ctx.restore();
}
