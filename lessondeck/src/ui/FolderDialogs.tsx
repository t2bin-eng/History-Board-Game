import { Check, Folder, FolderInput, FolderPlus, House, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { josa } from "../lib/josa";
import { DEFAULT_FOLDER_COLOR, FOLDER_COLORS, uniqueName, type Folder as FolderRec, type LibraryView } from "../store/folders";
import { createFolder, useLibraryView } from "../store/library";

// 홈의 폴더 정리 창들: 이름(·색) 정하기, 옮길 폴더 고르기, 지우기 확인

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function Dialog({ title, icon, className, onClose, children }: { title: string; icon: ReactNode; className?: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className={`modal home-dialog ${className ?? ""}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>
            {icon} {title}
          </strong>
          <button className="pp-icon" aria-label="닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function FolderIcon({ color, size = 28 }: { color?: string; size?: number }) {
  return (
    <span className="folder-icon" style={{ color: color ?? DEFAULT_FOLDER_COLOR }}>
      <Folder size={size} fill="currentColor" fillOpacity={0.28} />
    </span>
  );
}

interface NameDialogProps {
  title: string;
  initial: string;
  submitLabel: string;
  /** 있으면 색 고르기도 보인다 (폴더) */
  color?: { initial?: string };
  onSubmit: (name: string, color?: string) => void;
  onClose: () => void;
}

/** 새 폴더·폴더 고치기·문서 이름 바꾸기 */
export function NameDialog({ title, initial, submitLabel, color, onSubmit, onClose }: NameDialogProps) {
  const [name, setName] = useState(initial);
  const [picked, setPicked] = useState(color?.initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const trimmed = name.trim();
  const submit = () => trimmed && onSubmit(trimmed, picked);

  return (
    <Dialog title={title} icon={color ? <FolderIcon color={picked} size={20} /> : null} onClose={onClose}>
      <form
        className="name-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input ref={input} value={name} maxLength={80} aria-label="이름" onChange={(e) => setName(e.target.value)} />
        {color && (
          <div className="color-row" role="radiogroup" aria-label="폴더 색">
            <ColorSwatch value={undefined} picked={picked} onPick={setPicked} label="기본색" />
            {FOLDER_COLORS.map((c) => (
              <ColorSwatch key={c} value={c} picked={picked} onPick={setPicked} label={c} />
            ))}
          </div>
        )}
        <footer className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={!trimmed}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function ColorSwatch({ value, picked, onPick, label }: { value?: string; picked?: string; onPick: (c?: string) => void; label: string }) {
  const on = value === picked;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      className={`swatch${on ? " on" : ""}`}
      style={{ background: value ?? DEFAULT_FOLDER_COLOR }}
      onClick={() => onPick(value)}
    >
      {on && <Check size={16} />}
    </button>
  );
}

interface MoveDialogProps {
  docIds: string[];
  folderIds: string[];
  /** 옮기는 것들이 모두 같은 폴더에 있으면 그 폴더 (아니면 undefined) */
  from: string | null | undefined;
  onMove: (target: string | null) => void;
  onClose: () => void;
}

/** 옮길 폴더 고르기 (폴더 나무). 창 안에서 새 폴더도 만든다 */
export function MoveDialog({ docIds, folderIds, from, onMove, onClose }: MoveDialogProps) {
  const view = useLibraryView();
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [naming, setNaming] = useState<string | null>(null);

  const blocked = useMemo(() => {
    const out = new Set<string>();
    if (view) for (const id of folderIds) for (const sub of view.subtree(id)) out.add(sub);
    return out;
  }, [view, folderIds]);

  const rows = useMemo(() => (view ? flatten(view, null, 0) : []), [view]);
  const count = docIds.length + folderIds.length;
  const sameAsFrom = target !== undefined && target === from;

  const makeFolder = async () => {
    const name = naming?.trim();
    if (!name || !view) return;
    const parent = target ?? null;
    const id = await createFolder(uniqueName(view, parent, name), parent);
    setNaming(null);
    setTarget(id);
  };

  return (
    <Dialog title={`${count}개 옮기기`} icon={<FolderInput size={18} />} className="move-dialog" onClose={onClose}>
      <div className="folder-tree" role="listbox" aria-label="옮길 폴더">
        <TreeRow
          label="내 문서"
          icon={<House size={18} />}
          depth={0}
          selected={target === null}
          current={from === null}
          onPick={() => setTarget(null)}
        />
        {rows.map(({ folder, depth }) => (
          <TreeRow
            key={folder.id}
            label={folder.name}
            icon={<FolderIcon color={folder.color} size={18} />}
            depth={depth + 1}
            selected={target === folder.id}
            current={from === folder.id}
            disabled={blocked.has(folder.id)}
            onPick={() => setTarget(folder.id)}
          />
        ))}
      </div>
      {naming != null && (
        <form
          className="tree-new"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void makeFolder();
          }}
        >
          <FolderPlus size={18} />
          <input autoFocus value={naming} aria-label="새 폴더 이름" onChange={(e) => setNaming(e.target.value)} />
          <button type="submit" className="btn primary" disabled={!naming.trim()}>
            만들기
          </button>
        </form>
      )}
      <footer className="dialog-actions">
        <button type="button" className="btn ghost left" onClick={() => setNaming(naming == null ? "새 폴더" : null)}>
          <FolderPlus size={18} /> {target ? "고른 폴더 안에 새 폴더" : "새 폴더"}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn primary" disabled={target === undefined || sameAsFrom} onClick={() => onMove(target ?? null)}>
          여기로 옮기기
        </button>
      </footer>
    </Dialog>
  );
}

function flatten(view: LibraryView, parent: string | null, depth: number): { folder: FolderRec; depth: number }[] {
  return view.children(parent).flatMap((folder) => [{ folder, depth }, ...flatten(view, folder.id, depth + 1)]);
}

function TreeRow(props: { label: string; icon: ReactNode; depth: number; selected: boolean; current: boolean; disabled?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.selected}
      aria-disabled={props.disabled}
      disabled={props.disabled}
      className={`tree-row${props.selected ? " selected" : ""}`}
      style={{ paddingLeft: 12 + Math.min(props.depth, 8) * 20 }}
      onClick={props.onPick}
    >
      {props.icon}
      <span className="tree-label">{props.label}</span>
      {props.current && <small>지금 위치</small>}
      {props.selected && <Check size={18} />}
    </button>
  );
}

interface DeleteDialogProps {
  /** 지울 문서 이름들 */
  docTitles: string[];
  folderNames: string[];
  /** 고른 폴더 안에 든 것 (고른 것 제외) */
  inside: { docs: number; folders: number };
  /** "폴더만 지우기"를 하면 안의 것이 갈 곳 이름 */
  parentName: string;
  onConfirm: (mode: "keep" | "all") => void;
  onClose: () => void;
}

export function DeleteDialog({ docTitles, folderNames, inside, parentName, onConfirm, onClose }: DeleteDialogProps) {
  const what =
    docTitles.length + folderNames.length === 1
      ? folderNames.length
        ? `‘${folderNames[0]}’ 폴더를`
        : josa(`‘${docTitles[0]}’`, "을", "를")
      : `${[folderNames.length && `폴더 ${folderNames.length}개`, docTitles.length && `문서 ${docTitles.length}개`].filter(Boolean).join("와 ")}를`;
  const hasInside = inside.docs + inside.folders > 0;
  const insideText = [inside.folders && `폴더 ${inside.folders}개`, inside.docs && `문서 ${inside.docs}개`].filter(Boolean).join(", ");
  const parentTo = josa(`‘${parentName}’`, "으로", "로");

  return (
    <Dialog title="삭제" icon={<Trash2 size={18} />} className="delete-dialog" onClose={onClose}>
      <p className="dialog-text">
        <strong>{what}</strong> 지울까요?
        {hasInside && (
          <>
            <br />
            폴더 안에 {insideText}가 있습니다.
          </>
        )}
        {(docTitles.length > 0 || inside.docs > 0) && (
          <>
            <br />
            <small>삭제한 문서는 드라이브에 백업한 사본도 함께 삭제됩니다.</small>
          </>
        )}
      </p>
      <footer className={`dialog-actions${hasInside ? " stacked" : ""}`}>
        {hasInside ? (
          <>
            <button type="button" className="btn primary" onClick={() => onConfirm("keep")}>
              폴더만 지우기 <small>안의 것은 {parentTo} 꺼냄</small>
            </button>
            <button type="button" className="btn danger" onClick={() => onConfirm("all")}>
              안의 문서까지 모두 삭제
            </button>
            <button type="button" className="btn" onClick={onClose}>
              취소
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={onClose}>
              취소
            </button>
            <button type="button" className="btn danger" onClick={() => onConfirm("keep")}>
              삭제
            </button>
          </>
        )}
      </footer>
    </Dialog>
  );
}
