import { ImageOff } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { stickersOf } from "../doc/stickers";
import { mediaAsset, type Asset, type Page, type Sticker } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { stickerBox, stickerShadow } from "./stickerGeometry";

interface Props {
  page: Page;
  assets: Record<string, Asset>;
  size: PageSize;
  /** 고치는 중인 스티커의 지금 모양 (끄는 중 등) */
  live?: Sticker | null;
  /** 그리지 않을 스티커 (자르는 중에는 편집 화면이 대신 그린다) */
  hiddenId?: string | null;
}

// 페이지 위 이미지 스티커 층 (페이지 바로 위, 필기 아래). 누름은 늘 지나간다 — 고르기는 길게 누르기·텍스트 모드로.
// 팝업 그림(v0.27)은 누를 수 있어야 해서 필기 위 PopupLayer가 그린다.
export function StickerLayer({ page, assets, size, live, hiddenId }: Props) {
  const list = stickersOf(page).filter((s) => !s.popup);
  if (!list.length) return null;
  return (
    <div className="sticker-layer" aria-hidden="true">
      {list.map((s0) => {
        const s = live?.id === s0.id ? live : s0;
        if (s.id === hiddenId) return null;
        return <StickerView key={s.id} sticker={s} assets={assets} size={size} />;
      })}
    </div>
  );
}

export function StickerView({
  sticker: s,
  assets,
  size,
  className,
  children,
  ...handlers
}: {
  sticker: Sticker;
  assets: Record<string, Asset>;
  size: PageSize;
  className?: string;
  children?: ReactNode;
} & Pick<HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onClick" | "title" | "role" | "aria-label">) {
  const asset = mediaAsset(assets, s.asset);
  const b = stickerBox(s, asset, size);
  const radius = b.radius === Infinity ? "50%" : b.radius;
  return (
    <div
      {...handlers}
      className={["sticker", !asset && "missing", className].filter(Boolean).join(" ")}
      data-sticker-id={s.id}
      style={{
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        transform: b.angle ? `rotate(${s.rotation}deg)` : undefined,
        opacity: s.opacity ?? 1,
        borderRadius: radius,
        boxShadow: stickerShadow(s, b, size.width),
      }}
    >
      {asset ? (
        <div
          className="sticker-clip"
          style={{
            borderRadius: radius,
            transform: s.flipX || s.flipY ? `scale(${s.flipX ? -1 : 1}, ${s.flipY ? -1 : 1})` : undefined,
          }}
        >
          <img
            src={asset.url}
            alt=""
            draggable={false}
            style={{
              left: b.imgLeft,
              top: b.imgTop,
              width: b.imgW,
              height: b.imgH,
            }}
          />
        </div>
      ) : (
        <ImageOff size={Math.max(14, Math.min(b.width, b.height) / 4)} />
      )}
      {children}
    </div>
  );
}
