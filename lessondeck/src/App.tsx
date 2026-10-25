import {
  Activity,
  ChevronLeft,
  Eraser,
  FolderOpen,
  Hand,
  Highlighter,
  Maximize,
  Minimize,
  PenLine,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { fitPage, type PageSize } from "./ink/geometry";
import { emptyHistory, inkReducer } from "./ink/history";
import { InkCanvas } from "./ink/InkCanvas";
import { DEFAULT_PRESETS, ERASER_LEVELS } from "./ink/palette";
import type { InkTool, PenPreset, Stroke, Tool } from "./ink/types";
import { fetchPdf, openPdf, type PDFDocumentProxy } from "./pdf/pdfjs";
import { PdfPageCanvas } from "./pdf/PdfPageCanvas";
import { DebugPanel } from "./ui/DebugPanel";
import { PenPalette } from "./ui/PenPalette";
import { ToolSettings } from "./ui/ToolSettings";

type Popover = { kind: "preset"; id: string; left: number; top: number } | { kind: "eraser"; left: number; top: number } | null;

const A4_ASPECT = 210 / 297;
const SAMPLE_URL = `${import.meta.env.BASE_URL}sample.pdf`;

export default function App() {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docTitle, setDocTitle] = useState("필기감 시험지");
  const [aspect, setAspect] = useState(A4_ASPECT);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfRenderMs, setPdfRenderMs] = useState<number | null>(null);

  const [ink, dispatch] = useReducer(inkReducer, emptyHistory);
  const [presets, setPresets] = useState<PenPreset[]>(DEFAULT_PRESETS);
  const [activePresetId, setActivePresetId] = useState(DEFAULT_PRESETS[1].id);
  const [lastByTool, setLastByTool] = useState<Record<InkTool, string>>({
    pen: DEFAULT_PRESETS[1].id,
    highlighter: DEFAULT_PRESETS[0].id,
  });
  const [tool, setTool] = useState<Tool>("pen");
  const [eraserSize, setEraserSize] = useState(ERASER_LEVELS[1]);
  const [popover, setPopover] = useState<Popover>(null);

  const [fingerDraw, setFingerDraw] = usePersistentFlag("lessondeck.fingerDraw", false);
  const [lowLatency, setLowLatency] = usePersistentFlag("lessondeck.lowLatency", true);
  const [debugOpen, setDebugOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];
  const page: PageSize = useMemo(() => fitPage(area.width, area.height, aspect), [area.width, area.height, aspect]);

  // ── PDF ───────────────────────────────────────────────
  const loadDoc = useCallback(async (load: () => Promise<PDFDocumentProxy>, title: string) => {
    try {
      setLoadError(null);
      const next = await load();
      const first = await next.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      setAspect(vp.width / vp.height);
      setDoc((prev) => {
        prev?.loadingTask.destroy();
        return next;
      });
      setDocTitle(title);
      dispatch({ type: "reset" });
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "PDF를 열지 못했습니다");
    }
  }, []);

  useEffect(() => {
    loadDoc(() => fetchPdf(SAMPLE_URL), "필기감 시험지");
  }, [loadDoc]);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    const bytes = await file.arrayBuffer();
    loadDoc(() => openPdf(bytes), file.name.replace(/\.pdf$/i, ""));
  };

  // ── 레이아웃 ───────────────────────────────────────────
  useLayoutEffect(() => {
    const el = areaRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setArea({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    const onOffline = () => showToast("오프라인 사용 준비 완료");
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("lessondeck:offline-ready", onOffline);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("lessondeck:offline-ready", onOffline);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => showToast("전체 화면을 지원하지 않는 브라우저입니다"));
  };

  // ── 도구 ───────────────────────────────────────────────
  const selectPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setActivePresetId(id);
    setTool(p.tool);
    setLastByTool((m) => ({ ...m, [p.tool]: id }));
    setPopover(null);
  };

  const openPresetSettings = (id: string, rect: DOMRect) => {
    setPopover({ kind: "preset", id, left: rect.right + 10, top: Math.max(8, rect.top - 20) });
  };

  const onToolButton = (t: Tool, e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = { left: Math.max(8, rect.left - 40), top: rect.bottom + 8 };
    if (t === "eraser") {
      if (tool === "eraser") setPopover(popover ? null : { kind: "eraser", ...anchor });
      else {
        setTool("eraser");
        setPopover(null);
      }
      return;
    }
    if (tool === t) {
      setPopover(popover ? null : { kind: "preset", id: activePresetId, ...anchor });
    } else {
      selectPreset(lastByTool[t]);
    }
  };

  const patchPreset = (id: string, patch: Partial<PenPreset>) => {
    setPresets((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const onCommit = useCallback((strokes: Stroke[]) => dispatch({ type: "commit", strokes }), []);
  const closePopover = useCallback(() => setPopover(null), []);

  // PC에서 시험할 때 쓰는 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const popoverPreset = popover?.kind === "preset" ? presets.find((p) => p.id === popover.id) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <IconButton label="문서 목록 (Phase 1에서 연결)" disabled>
            <ChevronLeft size={26} />
          </IconButton>
          <div className="doc-title" title={docTitle}>
            {docTitle}
            <span className="phase-chip">Phase 0</span>
          </div>
        </div>
        <div className="topbar-right">
          <IconButton label="PDF 열기" onClick={() => fileRef.current?.click()}>
            <FolderOpen size={22} />
          </IconButton>
          <IconButton
            label={fingerDraw ? "손가락 필기 끄기" : "손가락으로도 필기"}
            active={fingerDraw}
            onClick={() => {
              setFingerDraw((v) => !v);
              showToast(fingerDraw ? "S펜으로만 필기합니다" : "손가락으로도 필기합니다");
            }}
          >
            <Hand size={22} />
          </IconButton>
          <IconButton label="입력 디버그" active={debugOpen} onClick={() => setDebugOpen((v) => !v)}>
            <Activity size={22} />
          </IconButton>
          <IconButton label={isFullscreen ? "전체 화면 끝내기" : "전체 화면"} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
          </IconButton>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            onPickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </header>

      <nav className="toolrow" aria-label="필기 도구">
        <IconButton label="실행 취소" disabled={ink.past.length === 0} onClick={() => dispatch({ type: "undo" })}>
          <Undo2 size={24} />
        </IconButton>
        <IconButton label="다시 실행" disabled={ink.future.length === 0} onClick={() => dispatch({ type: "redo" })}>
          <Redo2 size={24} />
        </IconButton>
        <span className="toolrow-sep" />
        <IconButton label="펜" active={tool === "pen"} onClick={(e) => onToolButton("pen", e)}>
          <PenLine size={24} />
          {tool === "pen" && <span className="tool-color-dot" style={{ background: activePreset.color }} />}
        </IconButton>
        <IconButton label="형광펜" active={tool === "highlighter"} onClick={(e) => onToolButton("highlighter", e)}>
          <Highlighter size={24} />
          {tool === "highlighter" && <span className="tool-color-dot" style={{ background: activePreset.color }} />}
        </IconButton>
        <IconButton label="지우개" active={tool === "eraser"} onClick={(e) => onToolButton("eraser", e)}>
          <Eraser size={24} />
        </IconButton>
        <span className="toolrow-sep" />
        <IconButton label="이 페이지 필기 지우기" disabled={ink.present.length === 0} onClick={() => dispatch({ type: "clear" })}>
          <Trash2 size={22} />
        </IconButton>
      </nav>

      <main className="page-area" ref={areaRef}>
        {page.width > 0 && (
          <div className="page" style={{ width: page.width, height: page.height }}>
            {doc ? (
              <PdfPageCanvas doc={doc} pageIndex={0} size={page} onRendered={setPdfRenderMs} />
            ) : (
              <div className="page-placeholder">{loadError ?? "PDF 불러오는 중…"}</div>
            )}
            <InkCanvas
              key={lowLatency ? "ll" : "std"}
              page={page}
              strokes={ink.present}
              tool={tool}
              color={activePreset.color}
              width={activePreset.width}
              eraserSize={eraserSize}
              fingerDraw={fingerDraw}
              lowLatency={lowLatency}
              onCommit={onCommit}
            />
          </div>
        )}
        {loadError && doc && <div className="error-banner">{loadError}</div>}

        <PenPalette
          presets={presets}
          activeId={tool === "eraser" ? null : activePresetId}
          onSelect={selectPreset}
          onOpenSettings={openPresetSettings}
        />

        {debugOpen && (
          <DebugPanel
            lowLatency={lowLatency}
            onLowLatency={setLowLatency}
            pdfRenderMs={pdfRenderMs}
            onClose={() => setDebugOpen(false)}
          />
        )}
      </main>

      {popover?.kind === "preset" && popoverPreset && (
        <ToolSettings
          kind="preset"
          anchor={popover}
          preset={popoverPreset}
          onChange={(patch) => patchPreset(popoverPreset.id, patch)}
          onClose={closePopover}
        />
      )}
      {popover?.kind === "eraser" && (
        <ToolSettings
          kind="eraser"
          anchor={popover}
          eraserSize={eraserSize}
          onEraserSize={setEraserSize}
          onClearPage={() => {
            dispatch({ type: "clear" });
            setPopover(null);
          }}
          onClose={closePopover}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** 기기별 편의 설정(손가락 필기·저지연 캔버스)은 다음 실행 때도 유지한다 */
function usePersistentFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? initial : v === "1";
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, v ? "1" : "0");
        } catch {
          // 저장이 막혀 있어도 이번 실행에서는 그대로 동작한다
        }
        return v;
      });
    },
    [key],
  );
  return [value, set] as const;
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-btn${active ? " active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
