import {
  Activity,
  BookImage,
  BringToFront,
  Shapes,
  SkipForward,
  ChevronLeft,
  Crop,
  ImagePlus,
  Move,
  MoveUpRight,
  Paintbrush,
  SendToBack,
  Copy,
  CopyPlus,
  EllipsisVertical,
  ExternalLink,
  Pencil,
  Scissors,
  ClipboardPaste,
  Eraser,
  Eye,
  EyeOff,
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
  Ruler,
  Sparkles,
  Redo2,
  RotateCw,
  Share2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  addBox,
  BOX_COLORS,
  boxesOf,
  boxLabel,
  boxPlainLabel,
  copyBoxes,
  formatBox,
  isDangling,
  DEFAULT_BOX_SIZE,
  LINK_COLOR,
  makeClip,
  pageNumberLabel,
  pasteBoxes,
  patchBox,
  removeBox,
  setBoxLink,
  stepBoxSize,
  type BoxClip,
} from "./doc/boxes";
import { getClip, setClip, type AppClip, type PageClip, type StickerClip } from "./doc/clipboard";
import { pageAssetIds, pdfPagesUsed, planPaste } from "./doc/pageClip";
import {
  addStickers,
  copyStickers,
  newSticker,
  patchSticker,
  placePasted,
  removeSticker,
  reorderSticker,
  stickerHeight,
  stickersOf,
} from "./doc/stickers";
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
  type Asset,
  type BlankBackground,
  type BoxLink,
  type DocState,
  type Page,
  type Sticker,
  type TextBox,
  type BoxArrow,
  type BoxBorder,
} from "./doc/types";
import { parseYouTube } from "./doc/youtube";
import { applyInk, type InkAction, type InkBook } from "./ink/history";
import { docThumbPage, setDocThumbPage, useLibraryView } from "./store/library";
import { snapshotPage, thumbTarget } from "./view/pageSnapshot";
import { DEFAULT_PRESETS, ERASER_LEVELS } from "./ink/palette";
import type { InkTool, PenPreset, Stroke, Tool } from "./ink/types";
import { safeFileName, shareOrDownload } from "./lib/files";
import { onPenDown, onSideButtonChange, penButtonRecently, pointerKind } from "./lib/inputState";
import { hasShape, SHAPE_NAMES, shapeAt, withShape, type ShapeTool } from "./ink/shapes";
import { ShapePicker } from "./ui/ShapePicker";
import { followDetour, stepSkipping, type Detour } from "./doc/detours";
import { addArrow, flipArrow, moveArrowEnd, patchArrow, removeArrow, type ArrowTarget } from "./doc/arrows";
import { cleanFormat, type BoxFormat } from "./doc/boxFonts";
import { josa } from "./lib/josa";
import { ShapeEditor } from "./view/ShapeEditor";
import { isNativeApp, showToast } from "./lib/platform";
import { usePersistentFlag } from "./lib/usePersistentFlag";
import { collectAssets, importAssets } from "./store/assetTransfer";
import { putAsset, saveInk, saveManifest, setThumb, toManifest, type OpenedDoc } from "./store/docStore";
import { readSystemClipboard, type SystemClip } from "./lib/systemClipboard";
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
import { StickerEditor } from "./view/StickerEditor";
import { stickerBox } from "./view/stickerGeometry";
import { StickerLayer } from "./view/StickerLayer";
import { fittedSize } from "./view/textMeasure";

type Popover =
  | { kind: "preset"; id: string; left: number; top: number }
  | { kind: "eraser"; left: number; top: number }
  /** 도형 고르기 (고르면 도형 모드) */
  | { kind: "shapes"; left: number; top: number }
  | null;
type FileTarget = { kind: "pdf" | "html" | "image" | "video" | "sticker"; index: number; at?: { x: number; y: number } };

const NO_STROKES: Stroke[] = [];
/** 페이지 구성 저장을 이만큼 모았다가 한 번에 쓴다 */
const MANIFEST_SAVE_DELAY = 400;
/** 스티커 그림은 긴 변을 이만큼까지 줄여 보관한다 */
const STICKER_MAX_SIDE = 2048;
/** 다른 앱의 글로 새 페이지를 만들 때 담는 글 길이 */
const NEW_PAGE_TEXT_MAX = 5000;

/** 앱 안 클립보드에 담은 것과 다른 앱에서 복사했을 수 있는 때의 앞뒤를 가리는 순번 */
let clipboardSeq = 0;
const nextSeq = () => ++clipboardSeq;

