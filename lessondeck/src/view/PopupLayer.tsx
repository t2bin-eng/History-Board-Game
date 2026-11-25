import { Maximize2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
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
  /** 아이콘을 끌어 옮김 (v0.50.1): 왼쪽 위 자리 (페이지 대비) */
  onMoveIcon?: (id: string, x: number, y: number) => void;
}

/** 이만큼 넘게 움직이면 누름이 아니다 (넘기기·필기) */
const TAP_SLOP = 10;
const OPEN_MS = 320;
const CLOSE_MS = 240;
/** 열린 직후 이 시간 안의 바깥 누름은 닫기로 치지 않는다 (손가락 톡 뒤에 따라오는 클릭이 새로 깔린 배경에 떨어짐, v0.28.1) */
const CLOSE_GUARD_MS = 450;

export function PopupLayer({ page, assets, size, live, interactive, onMoveIcon }: Props) {
  const list = stickersOf(page).filter((s) => s.popup);
  const [open, setOpen] = useState<string | null>(null);
  const press = useRef<{ id: string; pointer: number; x: number; y: number; long: boolean; sx: number; sy: number; moved: boolean } | null>(null);
  /** 끌어 옮기는 중인 아이콘의 자리 (v0.50.1) */
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

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
    press.current = { id: s.id, pointer: e.pointerId, x: e.clientX, y: e.clientY, long: false, sx: s.x, sy: s.y, moved: false };
    // 끌어 옮길 수 있게 (빨리 끌어도 작은 아이콘 밖으로 빠지지 않게) 잡아 둔다
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
  };
  // 아이콘 끌어 옮기기 (v0.50.1): 톡은 크게 보기, 10px 넘게 끌면 그 자리로 옮긴다 (0.50까지는 길게 눌러 고른 뒤에만 옮길 수 있었다)
  const onMove = (s: Sticker, e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || p.id !== s.id || p.pointer !== e.pointerId || !onMoveIcon) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TAP_SLOP) return;
    p.moved = true;
    p.long = true;
    const r = layerRef.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return;
    const w = s.popup?.w ?? 0.07;
    const h = (w * r.width) / r.height;
    const x = clamp(p.sx + (e.clientX - p.x) / r.width, 0, 1 - w);
    const y = clamp(p.sy + (e.clientY - p.y) / r.height, 0, Math.max(0, 1 - h));
    setDrag({ id: s.id, x, y });
  };
  const onUp = (s: Sticker, e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || p.id !== s.id || p.pointer !== e.pointerId) return;
    if (p.moved) {
      if (drag?.id === s.id && e.type === "pointerup") onMoveIcon?.(s.id, drag.x, drag.y);
      setDrag(null);
    }
    // 뗀 자리를 적어 두고, 여는 것은 뒤따르는 클릭에서 (손을 뗄 때 열면 손가락 톡의 클릭이 새로 깔린 배경에 떨어져 바로 닫혔다)
    if (e.type !== "pointerup" || Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP) p.long = true;
  };
  const onClick = (s: Sticker) => {
    const p = press.current;
    press.current = null;
    if (!interactive || (p && (p.id !== s.id || p.long))) return;
    setOpen(s.id);
  };

  return (
    <div ref={layerRef} className={`popup-layer${interactive ? " interactive" : ""}`}>
      {list.map((s0) => {
        const s1 = live?.id === s0.id ? live : s0;
        const s = drag?.id === s0.id ? { ...s1, x: drag.x, y: drag.y } : s1;
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
            className={`popup-icon${open === s.id ? " opened" : ""}${drag?.id === s.id ? " dragging" : ""}`}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? "그림 크게 보기" : undefined}
            title={interactive ? "눌러서 크게 보기 · 끌어서 옮기기" : undefined}
            data-no-gesture={interactive && onMoveIcon ? true : undefined}
            onPointerDown={(e) => onDown(s1, e)}
            onPointerMove={(e) => onMove(s1, e)}
            onPointerUp={(e) => onUp(s, e)}
            onPointerCancel={(e) => onUp(s, e)}
            onClick={(e) => {
              e.stopPropagation();
              onClick(s);
            }}
          >
            <span className="popup-badge" style={{ width: badge, height: badge }} aria-hidden="true">
              <Maximize2 size={Math.round(badge * 0.6)} strokeWidth={2.6} />
            </span>
          </StickerView>
        );
      })}
      {opened &&
        mediaAsset(assets, opened.asset) &&
        layerRef.current &&
        // 크게 보기는 페이지 영역(확대·이동되지 않는 화면)에 띄운다 (v0.51)
        createPortal(
          <PopupView
            key={opened.id}
            sticker={opened}
            asset={mediaAsset(assets, opened.asset)!}
            layer={layerRef.current}
            onClosed={() => setOpen(null)}
          />,
          layerRef.current.closest<HTMLElement>(".page-area") ?? document.body,
        )}
    </div>
  );
}

