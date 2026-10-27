import {
  Activity,
  ChevronLeft,
  Copy,
  CopyPlus,
  EllipsisVertical,
  ExternalLink,
  Pencil,
  Scissors,
  ClipboardPaste,
  Eraser,
  FilePlus2,
  Hand,
  Highlighter,
  Link2,
  Minimize2,
  MousePointer2,
  Palette,
  PanelLeft,
  PenLine,
  Presentation,
  Redo2,
  RotateCw,
  Share2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  addBox,
  BOX_COLORS,
  BOX_SIZES,
  boxesOf,
  boxLabel,
  copyBoxes,
  isDangling,
  DEFAULT_BOX_SIZE,
  LINK_COLOR,
  makeClip,
  pageNumberLabel,
  pasteBoxes,
  patchBox,
  removeBox,
  setBoxLink,
  type BoxClip,
} from "./doc/boxes";
import { getBoxClip, setBoxClip } from "./doc/boxClipboard";
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
  type BoxLink,
  type DocState,
  type Page,
  type TextBox,
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
import { onBackPress } from "./lib/nativeShell";
import { openExternal } from "./lib/webFrames";
import { DebugPanel } from "./ui/DebugPanel";
import { IconButton } from "./ui/IconButton";
import { ContextMenu, type MenuGroups } from "./ui/ContextMenu";
import { LinkDialog } from "./ui/LinkDialog";
import { PagePanel } from "./ui/PagePanel";
import { PenPalette } from "./ui/PenPalette";
import { ToolSettings } from "./ui/ToolSettings";
import { BoxLayer } from "./view/BoxLayer";
import type { LongPress } from "./view/PageView";
import { PageView } from "./view/PageView";
import { fittedSize } from "./view/textMeasure";

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
  const [paletteOpen, setPaletteOpen] = usePersistentFlag("lessondeck.penPalette", true);
  /** 웹 페이지(HTML·주소·유튜브)별 새로고침 횟수 */
  const [webReloads, setWebReloads] = useState<Record<string, number>>({});
  /** 텍스트 모드: 페이지를 누르면 글상자, 상자를 누르면 고르기·고치기·링크 */
  const [textMode, setTextMode] = useState(false);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [editingBox, setEditingBox] = useState<string | null>(null);
  /** 링크 걸기 창. created: "링크 만들기"로 방금 만든 상자 (취소하면 지우고 원래 모드로) */
  const [linkDialog, setLinkDialog] = useState<{ boxId: string; created: boolean; wasTextMode?: boolean } | null>(null);
  const [textColor, setTextColor] = useState(BOX_COLORS[0]);
  /** 길게 누르기·더보기 메뉴 */
  const [menu, setMenu] = useState<
    | { kind: "box"; x: number; y: number; boxId: string }
    | { kind: "page"; x: number; y: number; at?: { x: number; y: number } }
    | { kind: "more"; x: number; y: number }
    | null
  >(null);
  /** 복사·잘라낸 상자 (문서를 바꿔도 남음) */
  const [boxClip, setClipState] = useState<BoxClip | null>(getBoxClip);
  /** 강의 모드: 도구 막대·페이지 바를 숨기고 페이지를 화면 가득 */
  const [lecture, setLecture] = useState(false);
  /** 강의 모드에 들어가며 브라우저 전체 화면을 켰는지 (나올 때 같이 끈다) */
  const lectureFs = useRef(false);

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
  // 페이지를 넘기면 고른 상자를 놓는다
  useEffect(() => {
    setSelectedBox(null);
    setEditingBox(null);
  }, [currentId]);

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
    const copy: Page = { ...page, id: newPageId(), boxes: copyBoxes(page.boxes) };
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

  // ── 강의 모드 ──────────────────────────────────────────
  const enterLecture = useCallback(() => {
    setPopover(null);
    setAddMenu(null);
    setTextMode(false);
    setSelectedBox(null);
    setEditingBox(null);
    setLecture(true);
    // APK는 처음부터 상태 표시줄 없는 전체 화면이다. 브라우저에서는 전체 화면도 켠다
    if (!isNativeApp && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      lectureFs.current = true;
      document.documentElement.requestFullscreen().catch(() => (lectureFs.current = false));
    }
  }, []);

  const exitLecture = useCallback(() => {
    setLecture(false);
    if (lectureFs.current) {
      lectureFs.current = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    // 브라우저에서 Esc 등으로 전체 화면이 풀리면 강의 모드도 끝낸다
    const onFs = () => {
      if (!document.fullscreenElement && lectureFs.current) {
        lectureFs.current = false;
        setLecture(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // 안드로이드 뒤로 가기는 앱을 닫기 전에 강의 모드부터 끝낸다
  useEffect(() => (lecture ? onBackPress(exitLecture) : undefined), [lecture, exitLecture]);

  // ── 텍스트 상자·하이퍼링크 ─────────────────────────────
  const leaveTextMode = () => {
    setTextMode(false);
    setSelectedBox(null);
    setEditingBox(null);
  };

  /** 상자가 들어 있는 페이지를 찾아 목록을 바꾼다 (편집 중에 페이지를 넘겨도 맞는 페이지에) */
  const editBoxes = (boxId: string, fn: (pages: Page[], pageId: string, box: TextBox) => Page[]) =>
    setDoc((d) => {
      for (const p of d.pages) {
        const box = p.boxes?.find((b) => b.id === boxId);
        if (box) return { ...d, pages: fn(d.pages, p.id, box) };
      }
      return d;
    });

  const createBox = (x: number, y: number) => {
    if (!currentPage) return;
    const box: TextBox = { id: newId("b"), x, y, text: "", size: DEFAULT_BOX_SIZE, color: textColor };
    setDoc((d) => ({ ...d, pages: addBox(d.pages, currentPage.id, box) }));
    setSelectedBox(box.id);
    setEditingBox(box.id);
  };

  /** 글을 다 쓰면: 글도 링크도 없는 상자는 지운다 */
  const endEdit = (id: string) => {
    setEditingBox((e) => (e === id ? null : e));
    editBoxes(id, (pages, pageId, box) => {
      if (!box.text.trim() && !box.link) return removeBox(pages, pageId, id);
      if (box.w == null || box.h == null) return pages;
      // 크기가 정해진 상자: 글에 맞춰 바뀐 글자 크기를 적어 둔다 (이전 버전·썸네일용)
      const page = pages.find((p) => p.id === pageId)!;
      const size = fittedSize(box, boxLabel(box, pages, docRef.current.hidden), 1 / pageAspect(page, docRef.current.assets));
      return size === box.size ? pages : patchBox(pages, pageId, id, { size });
    });
  };

  /** 글자 작게/크게: 크기가 정해진 상자는 상자를 키우고 줄여(글자는 맞춰서), 아니면 글자 크기 단계로 */
  const resizeBox = (id: string, step: 1 | -1) =>
    editBoxes(id, (pages, pageId, box) => {
      if (box.w != null && box.h != null) {
        const page = pages.find((p) => p.id === pageId)!;
        const factor = step > 0 ? 1.15 : 1 / 1.15;
        const w = Math.min(1 - box.x, Math.max(0.04, box.w * factor));
        const h = Math.min(1 - box.y, Math.max(0.02, box.h * factor));
        const sized = { ...box, w, h };
        const size = fittedSize(sized, boxLabel(sized, pages, docRef.current.hidden), 1 / pageAspect(page, docRef.current.assets));
        return patchBox(pages, pageId, id, { w, h, size });
      }
      const i = BOX_SIZES.reduce((best, v, k) => (Math.abs(v - box.size) < Math.abs(BOX_SIZES[best] - box.size) ? k : best), 0);
      const size = BOX_SIZES[Math.min(BOX_SIZES.length - 1, Math.max(0, i + step))];
      return patchBox(pages, pageId, id, { size });
    });

  const deleteBox = (id: string, message = "상자를 지웠습니다") => {
    // 되돌리기용: 이 상자와, 이 상자가 만든 돌아가기 링크
    const removed: { pageId: string; box: TextBox }[] = [];
    for (const p of docRef.current.pages) for (const b of p.boxes ?? []) if (b.id === id || b.backOf === id) removed.push({ pageId: p.id, box: b });
    editBoxes(id, (pages, pageId) => removeBox(pages, pageId, id));
    setSelectedBox(null);
    setEditingBox(null);
    showToast(message, {
      label: "되돌리기",
      run: () => setDoc((d) => ({ ...d, pages: removed.reduce((ps, r) => addBox(ps, r.pageId, r.box), d.pages) })),
    });
  };

  // 복사·잘라내기·붙여넣기 (링크도 함께). 다른 문서에 붙여도 된다
  const findBox = (id: string) => docRef.current.pages.flatMap((p) => p.boxes ?? []).find((b) => b.id === id);

  /** 상자를 클립보드에 담는다. 시스템 클립보드에는 보이는 글자를 넣는다 (다른 앱에 붙일 수 있게) */
  const copyBox = (id: string, systemText = true): BoxClip | null => {
    const box = findBox(id);
    if (!box) return null;
    const clip = makeClip(docRef.current.id, [box], docRef.current.pages, docRef.current.hidden);
    setBoxClip(clip);
    setClipState(clip);
    if (systemText) navigator.clipboard?.writeText(clip.labels.join("\n")).catch(() => {});
    return clip;
  };

  const cutBox = (id: string, systemText = true) => {
    if (copyBox(id, systemText)) deleteBox(id, "상자를 잘라냈습니다. 붙일 곳에서 붙여넣기");
  };

  const pasteClip = (clip: BoxClip | null = boxClip, at?: { x: number; y: number }) => {
    if (!clip || !currentPage) return;
    const target = currentPage.id;
    const r = pasteBoxes(docRef.current.pages, target, clip, docRef.current.id, at);
    if (!r.ids.length) return;
    // 미리 계산한 결과를 그대로 쓴다 (setBoxLink가 만드는 돌아가기 링크 id까지 같게)
    setDoc((d) => ({ ...d, pages: d.pages === docRef.current.pages ? r.pages : pasteBoxes(d.pages, target, clip, d.id, at).pages }));
    setTextMode(true);
    setSelectedBox(r.ids[r.ids.length - 1]);
    setEditingBox(null);
    if (r.unlinked) showToast("다른 문서의 페이지 링크는 글자만 붙였습니다");
  };

  /** 다른 앱에서 복사한 글: 새 글상자로 (웹 주소 하나면 링크 상자로) */
  const pasteText = (text: string) => {
    if (!currentPage) return;
    const trimmed = text.trim().slice(0, 2000);
    if (!trimmed) return;
    const url = !/\s/.test(trimmed) ? normalizeUrl(trimmed) : null;
    const box: TextBox = url
      ? { id: newId("b"), x: 0.08, y: 0.08, text: "", size: DEFAULT_BOX_SIZE, color: LINK_COLOR, link: { type: "url", url } }
      : { id: newId("b"), x: 0.08, y: 0.08, text: trimmed, size: DEFAULT_BOX_SIZE, color: textColor };
    const clip: BoxClip = { docId: docRef.current.id, boxes: [box], labels: [trimmed] };
    pasteClip(clip);
  };

  /** 상자를 그 자리 옆에 하나 더 (클립보드는 그대로) */
  const duplicateBox = (id: string) => {
    const box = findBox(id);
    if (!box || !currentPage) return;
    const clip = makeClip(docRef.current.id, [box], docRef.current.pages, docRef.current.hidden);
    pasteClip(clip);
  };


  // 길게 누르기(펜·손가락)·오른쪽 클릭: 글상자 위면 상자 메뉴, 아니면 페이지 메뉴
  const onLongPress = (p: LongPress) => {
    setPopover(null);
    setAddMenu(null);
    // 손가락으로 연 메뉴는 손끝에 가리지 않게 조금 비켜서 연다 (자리 계산은 누른 점 그대로)
    const offset = p.pointerType === "touch" ? 18 : 0;
    const menuAt = { x: p.clientX + offset, y: p.clientY + offset };
    // 평소에는 링크 아닌 글상자가 누름을 통과시키므로 자리로 찾는다
    const hit = [...document.querySelectorAll<HTMLElement>(".page .text-box[data-box-id]")].reverse().find((el) => {
      const r = el.getBoundingClientRect();
      return p.clientX >= r.left - 4 && p.clientX <= r.right + 4 && p.clientY >= r.top - 4 && p.clientY <= r.bottom + 4;
    });
    if (hit) {
      setEditingBox(null);
      setMenu({ kind: "box", ...menuAt, boxId: hit.dataset.boxId! });
      return;
    }
    const pageEl = document.querySelector(".page");
    const r = pageEl?.getBoundingClientRect();
    const inside = r && p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom;
    setMenu({
      kind: "page",
      ...menuAt,
      at: inside ? { x: (p.clientX - r.left) / r.width, y: (p.clientY - r.top) / r.height } : undefined,
    });
  };

  const menuGroups = (): { title?: string; groups: MenuGroups } => {
    if (!menu) return { groups: [] };
    if (menu.kind === "box") {
      const box = findBox(menu.boxId);
      if (!box) return { groups: [] };
      const id = box.id;
      const dangling = isDangling(box, doc.pages);
      return {
        title: box.link ? "링크" : "글상자",
        groups: [
          [
            box.link &&
              !dangling && {
                label: box.link.type === "url" ? "링크 열기" : `${pageNumberLabel(doc.pages, doc.hidden, box.link.pageId)}으로 가기`,
                icon: box.link.type === "url" ? <ExternalLink size={18} /> : <Link2 size={18} />,
                onSelect: () => (box.link!.type === "url" ? openExternal(box.link!.url) : followLink(box.link!)),
              },
            {
              label: "글자 고치기",
              icon: <Pencil size={18} />,
              onSelect: () => {
                setTextMode(true);
                setSelectedBox(id);
                setEditingBox(id);
              },
            },
            { label: box.link ? "링크 바꾸기" : "링크 걸기", icon: <Link2 size={18} />, onSelect: () => setLinkDialog({ boxId: id, created: false }) },
            {
              label: "크기·위치 조절",
              icon: <Type size={18} />,
              onSelect: () => {
                setTextMode(true);
                setSelectedBox(id);
              },
            },
          ],
          [
            {
              label: "복사",
              icon: <Copy size={18} />,
              hint: "Ctrl+C",
              onSelect: () => {
                copyBox(id);
                showToast("상자를 복사했습니다. 붙일 곳을 길게 누르세요");
              },
            },
            { label: "잘라내기", icon: <Scissors size={18} />, hint: "Ctrl+X", onSelect: () => cutBox(id) },
            { label: "복제", icon: <CopyPlus size={18} />, onSelect: () => duplicateBox(id) },
            boxClip && { label: "붙여넣기", icon: <ClipboardPaste size={18} />, hint: "Ctrl+V", onSelect: () => pasteClip() },
          ],
          [{ label: "지우기", icon: <Trash2 size={18} />, danger: true, onSelect: () => deleteBox(id) }],
        ],
      };
    }
    if (menu.kind === "page") {
      const at = menu.at;
      return {
        title: currentPage ? `${pageNumberLabel(doc.pages, doc.hidden, currentPage.id) ?? ""} 페이지` : undefined,
        groups: [
          [
            boxClip && { label: at ? "여기에 붙여넣기" : "붙여넣기", icon: <ClipboardPaste size={18} />, hint: "Ctrl+V", onSelect: () => pasteClip(boxClip, at) },
            at && {
              label: "여기에 글상자",
              icon: <Type size={18} />,
              onSelect: () => {
                setTextMode(true);
                createBox(at.x, at.y);
              },
            },
            at && { label: "여기에 링크", icon: <Link2 size={18} />, onSelect: () => createLinkBox(at) },
          ],
          [
            { label: "실행 취소", icon: <Undo2 size={18} />, hint: "Ctrl+Z", disabled: !pageInk?.past.length, onSelect: () => inkAction({ type: "undo" }) },
            { label: "다시 실행", icon: <Redo2 size={18} />, hint: "Ctrl+Y", disabled: !pageInk?.future.length, onSelect: () => inkAction({ type: "redo" }) },
            strokes.length > 0 && { label: "이 페이지 필기 지우기", icon: <Eraser size={18} />, onSelect: () => inkAction({ type: "clear" }) },
          ],
          [
            { label: "뒤에 빈 페이지 추가", icon: <FilePlus2 size={18} />, onSelect: () => addBlank(pageIndex + 1, "plain") },
            currentPage && { label: "이 페이지 복제", icon: <CopyPlus size={18} />, onSelect: () => duplicatePage(currentPage.id) },
            isWebPage(currentPage) && { label: "페이지 새로고침", icon: <RotateCw size={18} />, onSelect: reloadWebPage },
          ],
          [
            lecture
              ? { label: "강의 모드 끝내기", icon: <Minimize2 size={18} />, hint: "Esc", onSelect: exitLecture }
              : { label: "강의 모드", icon: <Presentation size={18} />, hint: "F5", onSelect: enterLecture },
            !paletteOpen && { label: "펜 바 보이기", icon: <Palette size={18} />, onSelect: () => setPaletteOpen(true) },
          ],
        ],
      };
    }
    return {
      groups: [
        [
          { label: "이름 바꾸기", icon: <Pencil size={18} />, onSelect: rename },
          { label: "파일로 내보내기 (.lessondeck)", icon: <Share2 size={18} />, onSelect: exportDoc },
        ],
        [
          { label: "펜 바", icon: <Palette size={18} />, checked: paletteOpen, onSelect: () => setPaletteOpen((v) => !v) },
          { label: "페이지 바", icon: <PanelLeft size={18} />, checked: pagePanelOpen, onSelect: () => setPagePanelOpen((v) => !v) },
          { label: "입력 디버그", icon: <Activity size={18} />, checked: debugOpen, onSelect: () => setDebugOpen((v) => !v) },
        ],
      ],
    };
  };

  /** "링크 만들기": 링크 상자를 만들고 바로 연결할 곳을 고른다 */
  const createLinkBox = (at?: { x: number; y: number }) => {
    if (!currentPage) return;
    setPopover(null);
    setTextMode(true);
    // 링크를 여러 개 만들어도 겹치지 않게 왼쪽 아래부터 위로 쌓는다
    let y = 0.86;
    const others = boxesOf(currentPage);
    while (y > 0.1 && others.some((b) => Math.abs(b.y - y) < 0.045 && Math.abs(b.x - 0.06) < 0.25)) y -= 0.06;
    const box: TextBox = { id: newId("b"), x: at?.x ?? 0.06, y: at?.y ?? y, text: "", size: DEFAULT_BOX_SIZE, color: LINK_COLOR };
    setDoc((d) => ({ ...d, pages: addBox(d.pages, currentPage.id, box) }));
    setSelectedBox(box.id);
    setEditingBox(null);
    setLinkDialog({ boxId: box.id, created: true, wasTextMode: textMode });
  };

  const applyLink = (link: BoxLink, addBack: boolean) => {
    if (!linkDialog) return;
    const { boxId } = linkDialog;
    const before = docRef.current.pages;
    const targetBoxes = (pages: Page[]) => (link.type === "page" ? boxesOf(pages.find((p) => p.id === link.pageId)).length : 0);
    const owner = before.find((p) => p.boxes?.some((b) => b.id === boxId));
    if (owner && link.type === "page" && addBack) {
      const after = setBoxLink(before, owner.id, boxId, link, addBack);
      if (targetBoxes(after) > targetBoxes(before)) {
        showToast(`${pageNumberLabel(after, docRef.current.hidden, link.pageId)}에 "돌아가기" 링크를 넣었습니다`);
      }
    }
    editBoxes(boxId, (pages, pageId) => setBoxLink(pages, pageId, boxId, link, addBack));
    setLinkDialog(null);
  };

  const removeLink = () => {
    if (!linkDialog) return;
    const { boxId } = linkDialog;
    editBoxes(boxId, (pages, pageId, box) => {
      const unlinked = setBoxLink(pages, pageId, boxId, undefined);
      return box.text.trim() ? unlinked : removeBox(unlinked, pageId, boxId);
    });
    setLinkDialog(null);
  };

  const closeLinkDialog = () => {
    if (!linkDialog) return;
    const { boxId, created, wasTextMode } = linkDialog;
    // 링크 만들기를 취소하면 빈 상자를 남기지 않고 원래 모드로 돌아간다
    if (created) {
      editBoxes(boxId, (pages, pageId, box) => (!box.link && !box.text.trim() ? removeBox(pages, pageId, boxId) : pages));
      if (wasTextMode) setSelectedBox(null);
      else leaveTextMode();
    }
    setLinkDialog(null);
  };

  /** 지금 웹 페이지를 처음 상태로 다시 불러오기 (퀴즈 진행 등은 사라진다) */
  const reloadWebPage = () => {
    if (!isWebPage(currentPage)) return;
    const id = currentPage.id;
    setWebReloads((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
    showToast("페이지를 다시 불러왔습니다");
  };

  const followLink = (link: BoxLink) => {
    if (link.type === "page" && docRef.current.pages.some((p) => p.id === link.pageId)) setCurrentId(link.pageId);
  };

  // ── 도구 ───────────────────────────────────────────────
  const selectPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    leaveTextMode();
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
    if (textMode) {
      leaveTextMode();
      if (t !== "eraser") {
        selectPreset(lastByTool[t]);
        return;
      }
    }
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

  // PC 키보드: 고른 상자 Ctrl+C·Ctrl+X, 어디서든 Ctrl+V (글 입력 중에는 평소대로)
  const clipRef = useRef({ copyBox, cutBox, pasteClip, pasteText, selectedBox, editingBox, boxClip });
  clipRef.current = { copyBox, cutBox, pasteClip, pasteText, selectedBox, editingBox, boxClip };
  useEffect(() => {
    const typing = (e: Event) => !!(e.target as Element)?.closest?.("input, textarea, [contenteditable]");
    const onCopyCut = (e: ClipboardEvent) => {
      const c = clipRef.current;
      if (typing(e) || !c.selectedBox || c.editingBox || window.getSelection()?.toString()) return;
      const clip = e.type === "cut" ? (c.cutBox(c.selectedBox, false), getBoxClip()) : c.copyBox(c.selectedBox, false);
      if (!clip) return;
      e.clipboardData?.setData("text/plain", clip.labels.join("\n"));
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e)) return;
      const c = clipRef.current;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      // 시스템 클립보드 글이 마지막으로 복사한 상자 글과 같으면 상자(링크·모양 그대로)를, 아니면 그 글을 붙인다
      if (c.boxClip && (!text || text === c.boxClip.labels.join("\n"))) c.pasteClip();
      else if (text.trim()) c.pasteText(text);
      else return;
      e.preventDefault();
    };
    document.addEventListener("copy", onCopyCut);
    document.addEventListener("cut", onCopyCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopyCut);
      document.removeEventListener("cut", onCopyCut);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedBox && !editingBox) {
        e.preventDefault();
        deleteBox(selectedBox);
      } else if (e.key === "F5") {
        // 파워포인트처럼 F5로 강의 시작, Esc로 끝
        e.preventDefault();
        enterLecture();
      } else if (e.key === "Escape" && lecture) {
        exitLecture();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        goTo(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        goTo(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inkAction, goTo, enterLecture, exitLecture, lecture, selectedBox, editingBox]);

  const popoverPreset = popover?.kind === "preset" ? presets.find((p) => p.id === popover.id) : undefined;

  return (
    <div className={`app${lecture ? " lecture" : ""}`}>
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
          <button className="lecture-btn" aria-label="강의 모드 (F5)" title="강의 모드 (F5)" onClick={enterLecture} disabled={!currentPage}>
            <Presentation size={19} /> 강의 모드
          </button>
          <span className="topbar-sep" />
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
          <IconButton
            label="더보기"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPopover(null);
              setMenu({ kind: "more", x: r.right - 250, y: r.bottom + 6 });
            }}
          >
            <EllipsisVertical size={22} />
          </IconButton>
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
        <IconButton label="펜" active={tool === "pen" && !sideEraser && !textMode} onClick={(e) => onToolButton("pen", e)}>
          <PenLine size={24} />
          {tool === "pen" && <span className="tool-color-dot" style={{ background: activePreset.color }} />}
        </IconButton>
        <IconButton label="형광펜" active={tool === "highlighter" && !sideEraser && !textMode} onClick={(e) => onToolButton("highlighter", e)}>
          <Highlighter size={24} />
          {tool === "highlighter" && <span className="tool-color-dot" style={{ background: activePreset.color }} />}
        </IconButton>
        <IconButton label={sideEraser ? "지우개 (사이드 버튼)" : "지우개"} active={erasing && !textMode} onClick={(e) => onToolButton("eraser", e)}>
          <Eraser size={24} />
          {sideEraser && <span className="side-badge" aria-hidden="true" />}
        </IconButton>
        <IconButton
          label="텍스트 상자"
          active={textMode}
          disabled={!currentPage}
          onClick={() => {
            if (textMode) {
              leaveTextMode();
              return;
            }
            setPopover(null);
            setTextMode(true);
            showToast("페이지를 누르면 글상자가 생깁니다. 상자를 누르면 옮기기·고치기·링크");
          }}
        >
          <Type size={23} />
        </IconButton>
        <IconButton label="링크 만들기" disabled={!currentPage} onClick={() => createLinkBox()}>
          <Link2 size={23} />
        </IconButton>
        {boxClip && (
          <IconButton label="상자 붙여넣기" disabled={!currentPage} onClick={() => pasteClip()}>
            <ClipboardPaste size={22} />
          </IconButton>
        )}
        <span className="toolrow-sep" />
        <IconButton label="이 페이지 필기 지우기" disabled={strokes.length === 0} onClick={() => inkAction({ type: "clear" })}>
          <Trash2 size={22} />
        </IconButton>
        <IconButton label={paletteOpen ? "펜 바 감추기" : "펜 바 보이기"} active={paletteOpen} onClick={() => setPaletteOpen((v) => !v)}>
          <Palette size={22} />
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
            {isWebPage(currentPage) && (
              <IconButton label="페이지 새로고침" onClick={reloadWebPage}>
                <RotateCw size={22} />
              </IconButton>
            )}
          </>
        )}
      </nav>

      <div className="workspace">
        {pagePanelOpen && !lecture && doc.pages.length > 0 && (
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
          lecture={lecture}
          inkOff={textMode}
          webReloads={webReloads}
          onLongPress={onLongPress}
          penLongPress={!erasing}
          onFingerTapWeb={() => {
            setWebMode("interact");
            showToast("조작 모드로 바꿨습니다. 웹 페이지를 다시 눌러 주세요 (S펜은 판서)");
          }}
          pageOverlay={(size) =>
            currentPage && (
              <BoxLayer
                page={currentPage}
                pages={doc.pages}
                hidden={doc.hidden}
                size={size}
                editMode={textMode}
                selectedId={selectedBox}
                editingId={editingBox}
                onCreate={createBox}
                onSelect={(id) => {
                  setSelectedBox(id);
                  if (!id) setEditingBox(null);
                }}
                onStartEdit={(id) => {
                  setSelectedBox(id);
                  setEditingBox(id);
                }}
                onText={(id, text) => editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { text }))}
                onEndEdit={endEdit}
                onMove={(id, x, y) => editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { x, y }))}
                onFollow={followLink}
                onLink={(id) => setLinkDialog({ boxId: id, created: false })}
                onResize={resizeBox}
                onBoxSize={(id, w, h, size) => editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { w, h, size }))}
                onColor={(id, color) => {
                  setTextColor(color);
                  editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { color }));
                }}
                onCopy={(id) => {
                  copyBox(id);
                  showToast("상자를 복사했습니다. 붙일 곳에서 붙여넣기");
                }}
                onCut={(id) => cutBox(id)}
                onDelete={(id) => deleteBox(id)}
              />
            )
          }
          navExtra={
            lecture && (
              <>
                <span className="page-nav-sep" />
                <button aria-label="실행 취소" disabled={!pageInk?.past.length} onClick={() => inkAction({ type: "undo" })}>
                  <Undo2 size={20} />
                </button>
                <button
                  aria-label="지우개"
                  aria-pressed={erasing}
                  className={erasing ? "on" : undefined}
                  onClick={() => {
                    if (tool === "eraser") selectPreset(activePresetId);
                    else {
                      setTool("eraser");
                      if (onInteractive) setWebMode("ink");
                    }
                  }}
                >
                  <Eraser size={20} />
                </button>
                {isWebPage(currentPage) && (
                  <button aria-label="페이지 새로고침" onClick={reloadWebPage}>
                    <RotateCw size={20} />
                  </button>
                )}
                {onInteractive && (
                  <button
                    aria-label={webMode === "ink" ? "조작 모드로" : "판서 모드로"}
                    className={webMode === "ink" ? "on" : undefined}
                    onClick={() => setWebMode((m) => (m === "ink" ? "interact" : "ink"))}
                  >
                    {webMode === "ink" ? <PenLine size={20} /> : <MousePointer2 size={20} />}
                  </button>
                )}
                <button
                  aria-label={paletteOpen ? "펜 바 감추기" : "펜 바 보이기"}
                  className={paletteOpen ? "on" : undefined}
                  onClick={() => setPaletteOpen((v) => !v)}
                >
                  <Palette size={20} />
                </button>
                <span className="page-nav-sep" />
                <button aria-label="강의 모드 끝내기" title="강의 모드 끝내기 (Esc)" onClick={exitLecture}>
                  <Minimize2 size={20} />
                </button>
              </>
            )
          }
        >
          {doc.pages.length === 0 && <div className="page-area-message">페이지가 없습니다. 페이지를 추가해 주세요.</div>}

          {paletteOpen && (
            <PenPalette
              presets={presets}
              activeId={erasing || textMode ? null : activePresetId}
              onSelect={selectPreset}
              onOpenSettings={openPresetSettings}
              onHide={() => {
                setPaletteOpen(false);
                setPopover(null);
                showToast("펜 바를 감췄습니다", { label: "다시 보이기", run: () => setPaletteOpen(true) });
              }}
            />
          )}

          {debugOpen && !lecture && (
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
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} {...menuGroups()} onClose={() => setMenu(null)} />
      )}
      {linkDialog && currentPage && (
        <LinkDialog
          pages={doc.pages}
          hidden={doc.hidden}
          assets={doc.assets}
          fromPageId={doc.pages.find((p) => p.boxes?.some((b) => b.id === linkDialog.boxId))?.id ?? currentPage.id}
          current={doc.pages.flatMap((p) => p.boxes ?? []).find((b) => b.id === linkDialog.boxId)?.link}
          onApply={applyLink}
          onRemove={removeLink}
          onClose={closeLinkDialog}
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
