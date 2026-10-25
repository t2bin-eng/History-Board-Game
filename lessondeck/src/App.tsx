import {
  Activity,
  ChevronLeft,
  Eraser,
  FilePlus2,
  FolderOpen,
  Hand,
  Highlighter,
  Maximize,
  Minimize,
  PanelLeft,
  PenLine,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { loadPdfAsset, pagesForAsset } from "./doc/load";
import { insertPages, movePage, pageAfterRemoval, removePage } from "./doc/pages";
import { A4_PORTRAIT, newPageId, pageAspect, type BlankBackground, type DocState, type Page } from "./doc/types";
import { applyInk, type InkAction, type InkBook } from "./ink/history";
import { DEFAULT_PRESETS, ERASER_LEVELS } from "./ink/palette";
import type { InkTool, PenPreset, Stroke, Tool } from "./ink/types";
import { onSideButtonChange } from "./lib/inputState";
import { isNativeApp, showToast } from "./lib/platform";
import { clearRenderCache } from "./pdf/renderCache";
import { clearThumbnails } from "./pdf/thumbnails";
import { AddPageMenu } from "./ui/AddPageMenu";
import { DebugPanel } from "./ui/DebugPanel";
import { PagePanel } from "./ui/PagePanel";
import { PenPalette } from "./ui/PenPalette";
import { ToolSettings } from "./ui/ToolSettings";
import { PageView } from "./view/PageView";

type Popover = { kind: "preset"; id: string; left: number; top: number } | { kind: "eraser"; left: number; top: number } | null;
type Toast = { message: string; action?: { label: string; run: () => void } } | null;
/** 파일 선택 창에서 고른 PDF를 어디에 쓸지: 새 문서로 열기 또는 index 위치에 끼워 넣기 */
type PdfTarget = { mode: "new" } | { mode: "insert"; index: number };

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample.pdf`;
const NO_STROKES: Stroke[] = [];
const emptyDoc: DocState = { title: "레슨덱", assets: {}, pages: [] };

export default function App() {
  const [doc, setDoc] = useState<DocState>(emptyDoc);
  const [currentId, setCurrentId] = useState("");
  const [ink, setInk] = useState<InkBook>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfRenderMs, setPdfRenderMs] = useState<number | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  const [presets, setPresets] = useState<PenPreset[]>(DEFAULT_PRESETS);
  const [activePresetId, setActivePresetId] = useState(DEFAULT_PRESETS[1].id);
  const [lastByTool, setLastByTool] = useState<Record<InkTool, string>>({
    pen: DEFAULT_PRESETS[1].id,
    highlighter: DEFAULT_PRESETS[0].id,
  });
  const [tool, setTool] = useState<Tool>("pen");
  const [sideEraser, setSideEraser] = useState(false);
  const [eraserSize, setEraserSize] = useState(ERASER_LEVELS[1]);
  const [popover, setPopover] = useState<Popover>(null);
  const [addMenu, setAddMenu] = useState<{ index: number; left: number; top: number } | null>(null);

  const [fingerDraw, setFingerDraw] = usePersistentFlag("lessondeck.fingerDraw", false);
  const [lowLatency, setLowLatency] = usePersistentFlag("lessondeck.lowLatency", true);
  const [debugOpen, setDebugOpen] = usePersistentFlag("lessondeck.debugOpen", true);
  const [pagePanelOpen, setPagePanelOpen] = usePersistentFlag("lessondeck.pagePanel", true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fileRef = useRef<HTMLInputElement>(null);
  const pdfTarget = useRef<PdfTarget>({ mode: "new" });

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];
  const pageIndex = Math.max(0, doc.pages.findIndex((p) => p.id === currentId));
  const currentPage: Page | undefined = doc.pages[pageIndex];
  const pageInk = currentPage ? ink[currentPage.id] : undefined;
  const strokes = pageInk?.present ?? NO_STROKES;
  const erasing = tool === "eraser" || sideEraser;

  const openToast = useCallback((message: string, action?: NonNullable<Toast>["action"]) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2500);
  }, []);

  // ── 문서 ───────────────────────────────────────────────
  const openAsNewDoc = useCallback(async (bytes: ArrayBuffer, name: string) => {
    try {
      setLoadError(null);
      setLoading(true);
      const asset = await loadPdfAsset(bytes, name);
      for (const old of Object.values(docRef.current.assets)) old.doc.loadingTask.destroy();
      clearRenderCache();
      clearThumbnails();
      const pages = pagesForAsset(asset);
      setDoc({ title: asset.name, assets: { [asset.id]: asset }, pages });
      setInk({});
      setCurrentId(pages[0]?.id ?? "");
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? `PDF를 열지 못했습니다: ${err.message}` : "PDF를 열지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(SAMPLE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`샘플 PDF ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => openAsNewDoc(bytes, "필기감 시험지"))
      .catch((err) => {
        setLoadError(String(err));
        setLoading(false);
      });
  }, [openAsNewDoc]);

  const insertPdf = async (bytes: ArrayBuffer, name: string, index: number) => {
    try {
      const asset = await loadPdfAsset(bytes, name);
      const added = pagesForAsset(asset);
      setDoc((d) => ({ ...d, assets: { ...d.assets, [asset.id]: asset }, pages: insertPages(d.pages, index, added) }));
      setCurrentId(added[0].id);
      openToast(`${asset.name} ${added.length}쪽을 추가했습니다`);
    } catch (err) {
      console.error(err);
      openToast("PDF를 열지 못했습니다");
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    const bytes = await file.arrayBuffer();
    const target = pdfTarget.current;
    if (target.mode === "insert") insertPdf(bytes, file.name, target.index);
    else openAsNewDoc(bytes, file.name);
  };

  const pickPdf = (target: PdfTarget) => {
    if (target.mode === "new") {
      const hasInk = Object.values(ink).some((h) => h.present.length > 0);
      // 아직 필기를 저장하지 않으므로 새 문서를 열기 전에 확인한다
      if (hasInk && !window.confirm("지금 문서의 필기가 사라집니다. 새 PDF를 열까요?")) return;
    }
    pdfTarget.current = target;
    fileRef.current?.click();
  };

  // ── 페이지 관리 ─────────────────────────────────────────
  const goTo = useCallback((delta: number) => {
    const pages = docRef.current.pages;
    const i = pages.findIndex((p) => p.id === currentIdRef.current);
    const next = pages[Math.max(0, Math.min(pages.length - 1, i + delta))];
    if (next && next.id !== currentIdRef.current) setCurrentId(next.id);
  }, []);

  const addBlank = (index: number, background: BlankBackground) => {
    // 바로 앞(없으면 뒤) 페이지와 같은 비율로 만든다
    const neighbor = doc.pages[index - 1] ?? doc.pages[index];
    const aspect = neighbor ? pageAspect(neighbor, doc.assets) : A4_PORTRAIT;
    const page: Page = { id: newPageId(), kind: "blank", background, aspect };
    setDoc((d) => ({ ...d, pages: insertPages(d.pages, index, [page]) }));
    setCurrentId(page.id);
  };

  const deletePage = (id: string) => {
    const index = doc.pages.findIndex((p) => p.id === id);
    const page = doc.pages[index];
    if (!page || doc.pages.length <= 1) return;
    const nextId = pageAfterRemoval(doc.pages, id);
    setDoc((d) => ({ ...d, pages: removePage(d.pages, id) }));
    if (currentId === id && nextId) setCurrentId(nextId);
    // 필기 기록은 남겨 두었다가 되돌리기 때 그대로 살린다
    openToast(`${index + 1}쪽을 삭제했습니다`, {
      label: "되돌리기",
      run: () => {
        setDoc((d) => ({ ...d, pages: insertPages(d.pages, index, [page]) }));
        setCurrentId(page.id);
      },
    });
  };

  const duplicatePage = (id: string) => {
    const index = doc.pages.findIndex((p) => p.id === id);
    const page = doc.pages[index];
    if (!page) return;
    const copy: Page = { ...page, id: newPageId() };
    setDoc((d) => ({ ...d, pages: insertPages(d.pages, index + 1, [copy]) }));
    setInk((b) => (b[id] ? { ...b, [copy.id]: { past: [], present: b[id].present, future: [] } } : b));
    setCurrentId(copy.id);
  };

  const openAddMenu = (index: number, anchor: DOMRect) => {
    setPopover(null);
    setAddMenu({ index, left: anchor.right + 8, top: anchor.top - 8 });
  };

  // ── 필기 ───────────────────────────────────────────────
  const inkAction = useCallback((action: InkAction) => {
    const id = currentIdRef.current;
    if (id) setInk((b) => applyInk(b, id, action));
  }, []);
  const onCommit = useCallback((next: Stroke[]) => inkAction({ type: "commit", strokes: next }), [inkAction]);

  // S펜 사이드 버튼을 누르는 동안 툴바의 지우개를 켠다
  useEffect(() => onSideButtonChange(setSideEraser), []);

  // ── 화면 ───────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    const onToast = (e: Event) => openToast((e as CustomEvent<string>).detail);
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("lessondeck:toast", onToast);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("lessondeck:toast", onToast);
    };
  }, [openToast]);

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

  const closePopover = useCallback(() => setPopover(null), []);
  const closeAddMenu = useCallback(() => setAddMenu(null), []);

  // PC에서 시험할 때 쓰는 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        inkAction({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        inkAction({ type: "redo" });
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        goTo(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        goTo(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inkAction, goTo]);

  const popoverPreset = popover?.kind === "preset" ? presets.find((p) => p.id === popover.id) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <IconButton label="문서 목록 (다음 단계에서 연결)" disabled>
            <ChevronLeft size={26} />
          </IconButton>
          <div className="doc-title" title={doc.title}>
            {doc.title}
            <span className="phase-chip">v{__APP_VERSION__}</span>
          </div>
        </div>
        <div className="topbar-right">
          <IconButton label="페이지 바" active={pagePanelOpen} onClick={() => setPagePanelOpen((v) => !v)}>
            <PanelLeft size={22} />
          </IconButton>
          <IconButton
            label="페이지 추가"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              // 버튼 바로 아래에 메뉴를 연다
              setPopover(null);
              setAddMenu({ index: pageIndex + 1, left: r.left - 80, top: r.bottom + 8 });
            }}
            disabled={!currentPage}
          >
            <FilePlus2 size={22} />
          </IconButton>
          <IconButton label="PDF 열기 (새 문서)" onClick={() => pickPdf({ mode: "new" })}>
            <FolderOpen size={22} />
          </IconButton>
          <IconButton
            label={fingerDraw ? "손가락 필기 끄기" : "손가락으로도 필기"}
            active={fingerDraw}
            onClick={() => {
              setFingerDraw((v) => !v);
              showToast(fingerDraw ? "S펜으로만 필기합니다 (손가락은 넘기기·확대)" : "손가락으로도 필기합니다 (두 손가락으로 확대)");
            }}
          >
            <Hand size={22} />
          </IconButton>
          <IconButton label="입력 디버그" active={debugOpen} onClick={() => setDebugOpen((v) => !v)}>
            <Activity size={22} />
          </IconButton>
          {/* APK는 처음부터 상태 표시줄 없는 전체 화면으로 열린다 */}
          {!isNativeApp && (
            <IconButton label={isFullscreen ? "전체 화면 끝내기" : "전체 화면"} onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </IconButton>
          )}
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
        <IconButton label="실행 취소" disabled={!pageInk?.past.length} onClick={() => inkAction({ type: "undo" })}>
          <Undo2 size={24} />
        </IconButton>
        <IconButton label="다시 실행" disabled={!pageInk?.future.length} onClick={() => inkAction({ type: "redo" })}>
          <Redo2 size={24} />
        </IconButton>
        <span className="toolrow-sep" />
        <IconButton label="펜" active={tool === "pen" && !sideEraser} onClick={(e) => onToolButton("pen", e)}>
          <PenLine size={24} />
          {tool === "pen" && <span className="tool-color-dot" style={{ background: activePreset.color }} />}
        </IconButton>
        <IconButton label="형광펜" active={tool === "highlighter" && !sideEraser} onClick={(e) => onToolButton("highlighter", e)}>
          <Highlighter size={24} />
          {tool === "highlighter" && <span className="tool-color-dot" style={{ background: activePreset.color }} />}
        </IconButton>
        <IconButton label={sideEraser ? "지우개 (사이드 버튼)" : "지우개"} active={erasing} onClick={(e) => onToolButton("eraser", e)}>
          <Eraser size={24} />
          {sideEraser && <span className="side-badge" aria-hidden="true" />}
        </IconButton>
        <span className="toolrow-sep" />
        <IconButton label="이 페이지 필기 지우기" disabled={strokes.length === 0} onClick={() => inkAction({ type: "clear" })}>
          <Trash2 size={22} />
        </IconButton>
      </nav>

      <div className="workspace">
        {pagePanelOpen && doc.pages.length > 0 && (
          <PagePanel
            doc={doc}
            ink={ink}
            currentId={currentPage?.id ?? ""}
            onSelect={setCurrentId}
            onAdd={openAddMenu}
            onDuplicate={duplicatePage}
            onMove={(id, delta) => setDoc((d) => ({ ...d, pages: movePage(d.pages, id, delta) }))}
            onDelete={deletePage}
            onClose={() => setPagePanelOpen(false)}
          />
        )}

        <PageView
          doc={doc}
          pageIndex={pageIndex}
          strokes={strokes}
          tool={tool}
          color={activePreset.color}
          width={activePreset.width}
          eraserSize={eraserSize}
          fingerDraw={fingerDraw}
          lowLatency={lowLatency}
          onCommit={onCommit}
          onNavigate={goTo}
          onPdfRendered={setPdfRenderMs}
        >
          {(loading || loadError) && doc.pages.length === 0 && (
            <div className="page-area-message">{loadError ?? "PDF 불러오는 중…"}</div>
          )}
          {loadError && doc.pages.length > 0 && <div className="error-banner">{loadError}</div>}

          <PenPalette
            presets={presets}
            activeId={erasing ? null : activePresetId}
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
        </PageView>
      </div>

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
            inkAction({ type: "clear" });
            setPopover(null);
          }}
          onClose={closePopover}
        />
      )}
      {addMenu && (
        <AddPageMenu
          left={addMenu.left}
          top={addMenu.top}
          onBlank={(bg) => {
            addBlank(addMenu.index, bg);
            setAddMenu(null);
          }}
          onPdf={() => {
            pickPdf({ mode: "insert", index: addMenu.index });
            setAddMenu(null);
          }}
          onClose={closeAddMenu}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 기기별 편의 설정(손가락 필기·저지연 캔버스·패널 열림)은 다음 실행 때도 유지한다 */
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
