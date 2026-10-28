import {
  ArrowDownUp,
  ChevronRight,
  Circle,
  CircleCheck,
  EllipsisVertical,
  File,
  FileCode2,
  FileText,
  Film,
  FolderInput,
  FolderOpen,
  FolderPlus,
  House,
  Image,
  Pencil,
  Search,
  Share2,
  Sparkles,
  SquareCheckBig,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { safeFileName, shareOrDownload } from "../lib/files";
import { onBackPress } from "../lib/nativeShell";
import { josa } from "../lib/josa";
import { showToast } from "../lib/platform";
import type { DocRecord } from "../store/db";
import { deleteDoc, listDocs, onDocChange, renameDoc } from "../store/docStore";
import { createBlankDoc, createDocFromPdf, createSampleDoc } from "../store/create";
import { byName, emptyLibrary, uniqueName, viewLibrary, type Folder } from "../store/folders";
import { createFolder, deleteFolders, editFolder, moveItems, placeDoc, useLibraryView } from "../store/library";
import { exportProject, importProject, PROJECT_ACCEPT, PROJECT_EXT } from "../store/projectFile";
import { ContextMenu, type MenuGroups } from "./ContextMenu";
import { DeleteDialog, FolderIcon, MoveDialog, NameDialog } from "./FolderDialogs";
import { itemKey, useCardDrag, type CardItem } from "./useCardDrag";

interface Props {
  onOpen: (docId: string) => void;
  /** 상단 바 오른쪽 (동기화 상태 버튼) */
  headerExtra?: ReactNode;
}

type Busy = string | null;
type Sort = "recent" | "name";

type DialogState =
  | { type: "newFolder" }
  | { type: "editFolder"; folder: Folder }
  | { type: "renameDoc"; doc: DocRecord }
  | { type: "move"; docIds: string[]; folderIds: string[] }
  | { type: "delete"; docIds: string[]; folderIds: string[] };

/** 문서를 열었다 돌아오면 보던 폴더 (앱을 켜 둔 동안) */
let rememberedFolder: string | null = null;

const SORT_KEY = "lessondeck.homeSort";
function loadSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === "name" ? "name" : "recent";
  } catch {
    return "recent";
  }
}

