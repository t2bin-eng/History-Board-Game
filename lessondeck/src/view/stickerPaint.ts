import { cropOf, stickersOf } from "../doc/stickers";
import { mediaAsset, type Asset, type Page } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { stickerBox } from "./stickerGeometry";

// 페이지 바 축소 이미지에 스티커를 그린다 (화면과 같은 배치·꾸미기). 그림을 불러와야 하므로 비동기.

const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    images.set(url, p);
    p.catch(() => images.delete(url));
  }
  return p;
}

/** alive: 그림을 불러오는 사이 다시 그리기 시작했으면 false (이전 그리기는 버린다) */
export async function paintStickers(
  ctx: CanvasRenderingContext2D,
  page: Page,
  assets: Record<string, Asset>,
  size: PageSize,
  alive: () => boolean = () => true,
): Promise<void> {
  const list = stickersOf(page);
  if (!list.length) return;
  const loaded = await Promise.all(
    list.map((s) => {
      const a = mediaAsset(assets, s.asset);
      return a ? loadImage(a.url).catch(() => null) : Promise.resolve(null);
    }),
  );
  if (!alive()) return;
  list.forEach((s, i) => {
    const img = loaded[i];
    const asset = mediaAsset(assets, s.asset);
    if (!img || !asset) return;
    const b = stickerBox(s, asset, size);
    const c = cropOf(s);
    const shape = new Path2D();
    const x = -b.width / 2;
    const y = -b.height / 2;
    if (b.radius === Infinity) shape.ellipse(0, 0, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
    else shape.roundRect(x, y, b.width, b.height, b.radius);
    ctx.save();
    ctx.globalAlpha = s.opacity ?? 1;
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.angle);
    if (s.border && b.borderWidth > 0) {
      // 테두리(와 그림자)는 그림 뒤에. 바깥 절반이 보이도록 두 배 굵기로 긋는다
      // (그림자만 있는 스티커는 축소 이미지에서 생략: 화면의 CSS 그림자처럼 틀 바깥에만 그리기 어렵고 아주 작다)
      ctx.save();
      if (s.shadow) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
        ctx.shadowBlur = Math.max(2, (16 * size.width) / 1000);
        ctx.shadowOffsetY = Math.max(1, (5 * size.width) / 1000);
      }
      ctx.lineWidth = b.borderWidth * 2;
      ctx.strokeStyle = s.border.color;
      ctx.stroke(shape);
      ctx.restore();
    }
    ctx.clip(shape);
    ctx.scale(s.flipX ? -1 : 1, s.flipY ? -1 : 1);
    const iw = img.naturalWidth || asset.width;
    const ih = img.naturalHeight || asset.height;
    ctx.drawImage(img, c.x * iw, c.y * ih, c.w * iw, c.h * ih, x, y, b.width, b.height);
    ctx.restore();
  });
}
