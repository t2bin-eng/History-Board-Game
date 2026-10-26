import { MousePointer2, PenLine } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { stepVisible, visiblePosition } from "../doc/pages";
import { isInteractivePage, mediaAsset, pageAspect, pdfAsset, type DocState, type InteractivePage, type Page } from "../doc/types";
import { fitPage, type PageSize } from "../ink/geometry";
import { InkCanvas } from "../ink/InkCanvas";
import type { Stroke, Tool } from "../ink/types";
import { PdfPageView } from "../pdf/PdfPageView";
import { PageNav } from "./PageNav";
import { useViewportGestures } from "./useViewportGestures";
import { WebStage } from "./WebStage";

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
  /** HTML·URL 페이지의 판서/조작 모드 (SPEC F6). 조작 모드면 터치·펜이 웹앱으로 간다. */
  webMode: "interact" | "ink";
  onCommit: (strokes: Stroke[]) => void;
  onNavigate: (delta: 1 | -1) => void;
  onPdfRendered?: (ms: number) => void;
  /** 강의 모드: 여백 없이 화면 가득 페이지를 키운다 */
  lecture?: boolean;
  /** 페이지 넘기기 바에 덧붙일 버튼 (강의 모드 도구) */
  navExtra?: ReactNode;
  /** 페이지 영역 위에 떠 있는 것들 (펜 팔레트, 디버그 패널) */
  children?: ReactNode;
}

/** 페이지 둘레 여백 (강의 모드는 0) */
const PAGE_MARGIN = 16;
/** 넘겼다 돌아와도 상태가 유지되도록 열어 둘 웹 페이지 수 (메모리 보호) */
const KEEP_ALIVE = 3;

// 가운데 페이지 영역: 페이지(PDF·빈 페이지·웹앱) + 필기층 + 손가락 확대·넘김 + 이전/다음 버튼
export function PageView(props: Props) {
  const { doc, pageIndex } = props;
  const page = doc.pages[pageIndex];
  const areaRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [renderZoom, setRenderZoom] = useState(1);
  const zoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 웹앱·동영상 페이지: 판서/조작 모드가 있고, 넘겼다 돌아와도 상태가 유지된다
  const web = isInteractivePage(page);
  const inkActive = !web || props.webMode === "ink";

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
  const margin = props.lecture ? 0 : PAGE_MARGIN;
  const size: PageSize = useMemo(() => fitPage(area.width, area.height, aspect, margin), [area.width, area.height, aspect, margin]);

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
    // 웹앱 안의 스와이프와 겹치지 않도록 HTML·URL 페이지에서는 쓸어 넘기기를 끈다 (SPEC R3)
    swipe: !web,
    onSwipe: onNavigate,
    onZoomEnd,
  });

  // 앞뒤(숨긴 쪽 제외) PDF 쪽을 미리 그려 둔다
  const prefetch = useMemo(() => {
    const list: NonNullable<Parameters<typeof PdfPageView>[0]["prefetch"]> = [];
    if (!page) return list;
    for (const delta of [1, -1] as const) {
      const id = stepVisible(doc.pages, doc.hidden, page.id, delta);
      const p = doc.pages.find((x) => x.id === id);
      if (p?.kind !== "pdf") continue;
      const asset = pdfAsset(doc.assets, p.asset);
      if (!asset) continue;
      list.push({
        doc: asset.doc,
        assetId: asset.id,
        pageIndex: p.pageIndex,
        size: fitPage(area.width, area.height, asset.aspects[p.pageIndex], margin),
      });
    }
    return list;
  }, [doc, page, area.width, area.height, margin]);

  // 최근에 본 웹 페이지 몇 개는 iframe을 닫지 않고 숨겨 둔다.
  // iframe은 DOM에서 자리를 옮기면 다시 불러오므로, 그리는 순서는 처음 연 순서로 고정하고
  // "최근 사용"은 시각(used)으로만 따로 관리한다.
  const [alive, setAlive] = useState<{ id: string; used: number }[]>([]);
  const aliveIds = alive.map((a) => a.id);
  if (web && !aliveIds.includes(page.id)) aliveIds.push(page.id);
  useEffect(() => {
    if (!isInteractivePage(page)) return;
    setAlive((prev) => {
      const now = performance.now();
      const next = prev.some((a) => a.id === page.id)
        ? prev.map((a) => (a.id === page.id ? { id: a.id, used: now } : a))
        : [...prev, { id: page.id, used: now }];
      if (next.length <= KEEP_ALIVE) return next;
      const oldest = next.reduce((m, a) => (a.used < m.used ? a : m));
      return next.filter((a) => a !== oldest);
    });
  }, [page]);
  const alivePages = aliveIds
    .map((id) => doc.pages.find((p) => p.id === id))
    .filter((p): p is InteractivePage => isInteractivePage(p));

  const pos = page ? visiblePosition(doc.pages, doc.hidden, page.id) : { index: -1, count: 0 };
  const hasPrev = !!page && stepVisible(doc.pages, doc.hidden, page.id, -1) !== null;
  const hasNext = !!page && stepVisible(doc.pages, doc.hidden, page.id, 1) !== null;

  return (
    <main className={`page-area${props.lecture ? " lecture" : ""}`} ref={areaRef}>
      {page && size.width > 0 && (
        <div
          ref={pageRef}
          className={`page${web ? ` web ${props.webMode}` : ""}`}
          style={{ width: size.width, height: size.height }}
        >
          <PageBackground page={page} doc={doc} size={size} zoom={renderZoom} prefetch={prefetch} onRendered={props.onPdfRendered} />
          <WebStage pages={alivePages} currentId={page.id} assets={doc.assets} size={size} />
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
            active={inkActive}
            onCommit={props.onCommit}
          />
          {web && (
            <div className="web-mode-chip" aria-hidden="true">
              {props.webMode === "ink" ? <PenLine size={13} /> : <MousePointer2 size={13} />}
              {props.webMode === "ink" ? "판서 모드" : "조작 모드"}
            </div>
          )}
        </div>
      )}

      {(doc.pages.length > 1 || props.navExtra) && (
        <PageNav
          area={area}
          label={pos.index < 0 ? "숨긴 페이지" : `${pos.index + 1} / ${pos.count}`}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onNavigate={onNavigate}
          extra={props.navExtra}
        />
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
  if (page.kind === "image") {
    const asset = mediaAsset(doc.assets, page.asset);
    return asset ? (
      <img className="image-page" src={asset.url} alt={asset.name} draggable={false} />
    ) : (
      <div className="page-placeholder">원본 이미지를 찾을 수 없습니다</div>
    );
  }
  // 웹앱·동영상 페이지는 WebStage가 그린다
  if (page.kind !== "pdf") return null;
  const asset = pdfAsset(doc.assets, page.asset);
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
