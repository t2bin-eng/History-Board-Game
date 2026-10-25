import {
  Activity,
  ChevronLeft,
  Eraser,
  FilePlus2,
  Hand,
  Highlighter,
  Maximize,
  Minimize,
  MousePointer2,
  PanelLeft,
  PenLine,
  Redo2,
  Share2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { normalizeUrl } from "./doc/html";
import { loadHtmlAsset, loadPdfAsset, pagesForAsset } from "./doc/load";
import { IMAGE_ACCEPT, isVideoFile, prepareImage, prepareVideo, VIDEO_ACCEPT } from "./doc/media";
import { insertPages, movePage, movePageTo, pageAfterRemoval, removePage, stepVisible } from "./doc/pages";
import {
  A4_PORTRAIT,
  ASPECT_PRESETS,
  isInteractivePage,
  isWebPage,
  mediaAsset,
  newId,
  newPageId,
  pageAspect,
  pdfAsset,
  type Asset,
  type BlankBackground,
  type DocState,
  type Page,
} from "./doc/types";
import { parseYouTube } from "./doc/youtube";
import { applyInk, type InkAction, type InkBook } from "./ink/history";
import { DEFAULT_PRESETS, ERASER_LEVELS } from "./ink/palette";
import type { InkTool, PenPreset, Stroke, Tool } from "./ink/types";
import { safeFileName, shareOrDownload } from "./lib/files";
import { onSideButtonChange } from "./lib/inputState";
import { isNativeApp, showToast } from "./lib/platform";
import { usePersistentFlag } from "./lib/usePersistentFlag";
import { thumbnailFor } from "./pdf/thumbnails";
import { putAsset, saveInk, saveManifest, setThumb, toManifest, type OpenedDoc } from "./store/docStore";
import { exportProject, PROJECT_EXT } from "./store/projectFile";
import { AddPageMenu, type LinkKind } from "./ui/AddPageMenu";
import { DebugPanel } from "./ui/DebugPanel";
import { IconButton } from "./ui/IconButton";
import { PagePanel } from "./ui/PagePanel";
import { PenPalette } from "./ui/PenPalette";
import { ToolSettings } from "./ui/ToolSettings";
import { PageView } from "./view/PageView";

type Popover = { kind: "preset"; id: string; left: number; top: number } | { kind: "eraser"; left: number; top: number } | null;
type FileTarget = { kind: "pdf" | "html" | "image" | "video"; index: number };

const NO_STROKES: Stroke[] = [];
/** 페이지 구성 저장을 이만큼 모았다가 한 번에 쓴다 */
const MANIFEST_SAVE_DELAY = 400;

const ACCEPT: Record<FileTarget["kind"], string> = {
  pdf: "application/pdf,.pdf",
  html: "text/html,.html,.htm",
  image: IMAGE_ACCEPT,
  video: VIDEO_ACCEPT,
};

interface Props {
  opened: OpenedDoc;
  onHome: () => void;
  /** 화면 문서가 바뀔 때마다 (닫을 때 PDF·object URL 정리용) */
  onDocChange: (doc: DocState) => void;
  /** 상단 바 오른쪽에 붙일 것 (동기화 상태 버튼) */
  headerExtra?: ReactNode;
}

function lastPageKey(docId: string) {
  return `lessondeck.lastPage.${docId}`;
}

function initialPageId(doc: DocState): string {
  try {
    const saved = localStorage.getItem(lastPageKey(doc.id));
    if (saved && doc.pages.some((p) => p.id === saved)) return saved;
  } catch {
    // 저장소를 못 쓰면 첫 페이지부터
  }
  return doc.pages.find((p) => !doc.hidden.includes(p.id))?.id ?? doc.pages[0]?.id ?? "";
}

// 문서 하나를 열어 판서하는 화면
export function Editor({ opened, onHome, onDocChange, headerExtra }: Props) {
  const [doc, setDoc] = useState<DocState>(opened.doc);
  useEffect(() => {
    onDocChange(doc);
  }, [doc, onDocChange]);
  const [currentId, setCurrentId] = useState(() => initialPageId(opened.doc));
  const [ink, setInk] = useState<InkBook>(opened.ink);
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
  /** 웹앱·동영상 페이지: 조작 ↔ 판서. 다른 페이지로 넘어가면 조작으로 돌아간다. */
  const [webMode, setWebMode] = useState<"interact" | "ink">("interact");

  const [fingerDraw, setFingerDraw] = usePersistentFlag("lessondeck.fingerDraw", false);
  const [lowLatency, setLowLatency] = usePersistentFlag("lessondeck.lowLatency", true);
  const [debugOpen, setDebugOpen] = usePersistentFlag("lessondeck.debugOpen", false);
  const [pagePanelOpen, setPagePanelOpen] = usePersistentFlag("lessondeck.pagePanel", true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<FileTarget>({ kind: "pdf", index: 0 });
  const [fileAccept, setFileAccept] = useState(ACCEPT.pdf);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];
  const pageIndex = Math.max(0, doc.pages.findIndex((p) => p.id === currentId));
  const currentPage: Page | undefined = doc.pages[pageIndex];
  const pageInk = currentPage ? ink[currentPage.id] : undefined;
  const strokes = pageInk?.present ?? NO_STROKES;
  const erasing = tool === "eraser" || sideEraser;
  const onInteractive = isInteractivePage(currentPage);

  useEffect(() => {
    if (missingNotice(opened.missingAssets.length)) showToast(missingNotice(opened.missingAssets.length)!);
  }, [opened.missingAssets.length]);

  // ── 자동 저장 (SPEC F8) ─────────────────────────────────
  // 페이지 구성·제목: 바뀌면 잠깐 모았다가 저장
  const manifestTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedDocRef = useRef(opened.doc);
  const flushManifest = useCallback(() => {
    clearTimeout(manifestTimer.current);
    const current = docRef.current;
    if (current === savedDocRef.current) return Promise.resolve();
    savedDocRef.current = current;
    return saveManifest(current.id, toManifest(current))
      .then(() => updateThumb(current))
      .catch((err) => {
        console.error(err);
        showToast("저장하지 못했습니다. 기기 저장 공간을 확인해 주세요.");
      });
  }, []);
  useEffect(() => {
    if (doc === savedDocRef.current) return;
    clearTimeout(manifestTimer.current);
    manifestTimer.current = setTimeout(flushManifest, MANIFEST_SAVE_DELAY);
  }, [doc, flushManifest]);

  // 필기: 바뀐 페이지만 바로 저장 (실행 취소·지우기·복제 포함)
  const savedInkRef = useRef(opened.ink);
  useEffect(() => {
    const prev = savedInkRef.current;
    savedInkRef.current = ink;
    for (const [pageId, hist] of Object.entries(ink)) {
      if (prev[pageId]?.present !== hist.present) {
        saveInk(doc.id, pageId, hist.present).catch((err) => {
          console.error(err);
          showToast("필기를 저장하지 못했습니다");
        });
      }
    }
  }, [ink, doc.id]);

  // 마지막으로 본 페이지 기억
  useEffect(() => {
    try {
      if (currentId) localStorage.setItem(lastPageKey(doc.id), currentId);
    } catch {
      // 기억하지 못해도 문제없다
    }
  }, [currentId, doc.id]);

  // 앱이 백그라운드로 가거나 문서를 닫기 전에 바로 저장
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushManifest();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flushManifest();
    };
  }, [flushManifest]);

  const goHome = async () => {
    await flushManifest();
    onHome();
  };

  const rename = () => {
    const title = window.prompt("문서 이름", doc.title)?.trim();
    if (title && title !== doc.title) setDoc((d) => ({ ...d, title }));
  };

  const exportDoc = async () => {
    try {
      await flushManifest();
      showToast("내보낼 파일을 만드는 중…");
      const { blob, title } = await exportProject(doc.id);
      await shareOrDownload(blob, `${safeFileName(title)}${PROJECT_EXT}`);
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? `내보내지 못했습니다: ${err.message}` : "내보내지 못했습니다");
    }
  };

  // ── 페이지 넣기 ─────────────────────────────────────────
  const addAssetAndPages = (asset: Asset | null, index: number, pages: Page[]) => {
    setDoc((d) => ({
      ...d,
      assets: asset ? { ...d.assets, [asset.id]: asset } : d.assets,
      pages: insertPages(d.pages, index, pages),
    }));
    if (pages[0]) setCurrentId(pages[0].id);
  };

  const insertPdf = async (file: File, index: number) => {
    try {
      const asset = await loadPdfAsset(await file.arrayBuffer(), file.name);
      await putAsset(doc.id, asset.id, file.type ? file : new Blob([file], { type: "application/pdf" }));
      const added = pagesForAsset(asset);
      addAssetAndPages(asset, index, added);
      showToast(`${asset.name} ${added.length}쪽을 추가했습니다`);
    } catch (err) {
      console.error(err);
      showToast("PDF를 열지 못했습니다");
    }
  };

  const insertHtml = async (file: File, index: number) => {
    const asset = loadHtmlAsset(await file.arrayBuffer(), file.name);
    await putAsset(doc.id, asset.id, new Blob([asset.html], { type: "text/html;charset=utf-8" }));
    addAssetAndPages(asset, index, [{ id: newPageId(), kind: "html", asset: asset.id, aspect: "16:9" }]);
    showToast(asset.warnings.length ? `${asset.name}: ${asset.warnings[0]}` : `${asset.name} 페이지를 넣었습니다 (조작 모드)`);
  };

  /** 이미지·동영상 여러 개를 한 장씩 페이지로 */
  const insertMedia = async (files: File[], index: number) => {
    let at = index;
    let firstId: string | null = null;
    for (const file of files) {
      const video = isVideoFile(file);
      try {
        if (!video && /hei[cf]|tiff?$/i.test(file.name)) showToast(`${file.name} 변환 중…`);
        const prep = video ? await prepareVideo(file) : await prepareImage(file);
        const id = newId(video ? "video" : "img");
        await putAsset(doc.id, id, prep.blob);
        const asset: Asset = {
          kind: video ? "video" : "image",
          id,
          name: prep.name,
          mime: prep.mime,
          width: prep.width,
          height: prep.height,
          duration: prep.duration,
          poster: prep.poster,
          url: URL.createObjectURL(prep.blob),
        };
        const page: Page = { id: newPageId(), kind: video ? "video" : "image", asset: id };
        addAssetAndPages(asset, at, [page]);
        firstId ??= page.id;
        at++;
      } catch (err) {
        console.error(err);
        showToast(`${file.name}: ${err instanceof Error ? err.message : "넣지 못했습니다"}`);
      }
    }
    if (firstId) {
      setCurrentId(firstId);
      if (files.length > 1) showToast(`${at - index}개 페이지를 넣었습니다`);
    }
  };

  const pickFile = (kind: FileTarget["kind"], index: number) => {
    fileTarget.current = { kind, index };
    setFileAccept(ACCEPT[kind]);
    // accept가 바뀐 뒤에 열어야 파일 종류가 맞게 걸린다
    setTimeout(() => fileRef.current?.click());
  };

  const onPickFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    const { kind, index } = fileTarget.current;
    if (kind === "pdf") await insertPdf(files[0], index);
    else if (kind === "html") await insertHtml(files[0], index);
    else await insertMedia(files, index);
  };

  // ── 페이지 관리 ─────────────────────────────────────────
  /** 숨긴 페이지는 건너뛰고 넘긴다 */
  const goTo = useCallback((delta: 1 | -1) => {
    const { pages, hidden } = docRef.current;
    const next = stepVisible(pages, hidden, currentIdRef.current, delta);
    if (next) setCurrentId(next);
  }, []);

  // 다른 페이지로 넘어가면 웹앱·동영상 페이지는 다시 조작 모드로
  useEffect(() => setWebMode("interact"), [currentId]);

  const addBlank = (index: number, background: BlankBackground) => {
    // 바로 앞(없으면 뒤) 페이지와 같은 비율로 만든다
    const neighbor = doc.pages[index - 1] ?? doc.pages[index];
    const aspect = neighbor ? pageAspect(neighbor, doc.assets) : A4_PORTRAIT;
    addAssetAndPages(null, index, [{ id: newPageId(), kind: "blank", background, aspect }]);
  };

  const deletePage = (id: string) => {
    const index = doc.pages.findIndex((p) => p.id === id);
    const page = doc.pages[index];
    if (!page || doc.pages.length <= 1) return;
    const nextId = pageAfterRemoval(doc.pages, id);
    setDoc((d) => ({ ...d, pages: removePage(d.pages, id) }));
    if (currentId === id && nextId) setCurrentId(nextId);
    // 필기 기록은 남겨 두었다가 되돌리기 때 그대로 살린다
    showToast(`${index + 1}쪽을 삭제했습니다`, {
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

  /** 링크로 페이지 추가. 유튜브 링크는 웹 주소 칸에 붙여넣어도 동영상 페이지로 만든다. 실패하면 안내 문구 */
  const addLink = (index: number, text: string, kind: LinkKind): string | null => {
    const yt = parseYouTube(text);
    if (yt) {
      addAssetAndPages(null, index, [{ id: newPageId(), kind: "youtube", ...yt, aspect: "16:9" }]);
      showToast("유튜브 동영상을 넣었습니다. 조작 모드에서 재생하세요.");
      return null;
    }
    if (kind === "youtube") return "유튜브 영상 링크를 확인해 주세요";
    const url = normalizeUrl(text);
    if (!url) return "주소를 확인해 주세요";
    addAssetAndPages(null, index, [{ id: newPageId(), kind: "url", url, aspect: "16:9" }]);
    showToast("웹 페이지를 넣었습니다. 인터넷이 연결되어 있어야 보입니다.");
    return null;
  };

  const toggleHidden = (id: string) => {
    const hiding = !doc.hidden.includes(id);
    const visibleCount = doc.pages.filter((p) => !doc.hidden.includes(p.id)).length;
    if (hiding && visibleCount <= 1) {
      showToast("보이는 페이지가 한 장은 있어야 합니다");
      return;
    }
    setDoc((d) => ({ ...d, hidden: hiding ? [...d.hidden, id] : d.hidden.filter((x) => x !== id) }));
    if (hiding) showToast("페이지를 숨겼습니다. 넘길 때 건너뜁니다.");
  };

  const cycleAspect = (id: string) => {
    setDoc((d) => ({
      ...d,
      pages: d.pages.map((p) =>
        isWebPage(p) && p.id === id ? { ...p, aspect: ASPECT_PRESETS[(ASPECT_PRESETS.indexOf(p.aspect) + 1) % ASPECT_PRESETS.length] } : p,
      ),
    }));
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
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

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
    // 웹앱·동영상 페이지에서 펜을 고르면 판서할 생각이므로 판서 모드로 바꾼다
    if (onInteractive) setWebMode("ink");
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
      if (onInteractive) setWebMode("ink");
      return;
    }
    if (tool === t) {
      if (onInteractive) setWebMode("ink");
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
      // 주소 입력 중에는 단축키를 쓰지 않는다
      if ((e.target as Element)?.closest?.("input, textarea, [contenteditable]")) return;
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
          <IconButton label="문서 목록" onClick={goHome}>
            <ChevronLeft size={26} />
          </IconButton>
          <button className="doc-title" title="이름 바꾸기" onClick={rename}>
            {doc.title}
            <span className="phase-chip">v{__APP_VERSION__}</span>
          </button>
        </div>
        <div className="topbar-right">
          {headerExtra}
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
          <IconButton label="파일로 내보내기 (.lessondeck)" onClick={exportDoc}>
            <Share2 size={21} />
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
          accept={fileAccept}
          multiple
          hidden
          onChange={(e) => {
            onPickFiles(e.target.files);
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
        {onInteractive && (
          <>
            <span className="toolrow-sep" />
            {/* SPEC F6: 웹앱·동영상 페이지에서만 보이는 판서 ↔ 조작 스위치 */}
            <div className="mode-switch" role="radiogroup" aria-label="웹앱·동영상 페이지 모드">
              <button role="radio" aria-checked={webMode === "interact"} onClick={() => setWebMode("interact")}>
                <MousePointer2 size={18} /> 조작
              </button>
              <button role="radio" aria-checked={webMode === "ink"} onClick={() => setWebMode("ink")}>
                <PenLine size={18} /> 판서
              </button>
            </div>
          </>
        )}
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
            onReorder={(id, toIndex) => setDoc((d) => ({ ...d, pages: movePageTo(d.pages, id, toIndex) }))}
            onDelete={deletePage}
            onToggleHidden={toggleHidden}
            onCycleAspect={cycleAspect}
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
          webMode={webMode}
          onCommit={onCommit}
          onNavigate={goTo}
          onPdfRendered={setPdfRenderMs}
        >
          {doc.pages.length === 0 && <div className="page-area-message">페이지가 없습니다. 페이지를 추가해 주세요.</div>}

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
          onFile={(kind) => {
            pickFile(kind, addMenu.index);
            setAddMenu(null);
          }}
          onLink={(text, kind) => {
            const error = addLink(addMenu.index, text, kind);
            if (!error) setAddMenu(null);
            return error;
          }}
          onClose={closeAddMenu}
        />
      )}
    </div>
  );
}

function missingNotice(count: number): string | null {
  return count ? `원본 파일 ${count}개를 아직 받지 못했습니다. 동기화가 끝나면 다시 열어 주세요.` : null;
}

/** 문서 목록에 보일 첫 페이지 축소 이미지 */
async function updateThumb(doc: DocState) {
  const first = doc.pages.find((p) => !doc.hidden.includes(p.id)) ?? doc.pages[0];
  let thumb: string | undefined;
  try {
    if (first?.kind === "pdf") {
      const asset = pdfAsset(doc.assets, first.asset);
      if (asset) thumb = await thumbnailFor(asset.doc, asset.id, first.pageIndex);
    } else if (first?.kind === "image") {
      const asset = mediaAsset(doc.assets, first.asset);
      if (asset) thumb = await imageThumb(asset.url);
    } else if (first?.kind === "video") {
      thumb = mediaAsset(doc.assets, first.asset)?.poster;
    }
  } catch {
    // 축소 이미지는 없어도 된다
  }
  await setThumb(doc.id, thumb);
}

function imageThumb(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = 240;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = Math.max(1, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}
