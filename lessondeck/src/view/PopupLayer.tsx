import { Maximize2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { cropOf, popupRect, shownSticker, stickersOf } from "../doc/stickers";
import { mediaAsset, type Asset, type MediaAsset, type Page, type Sticker } from "../doc/types";
import type { PageSize } from "../ink/geometry";
import { onBackPress } from "../lib/nativeShell";
import { stickerBox } from "./stickerGeometry";
import { StickerView } from "./StickerLayer";

// 팝업 그림 (v0.27, SPEC 5장 stickers "팝업 그림"): 페이지에는 작은 아이콘, 누르면 그 페이지 위에 크게.
// 아이콘은 누를 수 있어야 해서 필기층 위(글상자 층 위)에 그린다. 텍스트 모드·스티커를 고친 중에는 누름이 지나가 고르기가 된다.

interface Props {
  page: Page;
  assets: Record<string, Asset>;
  size: PageSize;
  /** 고치는 중인 스티커의 지금 모양 (끄는 중 등) */
  live?: Sticker | null;
  /** false면 아이콘을 눌러도 열지 않는다 (텍스트 모드, 무엇을 고르는 중) */
  interactive: boolean;
}

/** 이만큼 넘게 움직이면 누름이 아니다 (넘기기·필기) */
const TAP_SLOP = 10;
const OPEN_MS = 320;
const CLOSE_MS = 240;

export function PopupLayer({ page, assets, size, live, interactive }: Props) {
  const list = stickersOf(page).filter((s) => s.popup);
  const [open, setOpen] = useState<string | null>(null);
  const press = useRef<{ id: string; pointer: number; x: number; y: number; long: boolean } | null>(null);

  // 다른 쪽으로 넘어가면 닫는다
  useEffect(() => setOpen(null), [page.id]);
  // 길게 누르면 메뉴가 열리므로 그 누름으로는 열지 않는다
  useEffect(() => {
    const onLong = () => {
      if (press.current) press.current.long = true;
    };
    window.addEventListener("lessondeck:longpress", onLong);
    return () => window.removeEventListener("lessondeck:longpress", onLong);
  }, []);

  if (!list.length) return null;
  const opened = open ? list.find((s) => s.id === open) : undefined;

  const onDown = (s: Sticker, e: ReactPointerEvent) => {
    if (!interactive || e.button > 0) return;
    press.current = { id: s.id, pointer: e.pointerId, x: e.clientX, y: e.clientY, long: false };
  };
  const onUp = (s: Sticker, e: ReactPointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== s.id || p.pointer !== e.pointerId || e.type !== "pointerup" || p.long || !interactive) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP) return;
    setOpen(s.id);
  };

  return (
    <div className={`popup-layer${interactive ? " interactive" : ""}`}>
      {list.map((s0) => {
        const s = live?.id === s0.id ? live : s0;
        const asset = mediaAsset(assets, s.asset);
        const icon = shownSticker(s, asset?.width || 4, asset?.height || 3);
        const b = stickerBox(icon, asset, size);
        const badge = Math.round(Math.max(14, Math.min(24, Math.min(b.width, b.height) * 0.34)));
        return (
          <StickerView
            key={s.id}
            sticker={icon}
            assets={assets}
            size={size}
            className={`popup-icon${open === s.id ? " opened" : ""}`}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? "그림 크게 보기" : undefined}
            title={interactive ? "눌러서 크게 보기" : undefined}
            onPointerDown={(e) => onDown(s, e)}
            onPointerUp={(e) => onUp(s, e)}
            onPointerCancel={(e) => onUp(s, e)}
          >
            <span className="popup-badge" style={{ width: badge, height: badge }} aria-hidden="true">
              <Maximize2 size={Math.round(badge * 0.6)} strokeWidth={2.6} />
            </span>
          </StickerView>
        );
      })}
      {opened && mediaAsset(assets, opened.asset) && (
        <PopupView
          key={opened.id}
          sticker={opened}
          asset={mediaAsset(assets, opened.asset)!}
          size={size}
          onClosed={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** 크게 본 그림: 아이콘 자리에서 커지며 나오고, 바깥·✕·Esc·뒤로 가기로 아이콘 자리로 작아지며 닫힌다 */
function PopupView({ sticker, asset, size, onClosed }: { sticker: Sticker; asset: MediaAsset; size: PageSize; onClosed: () => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const big = popupRect(sticker, asset.width, asset.height, size);
  const iconBox = stickerBox(shownSticker(sticker, asset.width, asset.height), asset, size);
  const from = { left: iconBox.left, top: iconBox.top, width: iconBox.width, height: iconBox.height };
  const to = big;
  const px = (r: typeof from) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const iconRadius = iconBox.radius === Infinity ? "50%" : `${iconBox.radius}px`;

  useLayoutEffect(() => {
    frameRef.current?.animate?.([{ ...px(from), borderRadius: iconRadius, opacity: 0.7 }, { ...px(to), borderRadius: "10px", opacity: 1 }], {
      duration: OPEN_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
    backRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const frame = frameRef.current;
    const anim = frame?.animate?.([{ ...px(to), borderRadius: "10px", opacity: 1 }, { ...px(from), borderRadius: iconRadius, opacity: 0.6 }], {
      duration: CLOSE_MS,
      easing: "cubic-bezier(0.4, 0, 0.6, 1)",
      fill: "forwards",
    });
    backRef.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, fill: "forwards" });
    if (anim) anim.finished.then(onClosed, onClosed);
    else onClosed();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Esc · 안드로이드 뒤로 가기로도 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    const offBack = onBackPress(() => closeRef.current());
    return () => {
      window.removeEventListener("keydown", onKey, true);
      offBack();
    };
  }, []);

  const c = cropOf(sticker);
  const flip = sticker.flipX || sticker.flipY ? `scale(${sticker.flipX ? -1 : 1}, ${sticker.flipY ? -1 : 1})` : undefined;
  // 보이는 부분만 꽉 채워(커지는 동안 정사각형 아이콘 → 원래 비율로 자연스럽게). object-view-box를 모르는 웹뷰는 비율로 자리 잡기
  const imgStyle: CSSProperties = VIEW_BOX
    ? ({ objectViewBox: `inset(${pct(c.y)} ${pct(1 - c.x - c.w)} ${pct(1 - c.y - c.h)} ${pct(c.x)})`, transform: flip } as CSSProperties)
    : { position: "absolute", left: pct(-c.x / c.w), top: pct(-c.y / c.h), width: pct(1 / c.w), height: pct(1 / c.h), objectFit: "fill", transform: flip };
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      <div
        ref={backRef}
        className="popup-backdrop"
        data-no-gesture
        role="presentation"
        onPointerDown={swallow}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      />
      <div
        ref={frameRef}
        className="popup-frame"
        data-no-gesture
        role="dialog"
        aria-label="크게 본 그림"
        style={{ left: big.left, top: big.top, width: big.width, height: big.height }}
        onPointerDown={swallow}
        onClick={swallow}
      >
        <img className="popup-img" src={asset.url} alt="" draggable={false} style={imgStyle} />
        <button
          type="button"
          className="popup-close"
          aria-label="크게 본 그림 닫기"
          title="닫기 (Esc)"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          <X size={22} strokeWidth={2.6} />
        </button>
      </div>
    </>
  );
}

const pct = (v: number) => `${(v * 100).toFixed(4)}%`;
const VIEW_BOX = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("object-view-box", "inset(0% 0% 0% 0%)");