const ACCEPT: Record<FileTarget["kind"], string> = {
  pdf: "application/pdf,.pdf",
  html: "text/html,.html,.htm",
  image: IMAGE_ACCEPT,
  video: VIDEO_ACCEPT,
  sticker: IMAGE_ACCEPT,
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
  const inkRef = useRef(ink);
  inkRef.current = ink;
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
  /** 도형 보정(긋다 멈추면 도형·직선)·필기 보정(뗄 때 글씨를 반듯하게) */
  const [straighten, setStraighten] = usePersistentFlag("lessondeck.straighten", true);
  const [beautify, setBeautify] = usePersistentFlag("lessondeck.beautify", true);
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
  /** 새 글상자 배경 (기본 자동: 글자가 잘 보이는 색). 상자에서 고르면 다음 상자도 그 배경 */
  const [boxBg, setBoxBg] = useState<string | undefined>("auto");
  /** 새 글상자 테두리 (상자에서 고르면 다음 상자도) */
  const [boxBorderStyle, setBoxBorderStyle] = useState<BoxBorder | undefined>(undefined);
  /** 지난번에 고른 글상자 서식·글자 크기 (다음 새 상자에도, v0.25) */
  const [boxFormat, setBoxFormat] = useState<BoxFormat>({});
  const [boxSize, setBoxSize] = useState(DEFAULT_BOX_SIZE);
  /** 화살표로 잇는 중인 시작 상자 / 고른 화살표 (텍스트 모드) */
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  /** 길게 누르기·더보기 메뉴 */
  const [menu, setMenu] = useState<
    | { kind: "box"; x: number; y: number; boxId: string }
    | { kind: "sticker"; x: number; y: number; stickerId: string }
    | { kind: "shape"; x: number; y: number; strokeId: string }
    | { kind: "page"; x: number; y: number; at?: { x: number; y: number } }
    | { kind: "pageItem"; x: number; y: number; pageId: string }
    | { kind: "more"; x: number; y: number }
    | null
  >(null);
  /** 고른 도형 획 (손잡이로 크기·회전·옮기기) / 끄는 중의 모양 */
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [shapeDraft, setShapeDraft] = useState<Stroke | null>(null);
  /** 도형 모드: 고른 도형을 펜으로 끌어 그리기 (auto: 그린 획을 뗄 때 알아봄). 펜·형광펜·지우개·텍스트를 고르면 끝 */
  const [shapeTool, setShapeTool] = useState<ShapeTool | null>(null);
  /** 복사·잘라낸 글상자·스티커·페이지 (문서를 바꿔도 남음) */
  const [clip, setClipState] = useState<AppClip | null>(getClip);
  const boxClip = clip?.kind === "boxes" ? clip.clip : null;
  /** 앱 안 클립보드에 담은 때와, 앱을 떠났거나(다른 앱에서 복사했을 수 있음) 앱 안 입력칸에서 복사한 때 (순번) */
  const clipSeq = useRef(0);
  const leaveSeq = useRef(0);
  /** 고른 이미지 스티커, 자르는 중인지, 끄는 중의 모양 */
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [liveSticker, setLiveSticker] = useState<Sticker | null>(null);
  /** 메뉴의 "꾸미기"로 골랐을 때 꾸미기 창을 바로 연다 */
  const [stickerStyleReq, setStickerStyleReq] = useState(0);
  /** 강의 모드: 도구 막대·페이지 바를 숨기고 페이지를 화면 가득 */
  const [lecture, setLecture] = useState(false);
  const lectureRef = useRef(lecture);
  lectureRef.current = lecture;
  // 강의 모드: 페이지 링크로 보고 돌아온 쪽은 다음·이전으로 넘길 때 건너뛴다 (화면 위 단추로 켜고 끔, 기기에 저장)
  const [skipLinked, setSkipLinked] = usePersistentFlag("lessondeck.skipLinkedPages", true);
  const skipLinkedRef = useRef(skipLinked);
  skipLinkedRef.current = skipLinked;
  const detours = useRef<Detour[]>([]);
  const [seenViaLink, setSeenViaLink] = useState<string[]>([]);
  const seenRef = useRef(seenViaLink);
  seenRef.current = seenViaLink;
  /** 강의 모드에 들어가며 브라우저 전체 화면을 켰는지 (나올 때 같이 끈다) */
  const lectureFs = useRef(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<FileTarget>({ kind: "pdf", index: 0 });
  const [fileAccept, setFileAccept] = useState(ACCEPT.pdf);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];
  const pageIndex = Math.max(
    0,
    doc.pages.findIndex((p) => p.id === currentId),
  );
  const currentPage: Page | undefined = doc.pages[pageIndex];
  const pageInk = currentPage ? ink[currentPage.id] : undefined;
  const strokes = pageInk?.present ?? NO_STROKES;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  // 도형을 끄는 동안은 원래 획을 빼고 그린다 (고치는 화면이 바뀐 모양을 보여 준다)
  const canvasStrokes = useMemo(() => (shapeDraft ? strokes.filter((s) => s.id !== shapeDraft.id) : strokes), [strokes, shapeDraft]);
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
      .then(() => updateThumb(current, savedInkRef.current))
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
  /** 홈 카드 썸네일 그림을 지금 필기로 다시 만든다 (너무 오래 걸리면 기다리지 않음) */
  const refreshThumb = useCallback(
    () => Promise.race([updateThumb(docRef.current, savedInkRef.current), new Promise<void>((r) => setTimeout(r, 1500))]).catch(() => undefined),
    [],
  );
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
    const onHide = () => document.visibilityState === "hidden" && flushManifest().then(refreshThumb);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flushManifest();
    };
  }, [flushManifest]);

  const goHome = async () => {
    await flushManifest();
    await refreshThumb();
    onHome();
  };

  // ── 홈 카드 썸네일 (v0.22) ──
  const libraryView = useLibraryView();
  const thumbPageId = libraryView?.lib.covers[doc.id]?.page;
  const chooseThumb = async (pageId: string) => {
    const removing = thumbPageId === pageId;
    await setDocThumbPage([doc.id], removing ? null : pageId);
    await refreshThumb();
    const label = pageNumberLabel(docRef.current.pages, docRef.current.hidden, pageId) ?? "이 페이지";
    showToast(removing ? "썸네일을 뺐습니다. 문서 목록에 표지만 보입니다" : `${josa(label, "을", "를")} 문서 목록 썸네일로 골랐습니다. 표지 아래에 반쯤 보입니다`);
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

  const pickFile = (kind: FileTarget["kind"], index: number, at?: { x: number; y: number }) => {
    fileTarget.current = { kind, index, at };
    setFileAccept(ACCEPT[kind]);
    // accept가 바뀐 뒤에 열어야 파일 종류가 맞게 걸린다
    setTimeout(() => fileRef.current?.click());
  };

  const onPickFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    const { kind, index, at } = fileTarget.current;
    if (kind === "sticker") await insertStickers(files, at);
    else if (kind === "pdf") await insertPdf(files[0], index);
    else if (kind === "html") await insertHtml(files[0], index);
    else await insertMedia(files, index);
  };

  // ── 페이지 관리 ─────────────────────────────────────────
  /** 숨긴 페이지는 건너뛰고 넘긴다. 강의 모드에서는 링크로 보고 돌아온 쪽도 (켜 둔 경우) */
  const goTo = useCallback((delta: 1 | -1) => {
    const { pages, hidden } = docRef.current;
    const skip = lectureRef.current && skipLinkedRef.current ? seenRef.current : [];
    if (!skip.length) {
      const next = stepVisible(pages, hidden, currentIdRef.current, delta);
      if (next) setCurrentId(next);
      return;
    }
    const { next, skipped } = stepSkipping(pages, hidden, skip, currentIdRef.current, delta);
    if (!next) return;
    if (skipped.length) {
      const labels = skipped.map((id) => pageNumberLabel(pages, hidden, id)).join("·");
      showToast(`링크로 본 ${josa(labels, "은", "는")} 건너뜁니다`);
    }
    setCurrentId(next);
  }, []);

  // 다른 페이지로 넘어가면 웹앱·동영상 페이지는 다시 조작 모드로
  useEffect(() => setWebMode("interact"), [currentId]);
  // 페이지를 넘기면 고른 상자·스티커를 놓는다
  useEffect(() => {
    setSelectedBox(null);
    setEditingBox(null);
    setSelectedSticker(null);
    setCropping(false);
    setSelectedShape(null);
    setConnectFrom(null);
    setSelectedArrow(null);
  }, [currentId]);

  const addBlank = (index: number, background: BlankBackground) => {
    // 바로 앞(없으면 뒤) 페이지와 같은 비율로 만든다
    const neighbor = doc.pages[index - 1] ?? doc.pages[index];
    const aspect = neighbor ? pageAspect(neighbor, doc.assets) : A4_PORTRAIT;
    addAssetAndPages(null, index, [{ id: newPageId(), kind: "blank", background, aspect }]);
  };

  const deletePage = (id: string, message?: string) => {
    const { pages } = docRef.current;
    const index = pages.findIndex((p) => p.id === id);
    const page = pages[index];
    if (!page || pages.length <= 1) return;
    const nextId = pageAfterRemoval(pages, id);
    setDoc((d) => ({ ...d, pages: removePage(d.pages, id) }));
    if (currentIdRef.current === id && nextId) setCurrentId(nextId);
    // 필기 기록은 남겨 두었다가 되돌리기 때 그대로 살린다
    showToast(message ?? `${index + 1}쪽을 삭제했습니다`, {
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
    const copy: Page = { ...page, id: newPageId(), ...copyBoxes(page), stickers: copyStickers(page.stickers) };
    setDoc((d) => ({ ...d, pages: insertPages(d.pages, index + 1, [copy]) }));
    setInk((b) => (b[id] ? { ...b, [copy.id]: { past: [], present: b[id].present, future: [] } } : b));
    setCurrentId(copy.id);
  };

  // ── 페이지 복사·잘라내기·붙여넣기 (다른 문서에도) ──────────
  const putClip = (next: AppClip) => {
    setClip(next);
    setClipState(next);
    clipSeq.current = nextSeq();
  };

  /** 페이지 + 필기 + 글상자·스티커 + 쓰는 원본을 담는다 */
  const makePageClip = async (ids: string[]): Promise<PageClip> => {
    const d = docRef.current;
    const pages = ids.map((id) => d.pages.find((p) => p.id === id)).filter((p): p is Page => !!p);
    const ink: PageClip["ink"] = {};
    const labels: PageClip["labels"] = {};
    for (const p of pages) {
      const strokes = inkRef.current[p.id]?.present;
      if (strokes?.length) ink[p.id] = strokes;
      for (const b of p.boxes ?? []) if (b.link?.type === "page") labels[b.id] = boxPlainLabel(b, d.pages, d.hidden);
    }
    const assets = await collectAssets(d.id, [...new Set(pages.flatMap(pageAssetIds))], d.assets);
    return { docId: d.id, pages, ink, labels, assets };
  };

  const copyPage = async (id: string, cut = false) => {
    const { pages } = docRef.current;
    if (cut && pages.length <= 1) {
      showToast("마지막 한 장은 잘라낼 수 없습니다. 복사를 쓰세요");
      return;
    }
    const n = pages.findIndex((p) => p.id === id) + 1;
    try {
      putClip({ kind: "pages", clip: await makePageClip([id]) });
    } catch (err) {
      console.error(err);
      showToast("페이지를 복사하지 못했습니다");
      return;
    }
    if (cut) deletePage(id, `${n}쪽을 잘라냈습니다. 붙일 곳(다른 문서도)의 + 메뉴에서 붙여넣기`);
    else showToast(`${n}쪽을 복사했습니다. 붙일 곳(다른 문서도)의 + 메뉴나 길게 누르기 메뉴에서 붙여넣기`);
  };

  /** 복사한 페이지를 index 자리에 붙인다. 다른 문서의 페이지면 원본도 이 문서에 넣는다 */
  const pastePages = async (index: number) => {
    const c = getClip();
    if (c?.kind !== "pages") return;
    const pc = c.clip;
    const d0 = docRef.current;
    const other = pc.docId !== d0.id;
    if (other) showToast("페이지를 붙이는 중…");
    try {
      const imported = await importAssets(d0, pc.docId, pc.assets, other ? pdfPagesUsed(pc.pages) : {});
      const plan = planPaste(pc, d0.id, docRef.current.pages, imported.assetMap, imported.pdfIndexMap);
      setDoc((d) => ({ ...d, assets: { ...d.assets, ...imported.added }, pages: insertPages(d.pages, index, plan.pages) }));
      if (Object.keys(plan.ink).length) {
        setInk((b) => ({
          ...b,
          ...Object.fromEntries(Object.entries(plan.ink).map(([id, strokes]) => [id, { past: [], present: strokes, future: [] }])),
        }));
      }
      if (plan.pages[0]) setCurrentId(plan.pages[0].id);
      showToast(`${plan.pages.length}쪽을 붙였습니다${plan.unlinked ? " (다른 문서로 가던 링크는 글자만 남김)" : ""}`);
    } catch (err) {
      console.error(err);
      showToast("페이지를 붙이지 못했습니다");
    }
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

  // ── 도형 ───────────────────────────────────────────────
  /** 화면의 페이지: 확대돼 있어도 페이지 px로 바꾸려고 (rect는 화면, size는 페이지 px) */
  const pageGeometry = () => {
    const el = document.querySelector<HTMLElement>(".page");
    if (!el || !el.offsetWidth) return null;
    return { rect: el.getBoundingClientRect(), size: { width: el.offsetWidth, height: el.offsetHeight } };
  };
  /** 화면 좌표에 있는 도형 획 (선에서 화면 14px 안) */
  const shapeAtClient = (clientX: number, clientY: number): Stroke | null => {
    const g = pageGeometry();
    if (!g || !g.rect.width) return null;
    const k = g.size.width / g.rect.width;
    return shapeAt(strokesRef.current, (clientX - g.rect.left) * k, (clientY - g.rect.top) * k, g.size, 14 * k);
  };
  const replaceStroke = (next: Stroke) => inkAction({ type: "commit", strokes: strokesRef.current.map((s) => (s.id === next.id ? next : s)) });
  const deleteShape = (id: string) => {
    inkAction({ type: "commit", strokes: strokesRef.current.filter((s) => s.id !== id) });
    setSelectedShape(null);
  };
  const duplicateShape = (id: string) => {
    const s = strokesRef.current.find((x) => x.id === id);
    const g = pageGeometry();
    if (!s || !hasShape(s) || !g) return;
    const shift = 0.03;
    const copy = withShape({ ...s, id: newId("s") }, { ...s.shape, cx: s.shape.cx + shift, cy: s.shape.cy + (shift * g.size.width) / g.size.height }, g.size);
    inkAction({ type: "commit", strokes: [...strokesRef.current, copy] });
    setSelectedShape(copy.id);
  };
  /** 지금 고른 펜의 색·굵기로 */
  const restyleShape = (id: string) => {
    const s = strokesRef.current.find((x) => x.id === id);
    const g = pageGeometry();
    if (!s || !hasShape(s) || !g) return;
    replaceStroke(withShape({ ...s, tool: activePreset.tool, color: activePreset.color, width: activePreset.width }, s.shape, g.size));
  };
  /** 도형 모드 켜기: 고른 도형(또는 자동)을 펜을 대는 곳에서부터 그린다 */
  const enterShapeMode = (kind: ShapeTool) => {
    setPopover(null);
    if (textMode) leaveTextMode();
    if (tool === "eraser") setTool(activePreset.tool);
    if (onInteractive) setWebMode("ink");
    setShapeTool(kind);
    showToast(
      kind === "auto"
        ? "자동 도형: 그린 획을 뗄 때 원·사각형 같은 도형으로 바꿉니다"
        : `${SHAPE_NAMES[kind]}: 펜을 대고 끌어서 그리세요 (톡 누르면 기본 크기)`,
    );
  };
  // 텍스트 모드로 가면 도형 모드는 끝
  useEffect(() => {
    if (textMode) setShapeTool(null);
  }, [textMode]);
  // 도형을 고른 채 다른 곳을 누르면 놓는다 (누름은 그대로 지나가 바로 이어 쓸 수 있다)
  useEffect(() => {
    if (!selectedShape) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest?.(".se-ui")) return;
      setSelectedShape(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [selectedShape]);
  // 손가락으로 도형을 톡 누르면 고른다 (손가락 필기가 꺼져 있을 때: 손가락은 넘기기·확대·고르기)
  const shapeTapOff = useRef(false);
  shapeTapOff.current = fingerDraw || textMode || !!selectedSticker || (onInteractive && webMode === "interact");
  const shapeAtClientRef = useRef(shapeAtClient);
  shapeAtClientRef.current = shapeAtClient;
  useEffect(() => {
    let tap: { id: number; x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      tap =
        pointerKind(e) === "touch" && e.isPrimary && (e.target as Element).closest?.(".page .ink-live")
          ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
          : null;
    };
    const onUp = (e: PointerEvent) => {
      const t = tap;
      tap = null;
      if (!t || t.id !== e.pointerId || shapeTapOff.current) return;
      if (performance.now() - t.t > 350 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return;
      const s = shapeAtClientRef.current(e.clientX, e.clientY);
      if (s) setSelectedShape(s.id);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, []);

  // S펜 사이드 버튼을 누르는 동안 툴바의 지우개를 켠다
  useEffect(() => onSideButtonChange(setSideEraser), []);
  // 펜 모드 (오픈소스 화이트보드 Excalidraw·tldraw와 같은 방식): 손가락 필기를 켜 둔 채 S펜을 쓰면 손가락 필기를 끈다.
  // S펜이 있으면 손은 넘기기·확대에만 쓰여 손가락·손바닥이 글씨를 쓰는 일이 없다. 끈 뒤 ✋로 다시 켜면 이번 실행 동안은 그대로 둔다.
  const fingerDrawRef = useRef(fingerDraw);
  fingerDrawRef.current = fingerDraw;
  const penModeApplied = useRef(false);
  useEffect(
    () =>
      onPenDown(() => {
        if (!fingerDrawRef.current || penModeApplied.current) return;
        penModeApplied.current = true;
        setFingerDraw(false);
        showToast("S펜을 써서 손가락 필기를 껐습니다 (손가락은 넘기기·확대, ✋로 다시 켜기)");
      }),
    [setFingerDraw],
  );

  // ── 강의 모드 ──────────────────────────────────────────
  const enterLecture = useCallback(() => {
    setPopover(null);
    setAddMenu(null);
    setTextMode(false);
    setSelectedBox(null);
    setEditingBox(null);
    setSelectedSticker(null);
    setCropping(false);
    setSelectedShape(null);
    detours.current = [];
    setSeenViaLink([]);
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
    setConnectFrom(null);
    setSelectedArrow(null);
  };

  // ── 상자 화살표 ──
  /** 이 상자에서 화살표 시작: 다음에 누른 상자로 잇거나, 누른 곳(아무 곳)을 가리킨다 */
  const startConnect = (boxId: string) => {
    setTextMode(true);
    setSelectedBox(boxId);
    setEditingBox(null);
    setSelectedArrow(null);
    setConnectFrom(boxId);
  };
  const connectTo = (target: ArrowTarget) => {
    const from = connectFrom;
    setConnectFrom(null);
    if (!from || !currentPage) return;
    const pageId = currentPage.id;
    const color = findBox(from)?.color ?? "#111111";
    // 같은 두 상자를 이미 이었으면 그 화살표를 고른다
    const id = (typeof target === "string" && currentPage.arrows?.find((a) => a.from === from && a.to === target)?.id) || newId("a");
    setDoc((d) => ({ ...d, pages: addArrow(d.pages, pageId, from, target, color, id).pages }));
    setSelectedBox(null);
    setSelectedArrow(id);
    showToast(
      typeof target === "string"
        ? "화살표로 이었습니다. 가운데 동그라미를 끌면 휘고, 막대에서 방향·색을 바꿉니다"
        : "화살표를 그었습니다. 끝 동그라미로 옮기고, 가운데 동그라미를 끌면 휩니다",
    );
  };
  const editArrows = (fn: (pages: Page[], pageId: string) => Page[]) => {
    if (!currentPage) return;
    const pageId = currentPage.id;
    setDoc((d) => ({ ...d, pages: fn(d.pages, pageId) }));
  };
  const deleteArrow = (id: string) => {
    const pageId = currentPage?.id;
    const arrow = currentPage?.arrows?.find((a) => a.id === id);
    editArrows((pages, pid) => removeArrow(pages, pid, id));
    setSelectedArrow(null);
    showToast("화살표를 지웠습니다", {
      label: "되돌리기",
      run: () =>
        arrow &&
        setDoc((d) => ({ ...d, pages: d.pages.map((p) => (p.id === pageId ? { ...p, arrows: [...(p.arrows ?? []), arrow] } : p)) })),
    });
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
    const box: TextBox = {
      id: newId("b"),
      x,
      y,
      text: "",
      size: boxSize,
      color: textColor,
      ...(boxBg ? { bg: boxBg } : {}),
      ...(boxBorderStyle ? { border: boxBorderStyle } : {}),
      ...boxFormat,
    };
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
      return patchBox(pages, pageId, id, { size: stepBoxSize(box.size, step) });
    });

  /** 크기가 정해진 상자의 글자 크기를 글에 맞춰 다시 적어 둔다 (서식·크기를 바꾼 뒤) */
  const refit = (pages: Page[], pageId: string, id: string): Page[] => {
    const page = pages.find((p) => p.id === pageId);
    const box = page?.boxes?.find((b) => b.id === id);
    if (!page || !box || box.w == null || box.h == null) return pages;
    const size = fittedSize(box, boxLabel(box, pages, docRef.current.hidden), 1 / pageAspect(page, docRef.current.assets));
    return size === box.size ? pages : patchBox(pages, pageId, id, { size });
  };

  /** 서식 (v0.25): 글꼴·굵게·기울임·밑줄·줄 맞춤. 다음 새 상자에도 쓴다 */
  const formatTextBox = (id: string, patch: BoxFormat) => {
    setBoxFormat((f) => cleanFormat({ ...f, ...patch }));
    editBoxes(id, (pages, pageId) => refit(formatBox(pages, pageId, id, patch), pageId, id));
  };

  /** 글자 크기 고르기 (v0.25): 크기가 정해진 상자는 글자가 그 크기쯤 되도록 상자를 키우고 줄인다 */
  const sizeTextBox = (id: string, size: number) => {
    setBoxSize(size);
    editBoxes(id, (pages, pageId, box) => {
      if (box.w == null || box.h == null) return patchBox(pages, pageId, id, { size });
      const page = pages.find((p) => p.id === pageId)!;
      const ratio = 1 / pageAspect(page, docRef.current.assets);
      const now = fittedSize(box, boxLabel(box, pages, docRef.current.hidden), ratio);
      const factor = size / Math.max(1, now);
      const w = Math.min(1 - box.x, Math.max(0.04, box.w * factor));
      const h = Math.min(1 - box.y, Math.max(0.02, box.h * factor));
      return refit(patchBox(pages, pageId, id, { w, h }), pageId, id);
    });
  };

  const deleteBox = (id: string, message = "상자를 지웠습니다") => {
    // 되돌리기용: 이 상자와, 이 상자가 만든 돌아가기 링크, 이 상자에 닿은 화살표
    const removed: { pageId: string; box: TextBox }[] = [];
    const removedArrows: { pageId: string; arrow: BoxArrow }[] = [];
    for (const p of docRef.current.pages) {
      for (const b of p.boxes ?? []) if (b.id === id || b.backOf === id) removed.push({ pageId: p.id, box: b });
      for (const a of p.arrows ?? []) if (a.from === id || a.to === id) removedArrows.push({ pageId: p.id, arrow: a });
    }
    editBoxes(id, (pages, pageId) => removeBox(pages, pageId, id));
    setSelectedBox(null);
    setEditingBox(null);
    showToast(message, {
      label: "되돌리기",
      run: () =>
        setDoc((d) => {
          const pages = removed.reduce((ps, r) => addBox(ps, r.pageId, r.box), d.pages);
          return {
            ...d,
            pages: pages.map((p) => {
              const back = removedArrows.filter((r) => r.pageId === p.id).map((r) => r.arrow);
              return back.length ? { ...p, arrows: [...(p.arrows ?? []), ...back] } : p;
            }),
          };
        }),
    });
  };

  // 복사·잘라내기·붙여넣기 (링크도 함께). 다른 문서에 붙여도 된다
  const findBox = (id: string) => docRef.current.pages.flatMap((p) => p.boxes ?? []).find((b) => b.id === id);

  /** 상자를 클립보드에 담는다. 시스템 클립보드에는 보이는 글자를 넣는다 (다른 앱에 붙일 수 있게) */
  const copyBox = (id: string, systemText = true): BoxClip | null => {
    const box = findBox(id);
    if (!box) return null;
    const clip = makeClip(docRef.current.id, [box], docRef.current.pages, docRef.current.hidden);
    putClip({ kind: "boxes", clip });
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
  const pasteText = (text: string, at?: { x: number; y: number }) => {
    if (!currentPage) return;
    const trimmed = text.trim().slice(0, 2000);
    if (!trimmed) return;
    const box = { ...textToBox(trimmed, textColor, undefined, boxBg), ...boxFormat };
    const clip: BoxClip = { docId: docRef.current.id, boxes: [box], labels: [trimmed] };
    pasteClip(clip, at);
  };

  /** 상자를 그 자리 옆에 하나 더 (클립보드는 그대로) */
  const duplicateBox = (id: string) => {
    const box = findBox(id);
    if (!box || !currentPage) return;
    const clip = makeClip(docRef.current.id, [box], docRef.current.pages, docRef.current.hidden);
    pasteClip(clip);
  };

  // ── 이미지 스티커 ───────────────────────────────────────
  const findSticker = (id: string) => {
    for (const page of docRef.current.pages) {
      const sticker = page.stickers?.find((s) => s.id === id);
      if (sticker) return { page, sticker };
    }
    return null;
  };

  /** 스티커가 들어 있는 페이지를 찾아 목록을 바꾼다 */
  const editSticker = (id: string, fn: (pages: Page[], pageId: string) => Page[]) =>
    setDoc((d) => {
      const owner = d.pages.find((p) => p.stickers?.some((s) => s.id === id));
      return owner ? { ...d, pages: fn(d.pages, owner.id) } : d;
    });

  const selectSticker = (id: string, style = false) => {
    setSelectedSticker(id);
    setCropping(false);
    setSelectedBox(null);
    setEditingBox(null);
    setPopover(null);
    if (style) setStickerStyleReq((n) => n + 1);
  };

  const deselectSticker = () => {
    setSelectedSticker(null);
    setCropping(false);
  };

  /** 그림 파일을 지금 페이지에 스티커로 붙인다 (at: 가운데로 둘 자리, 페이지 대비) */
  const insertStickers = async (files: File[], at?: { x: number; y: number }) => {
    const pageId = currentIdRef.current;
    let last: string | null = null;
    let i = 0;
    for (const file of files) {
      if (isVideoFile(file)) {
        showToast(`${file.name}: 그림 파일만 스티커로 붙일 수 있습니다`);
        continue;
      }
      try {
        if (/hei[cf]|tiff?$/i.test(file.name)) showToast(`${file.name} 변환 중…`);
        const prep = await prepareImage(file, STICKER_MAX_SIDE);
        const id = newId("img");
        await putAsset(docRef.current.id, id, prep.blob);
        const asset: Asset = {
          kind: "image",
          id,
          name: prep.name,
          mime: prep.mime,
          width: prep.width,
          height: prep.height,
          url: URL.createObjectURL(prep.blob),
        };
        const page = docRef.current.pages.find((p) => p.id === pageId);
        if (!page) return;
        const sticker = newSticker(id, prep.width, prep.height, pageAspect(page, docRef.current.assets), at, i++);
        setDoc((d) => ({ ...d, assets: { ...d.assets, [id]: asset }, pages: addStickers(d.pages, pageId, [sticker]) }));
        last = sticker.id;
      } catch (err) {
        console.error(err);
        showToast(`${file.name}: ${err instanceof Error ? err.message : "붙이지 못했습니다"}`);
      }
    }
    if (last) {
      selectSticker(last);
      showToast("스티커를 붙였습니다. 끌어서 옮기고, 모서리로 크기, 위 손잡이로 돌리기");
    }
  };

  const deleteSticker = (id: string, message = "스티커를 지웠습니다") => {
    const found = findSticker(id);
    if (!found) return;
    const { page, sticker } = found;
    const index = stickersOf(page).findIndex((s) => s.id === id);
    editSticker(id, (pages, pageId) => removeSticker(pages, pageId, id));
    deselectSticker();
    showToast(message, {
      label: "되돌리기",
      run: () =>
        setDoc((d) => ({
          ...d,
          pages: d.pages.map((p) => {
            if (p.id !== page.id) return p;
            const list = [...(p.stickers ?? [])];
            list.splice(index, 0, sticker);
            return { ...p, stickers: list };
          }),
        })),
    });
  };

  const makeStickerClip = async (id: string): Promise<StickerClip | null> => {
    const found = findSticker(id);
    if (!found) return null;
    const { page, sticker } = found;
    const d = docRef.current;
    const asset = mediaAsset(d.assets, sticker.asset);
    const aspect = pageAspect(page, d.assets);
    return {
      docId: d.id,
      stickers: [sticker],
      assets: await collectAssets(d.id, [sticker.asset], d.assets),
      heights: [asset ? stickerHeight(sticker, asset.width, asset.height, aspect) : sticker.w * aspect],
    };
  };

  const copySticker = async (id: string, cut = false) => {
    const c = await makeStickerClip(id);
    if (!c) return;
    putClip({ kind: "stickers", clip: c });
    if (cut) deleteSticker(id, "스티커를 잘라냈습니다. 붙일 곳(다른 문서도)에서 붙여넣기");
    else showToast("스티커를 복사했습니다. 붙일 곳(다른 문서도)을 길게 눌러 붙여넣기");
  };

  /** 스티커 붙이기: 다른 문서의 스티커면 그림 원본도 이 문서에 넣는다 */
  const pasteStickers = async (c: StickerClip, at?: { x: number; y: number }) => {
    const pageId = currentIdRef.current;
    try {
      const imported = await importAssets(docRef.current, c.docId, c.assets);
      const page = docRef.current.pages.find((p) => p.id === pageId);
      if (!page) return;
      const placed = placePasted(stickersOf(page), c.stickers, imported.assetMap, at, c.heights);
      setDoc((d) => ({ ...d, assets: { ...d.assets, ...imported.added }, pages: addStickers(d.pages, pageId, placed) }));
      const last = placed.at(-1);
      if (last) selectSticker(last.id);
    } catch (err) {
      console.error(err);
      showToast("스티커를 붙이지 못했습니다");
    }
  };

  const duplicateSticker = async (id: string) => {
    const c = await makeStickerClip(id);
    if (c) await pasteStickers(c);
  };

  /** 화면 좌표의 스티커 (위에 있는 것부터, 돌린 모양 그대로) */
  const stickerAt = (clientX: number, clientY: number): string | null => {
    const pageEl = document.querySelector<HTMLElement>(".page");
    const page = docRef.current.pages.find((p) => p.id === currentIdRef.current);
    if (!pageEl || !page?.stickers?.length) return null;
    const r = pageEl.getBoundingClientRect();
    const size = { width: pageEl.offsetWidth, height: pageEl.offsetHeight };
    const px = ((clientX - r.left) * size.width) / Math.max(1, r.width);
    const py = ((clientY - r.top) * size.height) / Math.max(1, r.height);
    for (const s of [...page.stickers].reverse()) {
      const b = stickerBox(s, mediaAsset(docRef.current.assets, s.asset), size);
      const dx = px - b.cx;
      const dy = py - b.cy;
      const lx = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
      const ly = -dx * Math.sin(b.angle) + dy * Math.cos(b.angle);
      const pad = 6;
      if (Math.abs(lx) <= b.width / 2 + pad && Math.abs(ly) <= b.height / 2 + pad) return s.id;
    }
    return null;
  };

  /** 그 자리의 스티커를 고른다 (텍스트 모드에서 누르기, 고른 스티커 밖 누르기). 골랐으면 true */
  const pickStickerAt = (clientX: number, clientY: number): boolean => {
    const id = stickerAt(clientX, clientY);
    if (!id) return false;
    if (id !== selectedSticker) selectSticker(id);
    return true;
  };

  /** 클립보드에 든 것을 지금 페이지에 붙인다 (페이지면 지금 페이지 뒤에) */
  const pasteAny = (at?: { x: number; y: number }) => {
    const c = getClip();
    if (c?.kind === "boxes") pasteClip(c.clip, at);
    else if (c?.kind === "stickers") void pasteStickers(c.clip, at);
    else if (c?.kind === "pages") void pastePages(docRef.current.pages.findIndex((p) => p.id === currentIdRef.current) + 1);
  };

  // ── 다른 앱에서 복사한 것 (SPEC 5장): 앱 안 클립보드와 둘 중 나중에 복사한 쪽 ──────────
  /** 앱 안 클립보드에 담은 뒤 앱을 떠났거나 입력칸에서 복사했으면(또는 앱 안 클립보드가 비었으면) 기기 클립보드 먼저 */
  const preferSystem = () => !getClip() || leaveSeq.current > clipSeq.current;

  const nothingToPaste = (sys: SystemClip) =>
    showToast(sys.kind === "denied" ? sys.message : "붙여넣을 것이 없습니다. 다른 앱에서 그림·링크·글을 복사해 오세요");

  /** 페이지 안에 붙이기: 그림 → 스티커, 웹 주소 → 링크 상자, 글 → 글상자 */
  const pasteHere = async (at?: { x: number; y: number }) => {
    if (!preferSystem()) {
      pasteAny(at);
      return;
    }
    const sys = await readSystemClipboard();
    if (sys.kind === "image") await insertStickers([sys.file], at);
    else if (sys.kind === "text") pasteText(sys.text, at);
    else if (getClip()) pasteAny(at);
    else nothingToPaste(sys);
  };

  /** 옆 페이지와 같은 비율의 빈 페이지 */
  const blankPage = (index: number): Extract<Page, { kind: "blank" }> => {
    const { pages, assets } = docRef.current;
    const neighbor = pages[index - 1] ?? pages[index];
    return { id: newPageId(), kind: "blank", background: "plain", aspect: neighbor ? pageAspect(neighbor, assets) : A4_PORTRAIT };
  };

  /** 다른 앱의 글로 새 페이지: 유튜브·웹 주소 하나면 그 페이지, 아니면 빈 페이지 위 글상자 */
  const newPageFromText = (index: number, text: string) => {
    const trimmed = text.trim().slice(0, NEW_PAGE_TEXT_MAX);
    if (!/\s/.test(trimmed) && (parseYouTube(trimmed) || normalizeUrl(trimmed))) {
      addLink(index, trimmed, "url");
      return;
    }
    const page = { ...blankPage(index), boxes: [{ ...textToBox(trimmed, textColor, { x: 0.06, y: 0.05 }, boxBg), ...boxFormat }] };
    addAssetAndPages(null, index, [page]);
    showToast("복사한 글로 새 페이지를 만들었습니다");
  };

  /** 앱 안 클립보드를 새 페이지로: 페이지는 그대로, 글상자·스티커는 그것을 담은 빈 페이지 */
  const pasteClipAsPages = async (c: AppClip, index: number) => {
    if (c.kind === "pages") {
      await pastePages(index);
      return;
    }
    const blank = blankPage(index);
    if (c.kind === "boxes") {
      setDoc((d) => ({ ...d, pages: pasteBoxes(insertPages(d.pages, index, [blank]), blank.id, c.clip, d.id).pages }));
    } else {
      const imported = await importAssets(docRef.current, c.clip.docId, c.clip.assets);
      const page = { ...blank, stickers: placePasted([], c.clip.stickers, imported.assetMap) };
      setDoc((d) => ({ ...d, assets: { ...d.assets, ...imported.added }, pages: insertPages(d.pages, index, [page]) }));
    }
    setCurrentId(blank.id);
  };

  /** 페이지 바에서 붙이기: 새 페이지로 (그림 → 이미지 페이지, 링크 → 웹 주소·유튜브 페이지, 글 → 글상자 페이지) */
  const pasteAsNewPage = async (index: number) => {
    const app = getClip();
    if (app && !preferSystem()) {
      await pasteClipAsPages(app, index);
      return;
    }
    const sys = await readSystemClipboard();
    if (sys.kind === "image") await insertMedia([sys.file], index);
    else if (sys.kind === "text") newPageFromText(index, sys.text);
    else if (app) await pasteClipAsPages(app, index);
    else nothingToPaste(sys);
  };

  /** 메뉴 이름: 무엇을 붙일지 (기기 클립보드는 읽기 전에는 모르므로 "복사한 그림·링크·글") */
  /** 메뉴 이름은 짧게 (무엇을 붙일지는 붙이고 나서 보인다). 페이지 안에서 복사한 페이지는 지금 페이지 뒤에 */
  const pasteHereLabel = (): string => (!preferSystem() && getClip()?.kind === "pages" ? "페이지 붙여넣기" : "붙여넣기");

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
    const shape = shapeAtClient(p.clientX, p.clientY);
    if (shape) {
      setEditingBox(null);
      setMenu({ kind: "shape", ...menuAt, strokeId: shape.id });
      return;
    }
    const sticker = stickerAt(p.clientX, p.clientY);
    if (sticker) {
      setEditingBox(null);
      setMenu({ kind: "sticker", ...menuAt, stickerId: sticker });
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
              label: "글 고치기",
              icon: <Pencil size={18} />,
              onSelect: () => {
                setTextMode(true);
                setSelectedBox(id);
                setEditingBox(id);
              },
            },
            {
              label: "링크",
              icon: <Link2 size={18} />,
              onSelect: () => setLinkDialog({ boxId: id, created: false }),
            },
            {
              label: "화살표",
              icon: <MoveUpRight size={18} />,
              onSelect: () => {
                startConnect(id);
                showToast("화살표 끝을 둘 곳이나 이을 상자를 누르세요");
              },
            },
            {
              label: "크기·위치",
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
            { label: pasteHereLabel(), icon: <ClipboardPaste size={18} />, hint: "Ctrl+V", onSelect: () => void pasteHere() },
          ],
          [{ label: "지우기", icon: <Trash2 size={18} />, danger: true, onSelect: () => deleteBox(id) }],
        ],
      };
    }
    if (menu.kind === "shape") {
      const s = strokes.find((x) => x.id === menu.strokeId);
      if (!s || !hasShape(s)) return { groups: [] };
      const id = s.id;
      return {
        title: SHAPE_NAMES[s.shape.kind],
        groups: [
          [
            { label: "크기·회전", icon: <Move size={18} />, onSelect: () => setSelectedShape(id) },
            { label: "지금 펜 색·굵기로", icon: <Paintbrush size={18} />, onSelect: () => restyleShape(id) },
            { label: "복제", icon: <CopyPlus size={18} />, onSelect: () => duplicateShape(id) },
          ],
          [{ label: "지우기", icon: <Trash2 size={18} />, danger: true, onSelect: () => deleteShape(id) }],
        ],
      };
    }
    if (menu.kind === "sticker") {
      const id = menu.stickerId;
      if (!findSticker(id)) return { groups: [] };
      return {
        title: "스티커",
        groups: [
          [
            { label: "크기·위치", icon: <Move size={18} />, onSelect: () => selectSticker(id) },
            {
              label: "자르기",
              icon: <Crop size={18} />,
              onSelect: () => {
                selectSticker(id);
                setCropping(true);
              },
            },
            { label: "꾸미기", icon: <Paintbrush size={18} />, onSelect: () => selectSticker(id, true) },
          ],
          [
            { label: "복사", icon: <Copy size={18} />, hint: "Ctrl+C", onSelect: () => void copySticker(id) },
            { label: "잘라내기", icon: <Scissors size={18} />, hint: "Ctrl+X", onSelect: () => void copySticker(id, true) },
            { label: "복제", icon: <CopyPlus size={18} />, onSelect: () => void duplicateSticker(id) },
            { label: pasteHereLabel(), icon: <ClipboardPaste size={18} />, hint: "Ctrl+V", onSelect: () => void pasteHere() },
          ],
          [
            {
              label: "맨 앞으로",
              icon: <BringToFront size={18} />,
              onSelect: () => editSticker(id, (pages, pageId) => reorderSticker(pages, pageId, id, "front")),
            },
            {
              label: "맨 뒤로",
              icon: <SendToBack size={18} />,
              onSelect: () => editSticker(id, (pages, pageId) => reorderSticker(pages, pageId, id, "back")),
            },
          ],
          [{ label: "지우기", icon: <Trash2 size={18} />, danger: true, onSelect: () => deleteSticker(id) }],
        ],
      };
    }
    if (menu.kind === "pageItem") {
      const id = menu.pageId;
      const i = doc.pages.findIndex((p) => p.id === id);
      if (i < 0) return { groups: [] };
      const isHidden = doc.hidden.includes(id);
      return {
        title: `${i + 1}쪽`,
        groups: [
          [
            { label: "복사", icon: <Copy size={18} />, onSelect: () => void copyPage(id) },
            { label: "잘라내기", icon: <Scissors size={18} />, disabled: doc.pages.length <= 1, onSelect: () => void copyPage(id, true) },
            { label: "복제", icon: <CopyPlus size={18} />, onSelect: () => duplicatePage(id) },
            { label: thumbPageId === id ? "썸네일에서 빼기" : "썸네일로 고르기", icon: <BookImage size={18} />, onSelect: () => void chooseThumb(id) },
          ],
          [
            { label: "앞에 붙여넣기", icon: <ClipboardPaste size={18} />, onSelect: () => void pasteAsNewPage(i) },
            { label: "뒤에 붙여넣기", icon: <ClipboardPaste size={18} />, onSelect: () => void pasteAsNewPage(i + 1) },
          ],
          [
            { label: isHidden ? "보이기" : "숨기기", icon: isHidden ? <Eye size={18} /> : <EyeOff size={18} />, onSelect: () => toggleHidden(id) },
            { label: "삭제", icon: <Trash2 size={18} />, danger: true, disabled: doc.pages.length <= 1, onSelect: () => deletePage(id) },
          ],
        ],
      };
    }
    if (menu.kind === "page") {
      const at = menu.at;
      return {
        title: currentPage ? (pageNumberLabel(doc.pages, doc.hidden, currentPage.id) ?? undefined) : undefined,
        groups: [
          [
            { label: pasteHereLabel(), icon: <ClipboardPaste size={18} />, hint: "Ctrl+V", onSelect: () => void pasteHere(at) },
            at && {
              label: "글상자",
              icon: <Type size={18} />,
              onSelect: () => {
                setTextMode(true);
                createBox(at.x, at.y);
              },
            },
            at && { label: "링크", icon: <Link2 size={18} />, onSelect: () => createLinkBox(at) },
            {
              label: "이미지",
              icon: <ImagePlus size={18} />,
              onSelect: () => pickFile("sticker", pageIndex, at),
            },
            {
              label: "도형",
              icon: <Shapes size={18} />,
              onSelect: () => setPopover({ kind: "shapes", ...pickerAt(menu.x, menu.y) }),
            },
          ],
          [
            {
              label: "실행 취소",
              icon: <Undo2 size={18} />,
              hint: "Ctrl+Z",
              disabled: !pageInk?.past.length,
              onSelect: () => inkAction({ type: "undo" }),
            },
            {
              label: "다시 실행",
              icon: <Redo2 size={18} />,
              hint: "Ctrl+Y",
              disabled: !pageInk?.future.length,
              onSelect: () => inkAction({ type: "redo" }),
            },
            strokes.length > 0 && { label: "필기 지우기", icon: <Eraser size={18} />, onSelect: () => inkAction({ type: "clear" }) },
          ],
          [
            { label: "빈 페이지 추가", icon: <FilePlus2 size={18} />, onSelect: () => addBlank(pageIndex + 1, "plain") },
            currentPage && { label: "페이지 복제", icon: <CopyPlus size={18} />, onSelect: () => duplicatePage(currentPage.id) },
            currentPage && { label: "페이지 복사", icon: <Copy size={18} />, onSelect: () => void copyPage(currentPage.id) },
            currentPage && {
              label: "페이지 잘라내기",
              icon: <Scissors size={18} />,
              disabled: doc.pages.length <= 1,
              onSelect: () => void copyPage(currentPage.id, true),
            },
            currentPage && {
              label: thumbPageId === currentPage.id ? "썸네일에서 빼기" : "썸네일로 고르기",
              icon: <BookImage size={18} />,
              onSelect: () => void chooseThumb(currentPage.id),
            },
            isWebPage(currentPage) && { label: "새로고침", icon: <RotateCw size={18} />, onSelect: reloadWebPage },
          ],
          [
            lecture
              ? { label: "강의 끝내기", icon: <Minimize2 size={18} />, hint: "Esc", onSelect: exitLecture }
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
          { label: "내보내기", icon: <Share2 size={18} />, onSelect: exportDoc },
        ],
        [
          { label: "도형 보정", icon: <Ruler size={18} />, checked: straighten, onSelect: () => setStraighten((v) => !v) },
          { label: "필기 보정", icon: <Sparkles size={18} />, checked: beautify, onSelect: () => setBeautify((v) => !v) },
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
    if (link.type !== "page" || !docRef.current.pages.some((p) => p.id === link.pageId)) return;
    if (lectureRef.current) {
      // 강의 중 링크로 갔다가 돌아오면 그 쪽은 "본 쪽" (다음·이전으로 넘길 때 건너뜀)
      const r = followDetour(detours.current, currentIdRef.current, link.pageId);
      detours.current = r.trail;
      const seen = r.seen;
      if (seen) setSeenViaLink((list) => (list.includes(seen) ? list : [...list, seen]));
    }
    setCurrentId(link.pageId);
  };

  // ── 도구 ───────────────────────────────────────────────
  const selectPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setShapeTool(null);
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
    // 도형 모드에서 펜·형광펜·지우개를 누르면 도형 모드를 끝내고 그 도구로
    if (shapeTool) {
      setShapeTool(null);
      setPopover(null);
      if (t !== "eraser") {
        selectPreset(lastByTool[t]);
        return;
      }
    }
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
  /** 도형 고르기 창 자리 (화면 안으로) */
  const pickerAt = (x: number, y: number) => ({
    left: Math.max(8, Math.min(x, window.innerWidth - 316)),
    top: Math.max(8, Math.min(y, window.innerHeight - 330)),
  });
  const closeAddMenu = useCallback(() => setAddMenu(null), []);

  // PC 키보드: 고른 상자·스티커 Ctrl+C·Ctrl+X, 어디서든 Ctrl+V (글 입력 중에는 평소대로)
  const clipRef = useRef({
    copyBox,
    cutBox,
    pasteClip,
    pasteText,
    pasteAny,
    copySticker,
    insertStickers,
    selectedBox,
    editingBox,
    selectedSticker,
    clip,
  });
  clipRef.current = { copyBox, cutBox, pasteClip, pasteText, pasteAny, copySticker, insertStickers, selectedBox, editingBox, selectedSticker, clip };
  useEffect(() => {
    const typing = (e: Event) => !!(e.target as Element)?.closest?.("input, textarea, [contenteditable]");
    const onCopyCut = (e: ClipboardEvent) => {
      const c = clipRef.current;
      if (typing(e) || c.editingBox || window.getSelection()?.toString()) return;
      if (c.selectedSticker) {
        // 시스템 클립보드는 비워 둔다 (붙일 때 예전에 복사한 글이 대신 붙지 않게)
        void c.copySticker(c.selectedSticker, e.type === "cut");
        e.clipboardData?.setData("text/plain", "");
        e.preventDefault();
        return;
      }
      if (!c.selectedBox) return;
      if (e.type === "cut") c.cutBox(c.selectedBox, false);
      else c.copyBox(c.selectedBox, false);
      const now = getClip();
      if (now?.kind !== "boxes") return;
      e.clipboardData?.setData("text/plain", now.clip.labels.join("\n"));
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e)) return;
      const c = clipRef.current;
      // 복사한 그림(스크린샷 등) → 스티커
      const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (images.length) {
        void c.insertStickers(images);
        e.preventDefault();
        return;
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const app = c.clip;
      if (app?.kind === "boxes") {
        // 시스템 클립보드 글이 마지막으로 복사한 상자 글과 같으면 상자(링크·모양 그대로)를, 아니면 그 글을 붙인다
        if (!text || text === app.clip.labels.join("\n")) c.pasteClip();
        else if (text.trim()) c.pasteText(text);
        else return;
      } else if (app && (!text.trim() || leaveSeq.current < clipSeq.current)) {
        // 스티커·페이지: 그 뒤에 다른 앱에서 글을 복사해 온 게 아니면 앱 안 클립보드를
        c.pasteAny();
      } else if (text.trim()) c.pasteText(text);
      else return;
      e.preventDefault();
    };
    // 다른 앱으로 갔다 오면(분할 화면 포함) 그쪽에서 복사했을 수 있다. 웹 페이지(iframe)를 누른 것은 앱을 떠난 게 아니다
    const onBlur = () =>
      setTimeout(() => {
        if (document.activeElement?.tagName !== "IFRAME") leaveSeq.current = nextSeq();
      });
    const onHidden = () => document.visibilityState === "hidden" && (leaveSeq.current = nextSeq());
    // 입력칸 등에서 글을 복사한 것도 기기 클립보드 쪽 (상자·스티커 복사는 뒤이어 앱 안 클립보드에 담겨 더 나중이 된다)
    const onAnyCopy = () => (leaveSeq.current = nextSeq());
    document.addEventListener("copy", onAnyCopy, true);
    document.addEventListener("cut", onAnyCopy, true);
    document.addEventListener("copy", onCopyCut);
    document.addEventListener("cut", onCopyCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("copy", onAnyCopy, true);
      document.removeEventListener("cut", onAnyCopy, true);
      document.removeEventListener("copy", onCopyCut);
      document.removeEventListener("cut", onCopyCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // PC에서 시험할 때 쓰는 단축키
  const stickerKeys = useRef({ selectedSticker, cropping, deleteSticker, deselectSticker });
  stickerKeys.current = { selectedSticker, cropping, deleteSticker, deselectSticker };
  const arrowKeys = useRef({ selectedArrow, connectFrom, deleteArrow });
  arrowKeys.current = { selectedArrow, connectFrom, deleteArrow };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 주소 입력 중에는 단축키를 쓰지 않는다
      if ((e.target as Element)?.closest?.("input, textarea, [contenteditable]")) return;
      // 누르고 있어 반복되는 넘김 키는 무시한다: S펜 버튼·리모컨·키보드를 누르고 있으면 키가 자동으로 되풀이돼
      // 끝 쪽까지 쭉 넘어갔다 (Enter·Space도 막아 고른 단추가 되풀이해 눌리지 않게)
      const pageKey = e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "PageDown" || e.key === "PageUp";
      if (e.repeat && (pageKey || e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        inkAction({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        inkAction({ type: "redo" });
      } else if ((e.key === "Delete" || e.key === "Backspace") && stickerKeys.current.selectedSticker && !stickerKeys.current.cropping) {
        e.preventDefault();
        stickerKeys.current.deleteSticker(stickerKeys.current.selectedSticker);
      } else if (e.key === "Escape" && stickerKeys.current.selectedSticker) {
        if (stickerKeys.current.cropping) setCropping(false);
        else stickerKeys.current.deselectSticker();
      } else if ((e.key === "Delete" || e.key === "Backspace") && arrowKeys.current.selectedArrow) {
        e.preventDefault();
        arrowKeys.current.deleteArrow(arrowKeys.current.selectedArrow);
      } else if (e.key === "Escape" && (arrowKeys.current.connectFrom || arrowKeys.current.selectedArrow)) {
        setConnectFrom(null);
        setSelectedArrow(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedBox && !editingBox) {
        e.preventDefault();
        deleteBox(selectedBox);
      } else if (e.key === "F5") {
        // 파워포인트처럼 F5로 강의 시작, Esc로 끝
        e.preventDefault();
        enterLecture();
      } else if (e.key === "Escape" && lecture) {
        exitLecture();
      } else if (pageKey && penButtonRecently()) {
        // 화면 가까이에서 S펜 버튼(지우개)을 누를 때 블루투스 S펜이 함께 보내는 넘김 키는 무시
        e.preventDefault();
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
      {lecture && (
        // 강의 모드 화면 위: 링크로 보고 돌아온 쪽을 다음·이전에서 건너뛸지
        <button
          className={`lecture-skip${skipLinked ? " on" : ""}`}
          aria-pressed={skipLinked}
          title="페이지 링크로 보고 돌아온 쪽은 다음·이전으로 넘길 때 건너뜁니다"
          data-no-gesture
          onClick={() => {
            const on = !skipLinked;
            setSkipLinked(on);
            showToast(on ? "링크로 보고 돌아온 쪽은 다음으로 넘길 때 건너뜁니다" : "링크로 본 쪽도 다음으로 넘길 때 보여 줍니다");
          }}
        >
          <SkipForward size={14} />
          링크로 본 쪽 건너뛰기
          <span className="ls-state">{skipLinked ? "켬" : "끔"}</span>
          {skipLinked && seenViaLink.length > 0 && <span className="ls-count">{seenViaLink.length}쪽</span>}
        </button>
      )}
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
        <IconButton label="펜" active={tool === "pen" && !sideEraser && !textMode && !shapeTool} onClick={(e) => onToolButton("pen", e)}>
          <PenLine size={24} />
          {tool === "pen" && <span className="tool-color-dot" style={{ background: activePreset.color }} />}
        </IconButton>
        <IconButton label="형광펜" active={tool === "highlighter" && !sideEraser && !textMode && !shapeTool} onClick={(e) => onToolButton("highlighter", e)}>
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
        <IconButton label="이미지 스티커" disabled={!currentPage} onClick={() => pickFile("sticker", pageIndex)}>
          <ImagePlus size={23} />
        </IconButton>
        <IconButton
          label={shapeTool ? `도형 모드 (${shapeTool === "auto" ? "자동" : SHAPE_NAMES[shapeTool]})` : "도형"}
          active={!!shapeTool || popover?.kind === "shapes"}
          disabled={!currentPage}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPopover(popover?.kind === "shapes" ? null : { kind: "shapes", ...pickerAt(r.left - 120, r.bottom + 8) });
          }}
        >
          <Shapes size={23} />
        </IconButton>
        <IconButton label={pasteHereLabel()} disabled={!currentPage} onClick={() => void pasteHere()}>
          <ClipboardPaste size={22} />
        </IconButton>
        <span className="toolrow-sep" />
        <IconButton label="필기 지우기" disabled={strokes.length === 0} onClick={() => inkAction({ type: "clear" })}>
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

      <div
        className="workspace"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          // PC: 그림 파일을 페이지에 끌어 놓으면 놓은 자리에 스티커로
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || /\.(hei[cf]|tiff?)$/i.test(f.name));
          if (!files.length || !currentPage) return;
          e.preventDefault();
          const r = document.querySelector(".page")?.getBoundingClientRect();
          const inside = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          void insertStickers(files, inside ? { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } : undefined);
        }}
      >
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
            onPageMenu={(id, x, y) => {
              setPopover(null);
              setMenu({ kind: "pageItem", x, y, pageId: id });
            }}
            thumbPageId={thumbPageId}
            onClose={() => setPagePanelOpen(false)}
          />
        )}

        <PageView
          doc={doc}
          pageIndex={pageIndex}
          strokes={canvasStrokes}
          onShapeDrawn={setSelectedShape}
          shapeTool={shapeTool}
          tool={tool}
          color={activePreset.color}
          width={activePreset.width}
          eraserSize={eraserSize}
          fingerDraw={fingerDraw}
          lowLatency={lowLatency}
          straighten={straighten}
          beautify={beautify}
          webMode={webMode}
          onCommit={onCommit}
          onNavigate={goTo}
          onPdfRendered={setPdfRenderMs}
          lecture={lecture}
          inkOff={textMode || !!selectedSticker}
          webReloads={webReloads}
          onLongPress={onLongPress}
          penLongPress={!erasing}
          onFingerTapWeb={() => {
            setWebMode("interact");
            showToast("조작 모드로 바꿨습니다. 웹 페이지를 다시 눌러 주세요 (S펜은 판서)");
          }}
          pageUnderlay={(size) =>
            currentPage && (
              <StickerLayer page={currentPage} assets={doc.assets} size={size} live={liveSticker} hiddenId={cropping ? selectedSticker : null} />
            )
          }
          pageOverlay={(size) =>
            currentPage && (
              <>
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
                  onResize={(id, step) => {
                    const b = findBox(id);
                    if (b && b.w == null) setBoxSize(stepBoxSize(b.size, step));
                    resizeBox(id, step);
                  }}
                  onFontSize={sizeTextBox}
                  onFormat={formatTextBox}
                  onBoxSize={(id, w, h, size) => editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { w, h, size }))}
                  onColor={(id, color) => {
                    setTextColor(color);
                    editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { color }));
                  }}
                  onBg={(id, bg) => {
                    setBoxBg(bg);
                    editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { bg }));
                  }}
                  onBorder={(id, border) => {
                    setBoxBorderStyle(border);
                    editBoxes(id, (pages, pageId) => patchBox(pages, pageId, id, { border }));
                  }}
                  onStartConnect={(id) => {
                    startConnect(id);
                    showToast("화살표 끝을 둘 곳이나 이을 상자를 누르세요");
                  }}
                  connectFrom={connectFrom}
                  onConnect={connectTo}
                  onCancelConnect={() => setConnectFrom(null)}
                  selectedArrow={selectedArrow}
                  onSelectArrow={(id) => {
                    setSelectedArrow(id);
                    if (id) setSelectedBox(null);
                  }}
                  onArrowFlip={(id) => editArrows((pages, pid) => flipArrow(pages, pid, id))}
                  onArrowPatch={(id, patch) => editArrows((pages, pid) => patchArrow(pages, pid, id, patch))}
                  onArrowEnd={(id, target) => editArrows((pages, pid) => moveArrowEnd(pages, pid, id, target))}
                  onArrowDelete={deleteArrow}
                  onCopy={(id) => {
                    copyBox(id);
                    showToast("상자를 복사했습니다. 붙일 곳에서 붙여넣기");
                  }}
                  onCut={(id) => cutBox(id)}
                  onDelete={(id) => deleteBox(id)}
                  onPickAt={pickStickerAt}
                />
                {(() => {
                  const sticker = stickersOf(currentPage).find((s) => s.id === selectedSticker);
                  if (!sticker) return null;
                  const id = sticker.id;
                  return (
                    <StickerEditor
                      key={id}
                      sticker={sticker}
                      asset={mediaAsset(doc.assets, sticker.asset)}
                      size={size}
                      cropping={cropping}
                      openStyle={stickerStyleReq}
                      onLive={setLiveSticker}
                      onChange={(patch) => editSticker(id, (pages, pageId) => patchSticker(pages, pageId, id, patch))}
                      onCropMode={setCropping}
                      onPickAt={pickStickerAt}
                      onDeselect={deselectSticker}
                      onCopy={() => void copySticker(id)}
                      onCut={() => void copySticker(id, true)}
                      onDuplicate={() => void duplicateSticker(id)}
                      onDelete={() => deleteSticker(id)}
                      onOrder={(to) => editSticker(id, (pages, pageId) => reorderSticker(pages, pageId, id, to))}
                    />
                  );
                })()}
                {(() => {
                  const s = selectedShape ? strokes.find((x) => x.id === selectedShape) : undefined;
                  if (!s || !hasShape(s)) return null;
                  return (
                    <ShapeEditor
                      key={s.id}
                      stroke={s}
                      size={size}
                      onLive={setShapeDraft}
                      onChange={replaceStroke}
                      onDuplicate={() => duplicateShape(s.id)}
                      onDelete={() => deleteShape(s.id)}
                      onDone={() => setSelectedShape(null)}
                    />
                  );
                })()}
              </>
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
            <DebugPanel lowLatency={lowLatency} onLowLatency={setLowLatency} pdfRenderMs={pdfRenderMs} onClose={() => setDebugOpen(false)} />
          )}
        </PageView>
      </div>

      {popover?.kind === "preset" && popoverPreset && (
        <ToolSettings
          kind="preset"
          anchor={popover}
          preset={popoverPreset}
          onChange={(patch) => patchPreset(popoverPreset.id, patch)}
          correction={{
            straighten,
            beautify,
            onStraighten: (on) => {
              setStraighten(on);
              showToast(on ? "도형 보정: 긋다가 떼지 않고 멈추면 원·사각형 같은 도형이나 직선이 됩니다" : "도형 보정을 껐습니다");
            },
            onBeautify: (on) => {
              setBeautify(on);
              showToast(on ? "필기 보정: 펜을 뗄 때 글씨를 반듯하게 다듬습니다" : "필기 보정을 껐습니다");
            },
          }}
          onClose={closePopover}
        />
      )}
      {popover?.kind === "shapes" && (
        <ShapePicker
          anchor={popover}
          current={shapeTool}
          onPick={enterShapeMode}
          onOff={() => {
            setShapeTool(null);
            setPopover(null);
            showToast("도형 모드를 껐습니다");
          }}
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
      {menu && <ContextMenu x={menu.x} y={menu.y} {...menuGroups()} onClose={() => setMenu(null)} />}
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
          paste={{
            label: "붙여넣기",
            run: () => {
              void pasteAsNewPage(addMenu.index);
              setAddMenu(null);
            },
          }}
          onClose={closeAddMenu}
        />
      )}
    </div>
  );
}

/** 붙인 글 → 글상자 (웹 주소 하나면 웹 주소 링크 상자). bg: 새 글상자 배경 (기본 자동) */
function textToBox(text: string, color: string, at = { x: 0.08, y: 0.08 }, bg: string | undefined = "auto"): TextBox {
  const url = !/\s/.test(text) ? normalizeUrl(text) : null;
  return url
    ? { id: newId("b"), ...at, text: "", size: DEFAULT_BOX_SIZE, color: LINK_COLOR, link: { type: "url", url } }
    : { id: newId("b"), ...at, text, size: DEFAULT_BOX_SIZE, color, ...(bg ? { bg } : {}) };
}

function missingNotice(count: number): string | null {
  return count ? `원본 파일 ${count}개를 아직 받지 못했습니다. 동기화가 끝나면 다시 열어 주세요.` : null;
}

/** 홈 카드 썸네일 그림이 마지막으로 무엇으로 만들어졌는지 (같으면 다시 만들지 않는다) */
const thumbMade = new Map<string, { page: Page; strokes: unknown; pages: Page[]; assets: unknown; hidden: string[] }>();

/** 홈 카드 썸네일 그림: 고른 페이지(없으면 처음 보이는 페이지)를 스티커·필기·글상자까지 */
async function updateThumb(doc: DocState, ink: InkBook) {
  try {
    const target = thumbTarget(doc, await docThumbPage(doc.id));
    if (!target) return;
    const strokes = ink[target.id]?.present ?? [];
    const last = thumbMade.get(doc.id);
    if (last && last.page === target && last.strokes === strokes && last.pages === doc.pages && last.assets === doc.assets && last.hidden === doc.hidden) return;
    const url = await snapshotPage(target, doc, strokes);
    if (!url) return;
    thumbMade.set(doc.id, { page: target, strokes, pages: doc.pages, assets: doc.assets, hidden: doc.hidden });
    await setThumb(doc.id, url, target.id);
  } catch {
    // 썸네일은 없어도 된다
  }
}
