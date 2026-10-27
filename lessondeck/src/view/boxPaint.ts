import { boxLabel, boxesOf, isDangling } from "../doc/boxes";
import type { Page } from "../doc/types";
import type { PageSize } from "../ink/geometry";

// 페이지 바 축소 이미지에 텍스트 상자를 그린다 (화면의 BoxLayer와 같은 자리·크기·줄바꿈)
export function paintBoxes(ctx: CanvasRenderingContext2D, page: Page, pages: Page[], hidden: string[], size: PageSize) {
  ctx.save();
  ctx.textBaseline = "top";
  for (const b of boxesOf(page)) {
    const dangling = isDangling(b, pages);
    if (b.role === "back" && dangling) continue;
    const label = boxLabel(b, pages, hidden);
    if (!label.trim()) continue;
    const fs = (b.size * size.width) / 1000;
    const lh = fs * 1.3;
    const back = b.role === "back";
    const pad = back ? fs * 0.45 : 0;
    ctx.font = `500 ${fs}px system-ui, sans-serif`;
    const maxWidth = Math.max(fs * 4, (1 - b.x) * size.width - 4) - pad * 2;
    const lines = wrapText(ctx, label, maxWidth);
    const x = b.x * size.width;
    const y = b.y * size.height;
    const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.globalAlpha = dangling ? 0.45 : 1;
    if (back) {
      ctx.beginPath();
      ctx.roundRect(x, y, textWidth + pad * 2, lh * lines.length + fs * 0.2, (lh + fs * 0.2) / 2);
      ctx.fillStyle = "rgba(21, 101, 192, 0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(21, 101, 192, 0.35)";
      ctx.lineWidth = Math.max(0.5, fs * 0.05);
      ctx.stroke();
    }
    ctx.fillStyle = b.color;
    lines.forEach((line, i) => {
      const ty = y + (back ? fs * 0.1 : 0) + i * lh + (lh - fs) / 2;
      ctx.fillText(line, x + pad, ty);
      if (b.link && !back) ctx.fillRect(x + pad, ty + fs * 1.05, ctx.measureText(line).width, Math.max(0.5, fs * 0.07));
    });
  }
  ctx.restore();
}

/** 상자 폭에 맞춰 줄을 나눈다 (줄바꿈 문자 유지, 한글은 글자 단위로) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of para) {
      if (line && ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch.trimStart();
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}
