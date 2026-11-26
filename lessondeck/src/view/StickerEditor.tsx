import {
  BringToFront,
  Check,
  Circle,
  Copy,
  CopyPlus,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Maximize2,
  MoveUpRight,
  Paintbrush,
  RotateCcw,
  RotateCw,
  Scissors,
  SendToBack,
  Square,
  Squircle,
  Trash2,
  X,
} from "lucide-react";
import { useScreenFit } from "./screenFit";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  applyCrop,
  clamp,
  cropOf,
  framePatch,
  FULL_CROP,
  MAX_POPUP_ICON_W,
  MIN_CROP,
  MIN_STICKER_W,
  POPUP_ICON_BORDER,
  shownSticker,
  snapAngle,
  STICKER_BORDER_WIDTHS,
} from "../doc/stickers";
import { RICH_COLORS } from "../doc/swatches";
import type { MediaAsset, Sticker, StickerShape } from "../doc/types";
import { ColorGrid } from "../ui/ColorGrid";
import type { PageSize } from "../ink/geometry";
import { anchoredScale, placeStylePanel, rotatedExtent, stickerBox } from "./stickerGeometry";

type Patch = Partial<Omit<Sticker, "id" | "asset">>;
type CropRect = { x: number; y: number; w: number; h: number };
type CropMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Pt = { x: number; y: number };

interface Props {
  sticker: Sticker;
  asset: MediaAsset | undefined;
  size: PageSize;
  cropping: boolean;
  /** 바뀔 때마다 꾸미기 창을 연다 (메뉴의 "꾸미기") */
  openStyle?: number;
  /** 끄는 중의 모양 (필기 아래 스티커 층이 그린다). 끝나면 null */
  onLive: (s: Sticker | null) => void;
  onChange: (patch: Patch) => void;
  onCropMode: (on: boolean) => void;
  /** 빈 곳을 누름: 그 자리의 다른 스티커를 골랐으면 true */
  onPickAt: (clientX: number, clientY: number) => boolean;
  onDeselect: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOrder: (to: "front" | "back") => void;
  /** 팝업 그림 켜고 끄기 (v0.27: 작은 아이콘 ↔ 원래 크기) */
  onPopup: () => void;
  /** 팝업 그림에서 화살표 내기 (v0.52): 다음에 누른 곳·상자·팝업 그림을 가리킴 */
  onArrow?: () => void;
}

type Gesture =
  | { kind: "move"; pointer: number; p0: Pt; s0: Sticker; moved: boolean }
  | { kind: "scale"; pointer: number; s0: Sticker; handle: string }
  | { kind: "rotate"; pointer: number; s0: Sticker; c: Pt }
  | { kind: "crop"; pointer: number; mode: CropMode; p0: Pt; c0: CropRect }
  | { kind: "bg"; pointer: number; p0: Pt; client: Pt };

const TAP_SLOP = 8;

