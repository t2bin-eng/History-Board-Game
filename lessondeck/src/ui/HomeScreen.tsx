import { EllipsisVertical, File, FileCode2, FileText, Film, FolderInput, Image, Pencil, Share2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { safeFileName, shareOrDownload } from "../lib/files";
import { showToast } from "../lib/platform";
import type { DocRecord } from "../store/db";
import { deleteDoc, listDocs, onDocChange, renameDoc } from "../store/docStore";
import { createBlankDoc, createDocFromPdf, createSampleDoc } from "../store/create";
import { exportProject, importProject, PROJECT_ACCEPT, PROJECT_EXT } from "../store/projectFile";

interface Props {
  onOpen: (docId: string) => void;
  /** 상단 바 오른쪽 (동기화 상태 버튼) */
  headerExtra?: ReactNode;
}

type Busy = string | null;

// 문서 목록 (SPEC 6장: 홈)
export function HomeScreen({ onOpen, headerExtra }: Props) {
  const [docs, setDocs] = useState<DocRecord[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [menu, setMenu] = useState<{ doc: DocRecord; left: number; top: number } | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);

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

  const run = async (label: string, job: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const id = await job();
      if (id) onOpen(id);
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : `${label}에 실패했습니다`);
    } finally {
      setBusy(null);
    }
  };

  const onRename = async (doc: DocRecord) => {
    setMenu(null);
    const title = window.prompt("문서 이름", doc.title)?.trim();
    if (title && title !== doc.title) await renameDoc(doc.id, title);
  };

  const onDelete = async (doc: DocRecord) => {
    setMenu(null);
    if (!window.confirm(`"${doc.title}"을(를) 삭제할까요?\n드라이브에 백업한 사본도 함께 삭제됩니다.`)) return;
    await deleteDoc(doc.id);
    showToast("문서를 삭제했습니다");
  };

  const onExport = (doc: DocRecord) => {
    setMenu(null);
    run("내보내기", async () => {
      const { blob, title } = await exportProject(doc.id);
      await shareOrDownload(blob, `${safeFileName(title)}${PROJECT_EXT}`);
    });
  };

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

      <main className="home-main">
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

        <section className="home-docs" aria-label="내 문서">
          <h2>내 문서 {docs ? <small>{docs.length}</small> : null}</h2>
          {docs && docs.length === 0 && (
            <p className="home-empty">아직 문서가 없습니다. 위에서 PDF로 새 수업을 만들거나, 구글 드라이브를 연결해 다른 기기의 문서를 받아 오세요.</p>
          )}
          <div className="doc-grid">
            {docs?.map((doc) => (
              <article key={doc.id} className="doc-card">
                <button className="doc-open" onClick={() => onOpen(doc.id)} aria-label={`${doc.title} 열기`}>
                  <span className="doc-thumb">{doc.thumb ? <img src={doc.thumb} alt="" /> : <KindIcon doc={doc} />}</span>
                  <span className="doc-info">
                    <strong>{doc.title}</strong>
                    <small>
                      {doc.pageCount}쪽 · {relativeTime(doc.updatedAt)}
                    </small>
                  </span>
                </button>
                <button
                  className="doc-menu-btn"
                  aria-label={`${doc.title} 메뉴`}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ doc, left: Math.min(r.left, window.innerWidth - 200), top: r.bottom + 4 });
                  }}
                >
                  <EllipsisVertical size={18} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>

      {menu && (
        <div className="menu-backdrop" onClick={() => setMenu(null)}>
          <div className="doc-menu" style={{ left: menu.left, top: menu.top }} role="menu" onClick={(e) => e.stopPropagation()}>
            <button role="menuitem" onClick={() => onRename(menu.doc)}>
              <Pencil size={18} /> 이름 바꾸기
            </button>
            <button role="menuitem" onClick={() => onExport(menu.doc)}>
              <Share2 size={18} /> 파일로 내보내기
            </button>
            <button role="menuitem" className="danger" onClick={() => onDelete(menu.doc)}>
              <Trash2 size={18} /> 삭제
            </button>
          </div>
        </div>
      )}

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
