import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pageAspect, type DocState, type Page } from "../doc/types";
import { fitPage, type PageSize } from "../ink/geometry";
import { InkCanvas } from "../ink/InkCanvas";
import type { Stroke, Tool } from "../ink/types";
import { PdfPageView } from "../pdf/PdfPageView";
import { useViewportGestures } from "./useViewportGestures";

interface Props {
  doc: DocState;
  pageIndex: number;
  strokes: Stroke[];
  tool: Tool;
  color: string;
  width: number;
  eraserSize: number;
  fingerDraw: boolean;
  lowLatency: boolean;
  onCommit: (strokes: Stroke[]) => void;
  onNavigate: (delta: number) => void;
  onPdfRendered?: (ms: number) => void;
  /** 페이지 영역 위에 떠 있는 것들 (펜 팔레트, 디버그 패널) */
  children?: ReactNode;
}

// 가운데 페이지 영역: 페이지(PDF·빈 페이지) + 필기층 + 손가락 확대·넘김 + 이전/다음 버튼
export function PageView(props: Props) {
  const { doc, pageIndex } = props;
  const page = doc.pages[pageIndex];
  const areaRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [renderZoom, setRenderZoom] = useState(1);
  const zoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLayoutEffect(() => {
    const el = areaRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setArea({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = page ? pageAspect(page, doc.assets) : 210 / 297;
  const size: PageSize = useMemo(() => fitPage(area.width, area.height, aspect), [area.width, area.height, aspect]);

  const onZoomEnd = useCallback((z: number) => {
    clearTimeout(zoomTimer.current);
    // 원래 크기로 돌아가면(페이지 전환 포함) 바로, 확대는 연달아 할 때마다 다시 그리지 않도록 잠깐 기다린다
    if (z <= 1.01) setRenderZoom(1);
    else zoomTimer.current = setTimeout(() => setRenderZoom(Math.round(z * 4) / 4), 250);
  }, []);

  const { onNavigate } = props;
  useViewportGestures({
    areaRef,
    pageRef,
    page: size,
    area,
    fingerDraw: props.fingerDraw,
    resetKey: page?.id ?? "",
    onSwipe: onNavigate,
    onZoomEnd,
  });

  // 앞뒤 PDF 쪽을 미리 그려 둔다
  const prefetch = useMemo(() => {
    const list = [];
    for (const i of [pageIndex + 1, pageIndex - 1]) {
      const p = doc.pages[i];
      if (p?.kind !== "pdf") continue;
      const asset = doc.assets[p.asset];
      if (!asset) continue;
      list.push({
        doc: asset.doc,
        assetId: asset.id,
        pageIndex: p.pageIndex,
        size: fitPage(area.width, area.height, asset.aspects[p.pageIndex]),
      });
    }
    return list;
  }, [doc, pageIndex, area.width, area.height]);

  const count = doc.pages.length;

  return (
    <main className="page-area" ref={areaRef}>
      {page && size.width > 0 && (
        <div ref={pageRef} className="page" style={{ width: size.width, height: size.height }}>
          <PageBackground page={page} doc={doc} size={size} zoom={renderZoom} prefetch={prefetch} onRendered={props.onPdfRendered} />
          <InkCanvas
            key={props.lowLatency ? "ll" : "std"}
            page={size}
            zoom={renderZoom}
            strokes={props.strokes}
            tool={props.tool}
            color={props.color}
            width={props.width}
            eraserSize={props.eraserSize}
            fingerDraw={props.fingerDraw}
            lowLatency={props.lowLatency}
            onCommit={props.onCommit}
          />
        </div>
      )}

      {count > 1 && (
        <div className="page-nav" data-no-gesture>
          <button aria-label="이전 페이지" disabled={pageIndex <= 0} onClick={() => onNavigate(-1)}>
            <ChevronLeft size={22} />
          </button>
          <span className="page-nav-count">
            {pageIndex + 1} / {count}
          </span>
          <button aria-label="다음 페이지" disabled={pageIndex >= count - 1} onClick={() => onNavigate(1)}>
            <ChevronRight size={22} />
          </button>
        </div>
      )}

      {props.children}
    </main>
  );
}

function PageBackground({
  page,
  doc,
  size,
  zoom,
  prefetch,
  onRendered,
}: {
  page: Page;
  doc: DocState;
  size: PageSize;
  zoom: number;
  prefetch: Parameters<typeof PdfPageView>[0]["prefetch"];
  onRendered?: (ms: number) => void;
}) {
  if (page.kind === "blank") {
    return <BlankBackground background={page.background} size={size} />;
  }
  const asset = doc.assets[page.asset];
  if (!asset) return <div className="page-placeholder">원본 PDF를 찾을 수 없습니다</div>;
  return (
    <PdfPageView
      doc={asset.doc}
      assetId={asset.id}
      pageIndex={page.pageIndex}
      size={size}
      zoom={zoom}
      prefetch={prefetch}
      onRendered={onRendered}
    />
  );
}

export function BlankBackground({ background, size }: { background: "plain" | "grid"; size: PageSize }) {
  // 모눈 간격은 페이지 가로의 1/40 (A4 기준 약 5mm)
  const cell = size.width / 40;
  return (
    <div
      className={`blank-page${background === "grid" ? " grid" : ""}`}
      style={background === "grid" ? { backgroundSize: `${cell}px ${cell}px` } : undefined}
    />
  );
}