/** 크게 본 그림: 아이콘 자리에서 커지며 나오고, 바깥·✕·Esc·뒤로 가기로 아이콘 자리로 작아지며 닫힌다 */
/** 크게 본 그림의 확대 한계 */
const MAX_IMG_ZOOM = 6;
const DOUBLE_TAP_MS = 300;

/**
 * 크게 보기 (v0.27, v0.51 화면 기준): 페이지 영역(확대·이동되지 않는 화면) 위에 화면 가로 92%·세로 88% 안에 가장 크게.
 * 0.50까지는 페이지 안에 그려 페이지를 확대한 채 열면 그림이 화면보다 커져 닫기 단추·바깥이 화면 밖으로 나가고,
 * 그림 위에서는 스크롤·확대도 되지 않아 빠져나올 수 없었다. 그림은 두 손가락으로 확대·이동, 두 번 톡으로 2.5배 ↔ 원래
 */
function PopupView({ sticker, asset, layer, onClosed }: { sticker: Sticker; asset: MediaAsset; layer: HTMLElement; onClosed: () => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const openedAt = useRef(performance.now());
  type Box = { left: number; top: number; width: number; height: number };
  /** 화면(페이지 영역) 기준 자리: 아이콘 → 크게 */
  const measure = (): { from: Box; to: Box; radius: string } | null => {
    const area = layer.closest<HTMLElement>(".page-area") ?? document.body;
    const ar = area.getBoundingClientRect();
    const icon = layer.querySelector<HTMLElement>(`[data-sticker-id="${CSS.escape(sticker.id)}"]`);
    const ir = icon?.getBoundingClientRect();
    const big = popupRect(sticker, asset.width, asset.height, { width: ar.width, height: ar.height });
    const from = ir ? { left: ir.left - ar.left, top: ir.top - ar.top, width: ir.width, height: ir.height } : { ...big };
    const radius = icon ? getComputedStyle(icon).borderRadius || "8px" : "8px";
    return { from, to: big, radius };
  };
  const [geo, setGeo] = useState<ReturnType<typeof measure>>(null);
  useLayoutEffect(() => {
    setGeo(measure());
    // 화면 크기·방향이 바뀌면 다시 맞춘다
    const onResize = () => setGeo(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const px = (r: Box) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

  const animated = useRef(false);
  useLayoutEffect(() => {
    if (!geo || animated.current) return;
    animated.current = true;
    frameRef.current?.animate?.([{ ...px(geo.from), borderRadius: geo.radius, opacity: 0.7 }, { ...px(geo.to), borderRadius: "10px", opacity: 1 }], {
      duration: OPEN_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
    backRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const frame = frameRef.current;
    const g = measure() ?? geo;
    const anim = g
      ? frame?.animate?.([{ ...px(g.to), borderRadius: "10px", opacity: 1 }, { ...px(g.from), borderRadius: g.radius, opacity: 0.6 }], {
          duration: CLOSE_MS,
          easing: "cubic-bezier(0.4, 0, 0.6, 1)",
          fill: "forwards",
        })
      : undefined;
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

  // ── 그림 확대·이동 (v0.51): 두 손가락 벌리기·오므리기, 확대한 채 한 손가락(펜·마우스)으로 끌기, 두 번 톡 ──
  const view = useRef({ z: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; mx: number; my: number; v: { z: number; x: number; y: number } } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const downAt = useRef<{ x: number; y: number; t: number } | null>(null);
  const applyView = (animate = false) => {
    const el = zoomRef.current;
    const box = frameRef.current?.getBoundingClientRect();
    if (!el || !box) return;
    const v = view.current;
    // 그림이 틀 밖으로 너무 나가지 않게
    const maxX = ((v.z - 1) * box.width) / 2;
    const maxY = ((v.z - 1) * box.height) / 2;
    v.x = clamp(v.x, -maxX, maxX);
    v.y = clamp(v.y, -maxY, maxY);
    el.style.transition = animate ? "transform 180ms ease-out" : "";
    el.style.transform = v.z === 1 && !v.x && !v.y ? "" : `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  };
  /** 틀 가운데 기준 좌표 */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };
  const zoomAt = (p: { x: number; y: number }, z: number, from = view.current, at = p) => {
    const nz = clamp(z, 1, MAX_IMG_ZOOM);
    // from 상태에서 p 아래에 있던 그림 자리가 at에 오도록
    const ix = (p.x - from.x) / from.z;
    const iy = (p.y - from.y) / from.z;
    view.current = { z: nz, x: at.x - ix * nz, y: at.y - iy * nz };
  };
  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if ((e.target as Element).closest(".popup-close")) return;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { ...view.current } };
      downAt.current = null;
    } else if (pointers.current.size === 1) {
      gesture.current = { d: 0, mx: p.x, my: p.y, v: { ...view.current } };
      downAt.current = { x: p.x, y: p.y, t: performance.now() };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    e.stopPropagation();
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size >= 2 && g.d) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt({ x: g.mx, y: g.my }, g.v.z * (d / g.d), g.v, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      applyView();
    } else if (pointers.current.size === 1 && g.v.z > 1) {
      const p = [...pointers.current.values()][0];
      view.current = { ...g.v, x: g.v.x + p.x - g.mx, y: g.v.y + p.y - g.my };
      applyView();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    e.stopPropagation();
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 끈다
      const rest = [...pointers.current.values()][0];
      gesture.current = { d: 0, mx: rest.x, my: rest.y, v: { ...view.current } };
      return;
    }
    if (pointers.current.size) return;
    gesture.current = null;
    if (view.current.z < 1.05) {
      view.current = { z: 1, x: 0, y: 0 };
      applyView(true);
    }
    // 두 번 톡: 2.5배 ↔ 원래 (톡: 10px 안, 0.3초 안)
    const d = downAt.current;
    downAt.current = null;
    if (!d || e.type !== "pointerup" || Math.hypot(p.x - d.x, p.y - d.y) > TAP_SLOP || performance.now() - d.t > 300) return;
    const now = performance.now();
    const t = lastTap.current;
    if (t && now - t.t < DOUBLE_TAP_MS && Math.hypot(p.x - t.x, p.y - t.y) < 40) {
      lastTap.current = null;
      if (view.current.z > 1.05) view.current = { z: 1, x: 0, y: 0 };
      else zoomAt(p, 2.5);
      applyView(true);
    } else lastTap.current = { t: now, x: p.x, y: p.y };
  };

  const c = cropOf(sticker);
  const flip = sticker.flipX || sticker.flipY ? `scale(${sticker.flipX ? -1 : 1}, ${sticker.flipY ? -1 : 1})` : undefined;
  // 보이는 부분만 꽉 채워(커지는 동안 정사각형 아이콘 → 원래 비율로 자연스럽게). object-view-box를 모르는 웹뷰는 비율로 자리 잡기
  const imgStyle: CSSProperties = VIEW_BOX
    ? ({ objectViewBox: `inset(${pct(c.y)} ${pct(1 - c.x - c.w)} ${pct(1 - c.y - c.h)} ${pct(c.x)})`, transform: flip } as CSSProperties)
    : { position: "absolute", left: pct(-c.x / c.w), top: pct(-c.y / c.h), width: pct(1 / c.w), height: pct(1 / c.h), objectFit: "fill", transform: flip };
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();
  if (!geo) return null;
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
          if (performance.now() - openedAt.current < CLOSE_GUARD_MS) return;
          close();
        }}
      />
      <div
        ref={frameRef}
        className="popup-frame"
        data-no-gesture
        role="dialog"
        aria-label="크게 본 그림"
        style={{ left: geo.to.left, top: geo.to.top, width: geo.to.width, height: geo.to.height }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={swallow}
      >
        <div ref={zoomRef} className="popup-zoom">
          <img className="popup-img" src={asset.url} alt="" draggable={false} style={imgStyle} />
        </div>
        <button
          type="button"
          className="popup-close"
          aria-label="크게 본 그림 닫기"
          title="닫기 (Esc)"
          onPointerDown={swallow}
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

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
