import { useEffect, useSyncExternalStore } from "react";
import { newId } from "../doc/types";
import { getMeta, setMeta } from "./db";
import { deleteDoc, listDocs } from "./docStore";
import { libraryKey, mergeLibrary, parseLibrary, viewLibrary, type Library, type LibraryView } from "./folders";

// 홈의 폴더 정리 저장 (meta "library" 한 건). 문서 내용과 따로 두어 문서 updatedAt·동기화 충돌과 무관하다.

type ChangeKind = "local" | "remote";

let current: Library | null = null;
let view: LibraryView | null = null;
let loading: Promise<Library> | null = null;
let writing: Promise<void> = Promise.resolve();
const viewSubscribers = new Set<() => void>();
const listeners = new Set<(kind: ChangeKind) => void>();

function setCurrent(lib: Library) {
  current = lib;
  view = viewLibrary(lib);
  for (const fn of viewSubscribers) fn();
}

export function loadLibrary(): Promise<Library> {
  if (current) return Promise.resolve(current);
  loading ??= getMeta<unknown>("library").then((raw) => {
    if (!current) setCurrent(parseLibrary(raw));
    return current!;
  });
  return loading;
}

/** 폴더 정리가 바뀌면 알림 (동기화 예약) */
export function onLibraryChange(fn: (kind: ChangeKind) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLibraryView(): LibraryView | null {
  const v = useSyncExternalStore(
    (fn) => {
      viewSubscribers.add(fn);
      return () => viewSubscribers.delete(fn);
    },
    () => view,
  );
  useEffect(() => {
    void loadLibrary();
  }, []);
  return v;
}

async function commit(next: Library, kind: ChangeKind) {
  setCurrent(next);
  writing = writing.then(() => setMeta("library", next)).catch((err) => console.error("폴더 정리를 저장하지 못했습니다", err));
  await writing;
  for (const fn of listeners) fn(kind);
}

async function change(edit: (lib: Library, view: LibraryView, now: number) => void) {
  await loadLibrary();
  // 기다리는 사이 다른 변경이 끝났을 수 있으니 지금 것을 고친다
  const lib = structuredClone(current!);
  edit(lib, viewLibrary(lib), Date.now());
  await commit(lib, "local");
}

export async function createFolder(name: string, parentId: string | null, color?: string): Promise<string> {
  const id = newId("folder");
  await change((lib, _v, now) => {
    lib.folders[id] = { id, name, parentId, ...(color ? { color } : {}), createdAt: now, updatedAt: now };
  });
  return id;
}

export async function editFolder(id: string, patch: { name?: string; color?: string }) {
  await change((lib, _v, now) => {
    const f = lib.folders[id];
    if (f) lib.folders[id] = { ...f, ...patch, updatedAt: now };
  });
}

/** 문서·폴더를 target 폴더로 옮긴다. 폴더를 자기 안으로는 옮기지 않는다. 옮긴 개수 */
export async function moveItems(docIds: string[], folderIds: string[], target: string | null): Promise<number> {
  let moved = 0;
  await change((lib, v, now) => {
    for (const docId of docIds) {
      if (v.folderOfDoc(docId) === target) continue;
      lib.placements[docId] = { folderId: target, updatedAt: now };
      moved++;
    }
    for (const id of folderIds) {
      const f = lib.folders[id];
      if (!f || f.deleted || v.parentOf(id) === target) continue;
      if (target != null && v.subtree(id).has(target)) continue;
      lib.folders[id] = { ...f, parentId: target, updatedAt: now };
      moved++;
    }
  });
  return moved;
}

/** 새로 만든 문서를 폴더에 넣는다 */
export async function placeDoc(docId: string, folderId: string | null) {
  if (folderId == null && !(await loadLibrary()).placements[docId]) return;
  await change((lib, _v, now) => {
    lib.placements[docId] = { folderId, updatedAt: now };
  });
}

export async function docFolder(docId: string): Promise<string | null> {
  return viewLibrary(await loadLibrary()).folderOfDoc(docId);
}

/**
 * 폴더 지우기.
 * keep: 폴더만 지운다 — 안의 문서·폴더는 화면에서 살아 있는 윗 폴더에 보인다(옮겨 적지 않으므로,
 *       다른 기기가 그 뒤에 폴더를 고쳤으면 안의 것과 함께 되살아난다).
 * all: 안의 폴더까지 지우고 그 안의 문서를 모두 삭제한다. 삭제한 문서 수
 */
export async function deleteFolders(ids: string[], mode: "keep" | "all"): Promise<number> {
  const v = viewLibrary(await loadLibrary());
  const doomed = new Set<string>();
  for (const id of ids) {
    if (!v.folders.has(id)) continue;
    if (mode === "all") for (const sub of v.subtree(id)) doomed.add(sub);
    else doomed.add(id);
  }
  const docIds = mode === "all" ? (await listDocs()).map((d) => d.id).filter((docId) => doomed.has(v.folderOfDoc(docId) ?? "")) : [];
  await change((lib, _v, now) => {
    for (const id of doomed) lib.folders[id] = { ...lib.folders[id], deleted: true, updatedAt: now };
  });
  for (const docId of docIds) await deleteDoc(docId);
  return docIds.length;
}

/** 드라이브에서 받은 정리를 합친다. 바뀐 것이 있으면 true */
export async function mergeRemoteLibrary(remote: Library): Promise<boolean> {
  await loadLibrary();
  const local = current!;
  const merged = mergeLibrary(local, remote);
  if (libraryKey(merged) === libraryKey(local)) return false;
  await commit(merged, "remote");
  return true;
}