// 문서 목록 (SPEC 6장: 홈) — 폴더로 정리, 찾기, 정렬, 여러 개 골라 옮기기·삭제
export function HomeScreen({ onOpen, headerExtra }: Props) {
  const [docs, setDocs] = useState<DocRecord[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [folderId, setFolderId] = useState<string | null>(rememberedFolder);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(loadSort);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ item: CardItem; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const loadedView = useLibraryView();
  const view = useMemo(() => loadedView ?? viewLibrary(emptyLibrary()), [loadedView]);

  useEffect(() => {
    let alive = true;
    const refresh = () => listDocs().then((d) => alive && setDocs(d));
    refresh();
    // 드라이브에서 받은 문서 등 바뀌면 다시 읽는다
    const off = onDocChange(() => refresh());
    return () => {
      alive = false;
      off();
    };
  }, []);

  // 보던 폴더가 (다른 기기에서) 지워졌으면 살아 있는 윗 폴더로
  useEffect(() => {
    if (!loadedView || view.isLive(folderId)) return;
    let id = folderId;
    const seen = new Set<string>();
    while (id != null && !view.isLive(id) && !seen.has(id)) {
      seen.add(id);
      id = view.lib.folders[id]?.parentId ?? null;
    }
    setFolderId(view.isLive(id) ? id : null);
  }, [loadedView, view, folderId]);

  useEffect(() => {
    rememberedFolder = folderId;
  }, [folderId]);

  const go = useCallback((id: string | null) => {
    setFolderId(id);
    setQuery("");
    setSelected(new Set());
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const searching = query.trim().length > 0;

  // ── 지금 보이는 폴더·문서 ──
  const docFolderOf = useMemo(() => new Map((docs ?? []).map((d) => [d.id, view.folderOfDoc(d.id)])), [docs, view]);
  const counts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const f of docFolderOf.values()) m.set(f, (m.get(f) ?? 0) + 1);
    return m;
  }, [docFolderOf]);

  const sortDocs = useCallback(
    (list: DocRecord[]) => [...list].sort(sort === "name" ? (a, b) => byName(a.title, b.title) : (a, b) => b.updatedAt - a.updatedAt),
    [sort],
  );

  const { shownFolders, shownDocs } = useMemo(() => {
    if (searching) {
      const q = query.trim().toLocaleLowerCase("ko");
      const hit = (s: string) => s.toLocaleLowerCase("ko").includes(q);
      return {
        shownFolders: [...view.folders.values()].filter((f) => hit(f.name)).sort((a, b) => byName(a.name, b.name)),
        shownDocs: sortDocs((docs ?? []).filter((d) => hit(d.title))),
      };
    }
    return {
      shownFolders: view.children(folderId),
      shownDocs: sortDocs((docs ?? []).filter((d) => docFolderOf.get(d.id) === folderId)),
    };
  }, [searching, query, view, folderId, docs, docFolderOf, sortDocs]);

  const path = view.path(folderId);
  const here = path.at(-1);
  const visibleItems: CardItem[] = useMemo(
    () => [...shownFolders.map((f) => ({ kind: "folder" as const, id: f.id })), ...shownDocs.map((d) => ({ kind: "doc" as const, id: d.id }))],
    [shownFolders, shownDocs],
  );

  // 선택은 지금 보이는 것만
  useEffect(() => {
    setSelected((s) => {
      const keys = new Set(visibleItems.map(itemKey));
      const next = new Set([...s].filter((k) => keys.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [visibleItems]);

  // 안드로이드 뒤로 가기: 선택 끝내기 → 찾기 지우기 → 윗 폴더
  useEffect(() => {
    if (!selecting && !searching && folderId == null) return;
    return onBackPress(() => {
      if (selecting) setSelecting(false);
      else if (searching) setQuery("");
      else go(view.parentOf(folderId!));
    });
  }, [selecting, searching, folderId, view, go]);

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !dialog && setSelecting(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting, dialog]);

  useEffect(() => {
    if (!selecting) setSelected(new Set());
  }, [selecting]);

  // ── 동작 ──
  const run = async (label: string, job: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const id = await job();
      if (id) {
        // 보고 있던 폴더에 만든다
        if (folderId) await placeDoc(id, folderId);
        onOpen(id);
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : `${label}에 실패했습니다`);
    } finally {
      setBusy(null);
    }
  };

  const docById = useMemo(() => new Map((docs ?? []).map((d) => [d.id, d])), [docs]);

  const openItem = (item: CardItem) => {
    if (item.kind === "folder") go(item.id);
    else onOpen(item.id);
  };

  const toggle = (item: CardItem) =>
    setSelected((s) => {
      const next = new Set(s);
      const k = itemKey(item);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const activate = (item: CardItem) => (selecting ? toggle(item) : openItem(item));

  const split = (items: CardItem[]) => ({
    docIds: items.filter((i) => i.kind === "doc").map((i) => i.id),
    folderIds: items.filter((i) => i.kind === "folder").map((i) => i.id),
  });

  const selectedItems = (): CardItem[] => visibleItems.filter((i) => selected.has(itemKey(i)));

  /** 끌거나 메뉴를 연 카드가 선택돼 있으면 고른 것 모두, 아니면 그 카드만 */
  const itemsFor = (item: CardItem): CardItem[] => (selecting && selected.has(itemKey(item)) ? selectedItems() : [item]);

  const locationOf = (item: CardItem): string | null => (item.kind === "doc" ? (docFolderOf.get(item.id) ?? null) : view.parentOf(item.id));

  const folderName = (id: string | null) => (id == null ? "내 문서" : (view.folders.get(id)?.name ?? "폴더"));

  const doMove = async (items: CardItem[], target: string | null) => {
    const { docIds, folderIds } = split(items);
    const moved = await moveItems(docIds, folderIds, target);
    if (moved) showToast(`${moved === 1 ? "" : `${moved}개를 `}${josa(`‘${folderName(target)}’`, "으로", "로")} 옮겼습니다`);
    setSelecting(false);
  };

  const canDropOne = (item: CardItem, target: string | null) => {
    if (locationOf(item) === target) return false;
    if (item.kind === "folder") return target == null || !view.subtree(item.id).has(target);
    return true;
  };

  const { bind, ghost, lifted } = useCardDrag({
    onMenu: (item, x, y) => setMenu({ item, x, y }),
    onDrop: (item, target) => void doMove(itemsFor(item).filter((i) => canDropOne(i, target)), target),
    canDrop: (item, target) => itemsFor(item).some((i) => canDropOne(i, target)),
    ghostLabel: (item) => {
      const items = itemsFor(item);
      if (items.length > 1) return `${items.length}개`;
      return item.kind === "folder" ? folderName(item.id) : (docById.get(item.id)?.title ?? "문서");
    },
    scroller: () => mainRef.current,
  });

  const onExport = (doc: DocRecord) =>
    run("내보내기", async () => {
      const { blob, title } = await exportProject(doc.id);
      await shareOrDownload(blob, `${safeFileName(title)}${PROJECT_EXT}`);
    });

  const askDelete = (items: CardItem[]) => setDialog({ type: "delete", ...split(items) });

  const confirmDelete = async (docIds: string[], folderIds: string[], mode: "keep" | "all") => {
    setDialog(null);
    setSelecting(false);
    setBusy("삭제");
    try {
      for (const id of docIds) await deleteDoc(id);
      const inside = await deleteFolders(folderIds, mode);
      const n = docIds.length + inside;
      showToast(n ? `문서 ${n}개${folderIds.length ? `와 폴더 ${folderIds.length}개` : ""}를 삭제했습니다` : "폴더를 삭제했습니다");
    } finally {
      setBusy(null);
    }
  };

  const menuGroups = (item: CardItem): MenuGroups => {
    const many = itemsFor(item);
    if (many.length > 1) {
      return [
        [
          { label: `${many.length}개 옮기기`, icon: <FolderInput size={18} />, onSelect: () => setDialog({ type: "move", ...split(many) }) },
          { label: `${many.length}개 삭제`, icon: <Trash2 size={18} />, danger: true, onSelect: () => askDelete(many) },
        ],
      ];
    }
    const select = !selecting && {
      label: "선택",
      icon: <SquareCheckBig size={18} />,
      onSelect: () => {
        setSelecting(true);
        setSelected(new Set([itemKey(item)]));
      },
    };
    if (item.kind === "folder") {
      const folder = view.folders.get(item.id);
      if (!folder) return [];
      return [
        [
          { label: "열기", icon: <FolderOpen size={18} />, onSelect: () => go(folder.id) },
          { label: "이름·색", icon: <Pencil size={18} />, onSelect: () => setDialog({ type: "editFolder", folder }) },
          { label: "옮기기", icon: <FolderInput size={18} />, onSelect: () => setDialog({ type: "move", docIds: [], folderIds: [folder.id] }) },
          select,
        ],
        [{ label: "삭제", icon: <Trash2 size={18} />, danger: true, onSelect: () => askDelete([item]) }],
      ];
    }
    const doc = docById.get(item.id);
    if (!doc) return [];
    return [
      [
        { label: "열기", icon: <FileText size={18} />, onSelect: () => onOpen(doc.id) },
        searching && {
          label: "폴더 열기",
          icon: <FolderOpen size={18} />,
          onSelect: () => go(docFolderOf.get(doc.id) ?? null),
        },
        { label: "이름 바꾸기", icon: <Pencil size={18} />, onSelect: () => setDialog({ type: "renameDoc", doc }) },
        { label: "옮기기", icon: <FolderInput size={18} />, onSelect: () => setDialog({ type: "move", docIds: [doc.id], folderIds: [] }) },
        { label: "내보내기", icon: <Share2 size={18} />, onSelect: () => onExport(doc) },
        select,
      ],
      [{ label: "삭제", icon: <Trash2 size={18} />, danger: true, onSelect: () => askDelete([item]) }],
    ];
  };

  const openMenuFromButton = (item: CardItem, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ item, x: r.left, y: r.bottom + 4 });
  };

  const pathLabel = (id: string | null) =>
    view
      .path(id)
      .map((f) => f.name)
      .join(" › ") || "내 문서";

  const allSelected = visibleItems.length > 0 && visibleItems.every((i) => selected.has(itemKey(i)));
  const nSelected = selected.size;
  const empty = docs && shownFolders.length === 0 && shownDocs.length === 0;

  // ── 그리기 ──
  const cardClass = (base: string, item: CardItem) => {
    const k = itemKey(item);
    return [
      base,
      selecting && selected.has(k) && "selected",
      lifted === k && "lifted",
      ghost && lifted === k && "drag-source",
      item.kind === "folder" && ghost?.over === item.id && "drop-over",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const cornerButton = (item: CardItem, title: string) =>
    selecting ? (
      <span className="sel-mark" aria-hidden="true">
        {selected.has(itemKey(item)) ? <CircleCheck size={22} /> : <Circle size={22} />}
      </span>
    ) : (
      <button className="card-menu-btn" aria-label={`${title} 메뉴`} onClick={(e) => openMenuFromButton(item, e.currentTarget)}>
        <EllipsisVertical size={18} />
      </button>
    );

  return (
    <div className="app home">
      <header className="topbar">
        <div className="topbar-left">
          <div className="home-brand">
            레슨덱 <span className="phase-chip">v{__APP_VERSION__}</span>
          </div>
        </div>
        <div className="topbar-right">{headerExtra}</div>
      </header>

      <main className="home-main" ref={mainRef}>
        <section className="home-actions" aria-label="새 문서">
          <ActionCard icon={<FileText size={28} />} title="PDF로 새 수업" desc="수업 자료 PDF 열기" onClick={() => pdfRef.current?.click()} />
          <ActionCard icon={<File size={28} />} title="빈 노트" desc="백지 한 장에서 시작" onClick={() => run("빈 노트", () => createBlankDoc())} />
          <ActionCard
            icon={<FolderInput size={28} />}
            title="파일 가져오기"
            desc={`다른 기기에서 내보낸 ${PROJECT_EXT}`}
            onClick={() => projectRef.current?.click()}
          />
          <ActionCard icon={<Sparkles size={28} />} title="필기감 시험지" desc="샘플 문서" onClick={() => run("샘플", createSampleDoc)} />
        </section>
        {here && !searching && (
          <p className="home-target">
            <FolderIcon color={here.color} size={16} /> 새 문서는 ‘{here.name}’ 폴더에 만듭니다
          </p>
        )}

        <section className="home-docs" aria-label="내 문서">
          <div className="home-bar">
            {searching ? (
              <div className="crumbs">
                <Search size={18} /> <strong>찾기 결과</strong>
                <small>{shownFolders.length + shownDocs.length}개</small>
              </div>
            ) : (
              <nav className="crumbs" aria-label="폴더 경로">
                <button
                  className={`crumb${ghost?.over === null ? " drop-over" : ""}`}
                  data-drop=""
                  aria-current={folderId == null ? "page" : undefined}
                  onClick={() => go(null)}
                >
                  <House size={17} /> 내 문서
                </button>
                {path.map((f) => (
                  <span key={f.id} className="crumb-step">
                    <ChevronRight size={16} className="crumb-sep" />
                    <button
                      className={`crumb${ghost?.over === f.id ? " drop-over" : ""}`}
                      data-drop={f.id}
                      aria-current={f.id === folderId ? "page" : undefined}
                      onClick={() => go(f.id)}
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
                {docs && <small>문서 {counts.get(folderId) ?? 0}</small>}
              </nav>
            )}

            <div className="home-tools">
              <label className="home-search">
                <Search size={16} />
                <input type="search" value={query} placeholder="문서·폴더 찾기" aria-label="문서·폴더 찾기" onChange={(e) => setQuery(e.target.value)} />
                {query && (
                  <button aria-label="찾기 지우기" onClick={() => setQuery("")}>
                    <X size={16} />
                  </button>
                )}
              </label>
              <button
                className="tool-btn"
                aria-label={`정렬: ${sort === "recent" ? "최근 고친 순" : "이름 순"}`}
                onClick={() => {
                  const next: Sort = sort === "recent" ? "name" : "recent";
                  setSort(next);
                  try {
                    localStorage.setItem(SORT_KEY, next);
                  } catch {
                    // 저장 못 해도 이번에는 적용
                  }
                }}
              >
                <ArrowDownUp size={17} /> {sort === "recent" ? "최근 순" : "이름 순"}
              </button>
              <button className="tool-btn" onClick={() => setDialog({ type: "newFolder" })}>
                <FolderPlus size={17} /> 새 폴더
              </button>
              <button className={`tool-btn${selecting ? " on" : ""}`} aria-pressed={selecting} onClick={() => setSelecting(!selecting)}>
                <SquareCheckBig size={17} /> 선택
              </button>
            </div>
          </div>

          {shownFolders.length > 0 && (
            <div className="folder-grid">
              {shownFolders.map((f) => {
                const item: CardItem = { kind: "folder", id: f.id };
                const sub = view.children(f.id).length;
                const n = counts.get(f.id) ?? 0;
                return (
                  <article key={f.id} className={cardClass("folder-card", item)} data-drop={f.id} {...bind(item)}>
                    <button className="folder-open" onClick={() => activate(item)} aria-label={`${f.name} 폴더 ${selecting ? "선택" : "열기"}`}>
                      <FolderIcon color={f.color} size={30} />
                      <span className="folder-info">
                        <strong>{f.name}</strong>
                        <small>
                          {searching
                            ? pathLabel(view.parentOf(f.id))
                            : sub + n === 0
                              ? "비어 있음"
                              : [sub && `폴더 ${sub}`, n && `문서 ${n}`].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                    </button>
                    {cornerButton(item, f.name)}
                  </article>
                );
              })}
            </div>
          )}

          {empty && (
            <p className="home-empty">
              {searching
                ? `‘${query.trim()}’와(과) 맞는 문서·폴더가 없습니다.`
                : folderId
                  ? "이 폴더는 비어 있습니다. 위의 카드로 새 문서를 만들거나, 다른 문서를 길게 눌러 이 폴더로 끌어 오거나, 문서 메뉴(⋮)의 ‘옮기기’를 쓰세요."
                  : "아직 문서가 없습니다. 위에서 PDF로 새 수업을 만들거나, 구글 드라이브를 연결해 다른 기기의 문서를 받아 오세요."}
            </p>
          )}

          <div className="doc-grid">
            {shownDocs.map((doc) => {
              const item: CardItem = { kind: "doc", id: doc.id };
              return (
                <article key={doc.id} className={cardClass("doc-card", item)} {...bind(item)}>
                  <button className="doc-open" onClick={() => activate(item)} aria-label={`${doc.title} ${selecting ? "선택" : "열기"}`}>
                    <span className="doc-thumb">{doc.thumb ? <img src={doc.thumb} alt="" draggable={false} /> : <KindIcon doc={doc} />}</span>
                    <span className="doc-info">
                      <strong>{doc.title}</strong>
                      <small>
                        {doc.pageCount}쪽 · {relativeTime(doc.updatedAt)}
                      </small>
                      {searching && <small className="doc-path">{pathLabel(docFolderOf.get(doc.id) ?? null)}</small>}
                    </span>
                  </button>
                  {cornerButton(item, doc.title)}
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {selecting && (
        <div className="select-bar" role="toolbar" aria-label="선택한 것">
          <span className="select-count">{nSelected ? `${nSelected}개 선택` : "고를 것을 누르세요"}</span>
          <button onClick={() => setSelected(allSelected ? new Set() : new Set(visibleItems.map(itemKey)))}>
            <CircleCheck size={18} /> {allSelected ? "선택 해제" : "모두 선택"}
          </button>
          <button disabled={!nSelected} onClick={() => setDialog({ type: "move", ...split(selectedItems()) })}>
            <FolderInput size={18} /> 옮기기
          </button>
          <button className="danger" disabled={!nSelected} onClick={() => askDelete(selectedItems())}>
            <Trash2 size={18} /> 삭제
          </button>
          <button aria-label="선택 끝내기" onClick={() => setSelecting(false)}>
            <X size={18} /> 끝내기
          </button>
        </div>
      )}

      {ghost && (
        <div className={`drag-ghost${ghost.over !== undefined ? " can-drop" : ""}`} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {ghost.over !== undefined ? <FolderInput size={16} /> : null}
          {ghost.label}
          {ghost.over !== undefined && <small>→ {folderName(ghost.over)}</small>}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={itemsFor(menu.item).length > 1 ? `${itemsFor(menu.item).length}개 선택` : undefined}
          groups={menuGroups(menu.item)}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog?.type === "newFolder" && (
        <NameDialog
          title={here ? `‘${here.name}’ 안에 새 폴더` : "새 폴더"}
          initial={uniqueName(view, folderId, "새 폴더")}
          submitLabel="만들기"
          color={{}}
          onClose={() => setDialog(null)}
          onSubmit={async (name, color) => {
            setDialog(null);
            await createFolder(name, folderId, color);
          }}
        />
      )}
      {dialog?.type === "editFolder" && (
        <NameDialog
          title="폴더 이름·색"
          initial={dialog.folder.name}
          submitLabel="저장"
          color={{ initial: dialog.folder.color }}
          onClose={() => setDialog(null)}
          onSubmit={async (name, color) => {
            const { folder } = dialog;
            setDialog(null);
            if (name !== folder.name || color !== folder.color) await editFolder(folder.id, { name, color });
          }}
        />
      )}
      {dialog?.type === "renameDoc" && (
        <NameDialog
          title="문서 이름"
          initial={dialog.doc.title}
          submitLabel="저장"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const { doc } = dialog;
            setDialog(null);
            if (name !== doc.title) await renameDoc(doc.id, name);
          }}
        />
      )}
      {dialog?.type === "move" && (
        <MoveDialog
          docIds={dialog.docIds}
          folderIds={dialog.folderIds}
          from={commonLocation([...dialog.docIds.map((id) => docFolderOf.get(id) ?? null), ...dialog.folderIds.map((id) => view.parentOf(id))])}
          onClose={() => setDialog(null)}
          onMove={(target) => {
            const { docIds, folderIds } = dialog;
            setDialog(null);
            void doMove([...docIds.map((id) => ({ kind: "doc" as const, id })), ...folderIds.map((id) => ({ kind: "folder" as const, id }))], target);
          }}
        />
      )}
      {dialog?.type === "delete" &&
        (() => {
          const { docIds, folderIds } = dialog;
          const doomed = new Set<string>();
          for (const id of folderIds) for (const sub of view.subtree(id)) doomed.add(sub);
          const chosen = new Set(docIds);
          const insideDocs = (docs ?? []).filter((d) => !chosen.has(d.id) && doomed.has(docFolderOf.get(d.id) ?? "")).length;
          const parents = new Set(folderIds.map((id) => view.parentOf(id)));
          return (
            <DeleteDialog
              docTitles={docIds.map((id) => docById.get(id)?.title ?? "문서")}
              folderNames={folderIds.map((id) => folderName(id))}
              inside={{ docs: insideDocs, folders: doomed.size - folderIds.length }}
              parentName={parents.size === 1 ? folderName([...parents][0]) : "윗 폴더"}
              onClose={() => setDialog(null)}
              onConfirm={(mode) => void confirmDelete(docIds, folderIds, mode)}
            />
          );
        })()}

      {busy && (
        <div className="busy-overlay" role="status">
          <span className="spinner" aria-hidden="true" /> {busy} 중…
        </div>
      )}

      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) run("PDF 열기", () => createDocFromPdf(file, file.name));
        }}
      />
      <input
        ref={projectRef}
        type="file"
        accept={PROJECT_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) run("가져오기", () => importProject(file));
        }}
      />
    </div>
  );
}

/** 모두 같은 곳이면 그곳, 아니면 undefined */
function commonLocation(locations: (string | null)[]): string | null | undefined {
  const set = new Set(locations);
  return set.size === 1 ? locations[0] : undefined;
}

function ActionCard({ icon, title, desc, onClick }: { icon: ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button className="action-card" onClick={onClick}>
      {icon}
      <strong>{title}</strong>
      <small>{desc}</small>
    </button>
  );
}

/** 축소 이미지가 없으면 첫 페이지 종류 아이콘 */
function KindIcon({ doc }: { doc: DocRecord }) {
  const first = doc.manifest.pages[0];
  switch (first?.kind) {
    case "html":
    case "url":
    case "youtube":
      return <FileCode2 size={32} />;
    case "image":
      return <Image size={32} />;
    case "video":
      return <Film size={32} />;
    default:
      return <FileText size={32} />;
  }
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}일 전`;
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