// 고른 스티커 고치기 (필기층 위): 끌어 옮기기, 모서리로 크기, 위 손잡이로 돌리기, 자르기, 꾸미기
export function StickerEditor(props: Props) {
  const { sticker, asset, size, cropping } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Sticker | null>(null);
  const [crop, setCrop] = useState<CropRect>(cropOf(sticker));
  const [styleOpen, setStyleOpen] = useState(!!props.openStyle);
  const nat = { width: asset?.width || 4, height: asset?.height || 3 };

  const { onLive, openStyle } = props;
  useEffect(() => {
    if (openStyle) setStyleOpen(true);
  }, [openStyle]);
  useEffect(() => onLive(draft), [draft, onLive]);
  useEffect(() => () => onLive(null), [onLive]);
  // 자르기를 시작할 때마다 지금 자른 부분에서
  useEffect(() => {
    if (cropping) {
      setCrop(cropOf(sticker));
      setStyleOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropping]);

  const s = draft ?? sticker;
  /** 페이지에 보이는 모양 (팝업 그림은 아이콘). 틀·손잡이는 이것을 따른다 */
  const iconOf = (x: Sticker) => shownSticker(x, nat.width, nat.height);
  const b = stickerBox(iconOf(s), asset, size);

  /** 화면 좌표 → 페이지 px (확대 중이어도 맞게) */
  const toPage = (clientX: number, clientY: number): Pt => {
    const r = rootRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - r.left) * size.width) / Math.max(1, r.width),
      y: ((clientY - r.top) * size.height) / Math.max(1, r.height),
    };
  };

  const begin = (e: ReactPointerEvent, g: Gesture) => {
    e.stopPropagation();
    if (e.button > 0) return;
    gesture.current = g;
    try {
      rootRef.current!.setPointerCapture(e.pointerId);
    } catch {
      // 잡을 수 없는 포인터면 그냥 둔다
    }
  };

  const onRootDown = (e: ReactPointerEvent) => {
    if (e.button > 0) return;
    begin(e, {
      kind: "bg",
      pointer: e.pointerId,
      p0: toPage(e.clientX, e.clientY),
      client: { x: e.clientX, y: e.clientY },
    });
  };

  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const p = toPage(e.clientX, e.clientY);
    if (g.kind === "move") {
      const dx = p.x - g.p0.x;
      const dy = p.y - g.p0.y;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      const s0 = g.s0;
      const w0 = iconOf(s0).w;
      setDraft({
        ...s0,
        x: clamp(s0.x + dx / size.width, -w0 * 0.8, 1 - w0 * 0.2),
        y: clamp(s0.y + dy / size.height, -0.1, 0.95),
      });
    } else if (g.kind === "scale") {
      // 끈 손잡이의 맞은편은 그대로 두고 비율을 지켜서 (v0.29). 팝업 그림이면 아이콘 크기를 바꾼다 (크게 볼 때 크기는 그대로)
      const b0 = stickerBox(iconOf(g.s0), asset, size);
      const r = anchoredScale(b0, g.handle, p, MIN_STICKER_W * size.width, (g.s0.popup ? MAX_POPUP_ICON_W : 2) * size.width);
      setDraft({
        ...g.s0,
        ...framePatch(g.s0, {
          w: r.width / size.width,
          x: (r.cx - r.width / 2) / size.width,
          y: (r.cy - r.height / 2) / size.height,
          rotation: g.s0.rotation,
        }),
      });
    } else if (g.kind === "rotate") {
      const deg = (Math.atan2(p.y - g.c.y, p.x - g.c.x) * 180) / Math.PI + 90;
      setDraft({ ...g.s0, rotation: snapAngle(deg) });
    } else if (g.kind === "crop") {
      setCrop(cropDrag(g, p));
    }
  };

  const onUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    const cancelled = e.type === "pointercancel";
    if (g.kind === "bg") {
      const p = toPage(e.clientX, e.clientY);
      if (cancelled || cropping || Math.hypot(p.x - g.p0.x, p.y - g.p0.y) > TAP_SLOP) return;
      if (!props.onPickAt(g.client.x, g.client.y)) props.onDeselect();
      return;
    }
    if (g.kind === "crop") return;
    if (draft && !cancelled)
      props.onChange(
        framePatch(sticker, {
          x: draft.x,
          y: draft.y,
          w: iconOf(draft).w,
          rotation: draft.rotation,
        }),
      );
    setDraft(null);
  };

  /** 자르는 틀 끌기: 돌리고 뒤집은 틀 안의 방향으로 바꿔 계산한다 */
  const cropDrag = (g: Extract<Gesture, { kind: "crop" }>, p: Pt): CropRect => {
    const t = b.angle;
    const dx = p.x - g.p0.x;
    const dy = p.y - g.p0.y;
    let lx = dx * Math.cos(t) + dy * Math.sin(t);
    let ly = -dx * Math.sin(t) + dy * Math.cos(t);
    if (sticker.flipX) lx = -lx;
    if (sticker.flipY) ly = -ly;
    const fx = lx / b.imgW;
    const fy = ly / b.imgH;
    const c0 = g.c0;
    let left = c0.x;
    let right = c0.x + c0.w;
    let top = c0.y;
    let bottom = c0.y + c0.h;
    if (g.mode === "move") {
      const mx = clamp(fx, -left, 1 - right);
      const my = clamp(fy, -top, 1 - bottom);
      return { x: left + mx, y: top + my, w: c0.w, h: c0.h };
    }
    if (g.mode.includes("w")) left = clamp(left + fx, 0, right - MIN_CROP);
    if (g.mode.includes("e")) right = clamp(right + fx, left + MIN_CROP, 1);
    if (g.mode.includes("n")) top = clamp(top + fy, 0, bottom - MIN_CROP);
    if (g.mode.includes("s")) bottom = clamp(bottom + fy, top + MIN_CROP, 1);
    return { x: left, y: top, w: right - left, h: bottom - top };
  };

  const finishCrop = () => {
    props.onChange(applyCrop(sticker, crop, size, nat.width, nat.height));
    props.onCropMode(false);
  };

  // ── 도구 막대 자리: 돌린 틀 위 (자리가 없으면 아래) ──
  const tbRef = useRef<HTMLDivElement>(null);
  const [tbSize, setTbSize] = useState({ width: 360, height: 46 });
  useLayoutEffect(() => {
    const el = tbRef.current;
    if (el && (el.offsetWidth !== tbSize.width || el.offsetHeight !== tbSize.height)) setTbSize({ width: el.offsetWidth, height: el.offsetHeight });
  });
  const tbWidth = tbSize.width;
  const { ex, ey } = rotatedExtent(b);
  // 막대 높이는 잰 값으로 (좁은 화면에서 두 줄로 접히면 46px보다 큼)
  const above = b.cy - ey - tbSize.height - 34;
  const tbTop = above >= 4 ? above : Math.min(size.height - tbSize.height - 4, b.cy + ey + 14);
  const tbLeft = clamp(b.cx - tbWidth / 2, 4, Math.max(4, size.width - tbWidth - 4));
  // 확대·좁은 화면에서도 보이고 눌리게 화면 기준으로 (v0.51.1)
  useScreenFit(tbRef, { x: b.cx - ex, y: b.cy - ey, w: ex * 2, h: ey * 2 });
  // 꾸미기 창: 그림(돌린 틀)과 막대를 가리지 않는 곳에 따로 (v0.28.3)
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 330, height: 260 });
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (el && (el.offsetWidth !== panelSize.width || el.offsetHeight !== panelSize.height)) setPanelSize({ width: el.offsetWidth, height: el.offsetHeight });
  });
  const panelAt = placeStylePanel(
    { left: b.cx - ex, top: b.cy - ey, width: ex * 2, height: ey * 2 },
    { left: tbLeft, top: tbTop, width: tbSize.width, height: tbSize.height },
    panelSize,
    size,
  );
  useScreenFit(panelRef, tbRef);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const shown = cropping ? sticker : s;
  const frameStyle = {
    left: b.left,
    top: b.top,
    width: b.width,
    height: b.height,
    transform: `rotate(${shown.rotation ?? 0}deg)${cropping && (sticker.flipX || sticker.flipY) ? ` scale(${sticker.flipX ? -1 : 1}, ${sticker.flipY ? -1 : 1})` : ""}`,
  };

  return (
    <div
      ref={rootRef}
      className={`sticker-edit${cropping ? " cropping" : ""}`}
      data-no-gesture
      onPointerDown={onRootDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!cropping && (
        <div
          className="sticker-frame"
          style={frameStyle}
          onPointerDown={(e) =>
            begin(e, {
              kind: "move",
              pointer: e.pointerId,
              p0: toPage(e.clientX, e.clientY),
              s0: sticker,
              moved: false,
            })
          }
        >
          {/* 크기 손잡이 (v0.29): 네 모서리 + 네 변. 끈 쪽만 움직이고 맞은편은 그대로 (그림이라 비율은 유지) */}
          {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => (
            <span
              key={handle}
              className={`sf-handle ${handle}${handle.length === 1 ? " side" : ""}`}
              onPointerDown={(e) =>
                begin(e, {
                  kind: "scale",
                  pointer: e.pointerId,
                  s0: sticker,
                  handle,
                })
              }
            />
          ))}
          <span className="sf-stem" />
          <span
            className="sf-rotate"
            aria-label="돌리기"
            onPointerDown={(e) =>
              begin(e, {
                kind: "rotate",
                pointer: e.pointerId,
                s0: sticker,
                c: { x: b.cx, y: b.cy },
              })
            }
          >
            <RotateCw size={14} />
          </span>
        </div>
      )}

      {cropping && asset && (
        <div className="crop-stage" style={frameStyle}>
          <img
            className="crop-full"
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
          <div
            className="crop-window"
            style={{
              left: b.imgLeft + crop.x * b.imgW,
              top: b.imgTop + crop.y * b.imgH,
              width: crop.w * b.imgW,
              height: crop.h * b.imgH,
            }}
            onPointerDown={(e) =>
              begin(e, {
                kind: "crop",
                pointer: e.pointerId,
                mode: "move",
                p0: toPage(e.clientX, e.clientY),
                c0: crop,
              })
            }
          >
            <span className="crop-view">
              <img
                src={asset.url}
                alt=""
                draggable={false}
                style={{
                  left: -crop.x * b.imgW,
                  top: -crop.y * b.imgH,
                  width: b.imgW,
                  height: b.imgH,
                }}
              />
            </span>
            {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((mode) => (
              <span
                key={mode}
                className={`crop-handle ${mode}`}
                onPointerDown={(e) =>
                  begin(e, {
                    kind: "crop",
                    pointer: e.pointerId,
                    mode,
                    p0: toPage(e.clientX, e.clientY),
                    c0: crop,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      <div
        ref={tbRef}
        className="sticker-toolbar"
        style={{ left: tbLeft, top: tbTop }}
        onPointerDown={stop}
        onPointerUp={stop}
        onClick={stop}
      >
        {cropping ? (
          <>
            <ToolButton label="자르기 완료" onClick={finishCrop} className="primary">
              <Check size={17} /> 완료
            </ToolButton>
            <ToolButton label="자르기 원래대로" onClick={() => setCrop(FULL_CROP)}>
              <RotateCcw size={16} /> 원래대로
            </ToolButton>
            <ToolButton label="자르기 취소" onClick={() => props.onCropMode(false)}>
              <X size={17} /> 취소
            </ToolButton>
          </>
        ) : (
          <>
            <ToolButton
              label={sticker.popup ? "팝업 끄기 (원래 크기로)" : "팝업: 작은 아이콘, 누르면 크게"}
              onClick={props.onPopup}
              active={!!sticker.popup}
              className="st-popup"
            >
              <Maximize2 size={17} /> 팝업
            </ToolButton>
            {sticker.popup && props.onArrow && (
              <ToolButton label="화살표 (다음에 누른 곳이나 상자·팝업 그림을 가리킴)" onClick={props.onArrow}>
                <MoveUpRight size={17} />
              </ToolButton>
            )}
            <ToolButton label="자르기" onClick={() => props.onCropMode(true)} disabled={!asset || !!sticker.popup}>
              <Crop size={17} />
            </ToolButton>
            <ToolButton
              label="90° 돌리기"
              onClick={() =>
                props.onChange({
                  rotation: snapAngle((sticker.rotation ?? 0) + 90),
                })
              }
            >
              <RotateCw size={17} />
            </ToolButton>
            <ToolButton label="좌우 뒤집기" onClick={() => props.onChange({ flipX: !sticker.flipX })} active={!!sticker.flipX}>
              <FlipHorizontal2 size={17} />
            </ToolButton>
            <ToolButton label="꾸미기" onClick={() => setStyleOpen((v) => !v)} active={styleOpen}>
              <Paintbrush size={17} />
            </ToolButton>
            <span className="st-sep" />
            <ToolButton label="맨 앞으로" onClick={() => props.onOrder("front")}>
              <BringToFront size={17} />
            </ToolButton>
            <ToolButton label="맨 뒤로" onClick={() => props.onOrder("back")}>
              <SendToBack size={17} />
            </ToolButton>
            <span className="st-sep" />
            <ToolButton label="스티커 복사" onClick={props.onCopy}>
              <Copy size={17} />
            </ToolButton>
            <ToolButton label="스티커 잘라내기" onClick={props.onCut}>
              <Scissors size={17} />
            </ToolButton>
            <ToolButton label="스티커 복제" onClick={props.onDuplicate}>
              <CopyPlus size={17} />
            </ToolButton>
            <ToolButton label="스티커 지우기" onClick={props.onDelete}>
              <Trash2 size={17} />
            </ToolButton>
          </>
        )}
      </div>
      {styleOpen && !cropping && (
        <div ref={panelRef} className="sticker-style-wrap" style={{ left: panelAt.left, top: panelAt.top }} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
          <StylePanel sticker={sticker} onChange={props.onChange} />
        </div>
      )}
    </div>
  );
}

function ToolButton(props: { label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      className={[props.active && "on", props.className].filter(Boolean).join(" ") || undefined}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

// 모양 단추는 그림과 이름을 함께 (0.28.3까지 둥근 모서리 그림이 한 모서리만 둥글어 "오른쪽 위만 접힘"처럼 보였다)
const SHAPES: { shape: StickerShape; label: string; text: string; icon: ReactNode }[] = [
  { shape: "rect", label: "사각", text: "네모", icon: <Square size={16} /> },
  { shape: "rounded", label: "둥근 모서리", text: "둥글게", icon: <Squircle size={16} /> },
  { shape: "circle", label: "원", text: "동그라미", icon: <Circle size={16} /> },
];
const WIDTH_LABELS = ["얇게", "보통", "굵게"];

/** 꾸미기: 모양, 테두리 색·굵기, 그림자, 투명도, 상하 뒤집기 */
function StylePanel({ sticker, onChange }: { sticker: Sticker; onChange: (p: Patch) => void }) {
  // 팝업 아이콘은 모양을 정하지 않으면 둥근 모서리 (shownSticker) — 창에도 그대로 보이고, 네모는 따로 적어 둔다 (v0.28.4)
  const shape = sticker.shape ?? (sticker.popup ? "rounded" : "rect");
  // 팝업 아이콘의 기본: 흰 테두리(얇게)·그림자 켬. 없음·끔은 따로 적어 둔다 (굵기 0, shadow false)
  const popup = !!sticker.popup;
  const border = popup ? (sticker.border ?? { color: "#ffffff", width: POPUP_ICON_BORDER }) : sticker.border;
  const hasBorder = !!border && border.width > 0;
  const shadow = popup ? sticker.shadow !== false : !!sticker.shadow;
  const opacity = Math.round((sticker.opacity ?? 1) * 100);
  return (
    <div className="sticker-style" role="group" aria-label="스티커 꾸미기">
      <div className="ss-row">
        <span className="ss-label">모양</span>
        {SHAPES.map((x) => (
          <button
            key={x.shape}
            aria-label={x.label}
            title={x.label}
            aria-pressed={shape === x.shape}
            className={`ss-shape${shape === x.shape ? " on" : ""}`}
            onClick={() => onChange({ shape: sticker.popup ? (x.shape === "rounded" ? undefined : x.shape) : x.shape === "rect" ? undefined : x.shape })}
          >
            {x.icon}
            {x.text}
          </button>
        ))}
      </div>
      <div className="ss-row">
        <span className="ss-label">테두리</span>
        <button
          aria-label="테두리 없음"
          aria-pressed={!hasBorder}
          className={`ss-none${!hasBorder ? " on" : ""}`}
          onClick={() => onChange({ border: popup ? { color: border?.color ?? "#ffffff", width: 0 } : undefined })}
        >
          없음
        </button>
        <ColorGrid
          colors={RICH_COLORS}
          value={hasBorder ? border?.color : undefined}
          inactive={!hasBorder}
          onPick={(color) => onChange({ border: { color, width: hasBorder ? border!.width : STICKER_BORDER_WIDTHS[1] } })}
          label={(c) => (c === "#ffffff" ? "흰 테두리 (스티커)" : `테두리 ${c}`)}
          custom="다른 테두리 색"
        />
      </div>
      <div className="ss-row">
        <span className="ss-label">굵기</span>
        {STICKER_BORDER_WIDTHS.map((width, i) => (
          <button
            key={width}
            disabled={!hasBorder}
            aria-pressed={hasBorder && border?.width === width}
            className={`ss-text${hasBorder && border?.width === width ? " on" : ""}`}
            onClick={() => hasBorder && onChange({ border: { ...border!, width } })}
          >
            {WIDTH_LABELS[i]}
          </button>
        ))}
      </div>
      <div className="ss-row">
        <span className="ss-label">그림자</span>
        <button
          aria-pressed={shadow}
          className={`ss-text${shadow ? " on" : ""}`}
          onClick={() => onChange({ shadow: popup ? (shadow ? false : undefined) : shadow ? undefined : true })}
        >
          {shadow ? "켜짐" : "꺼짐"}
        </button>
        <span className="ss-label">뒤집기</span>
        <button
          aria-label="상하 뒤집기"
          title="상하 뒤집기"
          aria-pressed={!!sticker.flipY}
          className={sticker.flipY ? "on" : undefined}
          onClick={() => onChange({ flipY: !sticker.flipY })}
        >
          <FlipVertical2 size={16} />
        </button>
      </div>
      <label className="ss-row">
        <span className="ss-label">투명도</span>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={opacity}
          aria-label="불투명도"
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            onChange({ opacity: v >= 1 ? undefined : v });
          }}
        />
        <span className="ss-value">{opacity}%</span>
      </label>
    </div>
  );
}
