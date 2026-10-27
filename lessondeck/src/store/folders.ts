// 폴더 정리 (SPEC 5장 "폴더"). 저장·동기화와 무관한 순수 계산만 둔다.
// 폴더·배치 하나하나에 updatedAt을 두고, 기기 사이에서는 하나씩 더 최근 것을 고르는 식으로 합친다.

export interface Folder {
  id: string;
  name: string;
  /** 윗 폴더 (null = 맨 위 "내 문서") */
  parentId: string | null;
  /** 폴더 아이콘 색 (없으면 기본색) */
  color?: string;
  createdAt: number;
  /** 이름·색·위치·삭제가 바뀐 시각 (기기 사이 합치기 기준) */
  updatedAt: number;
  /** 지운 폴더. 다른 기기에 "지웠음"을 전하려고 남긴다 */
  deleted?: boolean;
}

/** 문서가 든 폴더 */
export interface Placement {
  folderId: string | null;
  updatedAt: number;
}

export interface Library {
  version: 1;
  folders: Record<string, Folder>;
  placements: Record<string, Placement>;
}

export const FOLDER_COLORS = ["#4dabf7", "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#38d9a9", "#b197fc", "#f783ac"];
export const DEFAULT_FOLDER_COLOR = "#8fa3b8";

export function emptyLibrary(): Library {
  return { version: 1, folders: {}, placements: {} };
}

/** 드라이브·저장소에서 읽은 값을 믿을 수 있는 모양으로 */
export function parseLibrary(raw: unknown): Library {
  const lib = emptyLibrary();
  if (!raw || typeof raw !== "object") return lib;
  const r = raw as { folders?: Record<string, Partial<Folder>>; placements?: Record<string, Partial<Placement>> };
  for (const [id, f] of Object.entries(r.folders ?? {})) {
    if (!f || typeof f.name !== "string") continue;
    lib.folders[id] = {
      id,
      name: f.name,
      parentId: typeof f.parentId === "string" ? f.parentId : null,
      ...(typeof f.color === "string" ? { color: f.color } : {}),
      createdAt: Number(f.createdAt) || 0,
      updatedAt: Number(f.updatedAt) || 0,
      ...(f.deleted ? { deleted: true } : {}),
    };
  }
  for (const [docId, p] of Object.entries(r.placements ?? {})) {
    if (!p) continue;
    lib.placements[docId] = { folderId: typeof p.folderId === "string" ? p.folderId : null, updatedAt: Number(p.updatedAt) || 0 };
  }
  return lib;
}

const folderKey = (f: Folder) => JSON.stringify([f.id, f.name, f.parentId, f.color ?? null, f.createdAt, f.updatedAt, !!f.deleted]);

/** 같은 내용이면 같은 문자열 (키 순서와 무관). 드라이브 것과 같은지 비교할 때 */
export function libraryKey(lib: Library): string {
  const folders = Object.keys(lib.folders)
    .sort()
    .map((id) => folderKey(lib.folders[id]));
  const placements = Object.keys(lib.placements)
    .sort()
    .map((id) => [id, lib.placements[id].folderId, lib.placements[id].updatedAt]);
  return JSON.stringify([folders, placements]);
}

function pickFolder(a: Folder | undefined, b: Folder | undefined): Folder {
  if (!a) return b!;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  // 같은 시각이면 지운 쪽, 그래도 같으면 어느 기기에서 합쳐도 같은 결과가 되게 글자 순으로
  if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
  return folderKey(a) >= folderKey(b) ? a : b;
}

function pickPlacement(a: Placement | undefined, b: Placement | undefined): Placement {
  if (!a) return b!;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return String(a.folderId) >= String(b.folderId) ? a : b;
}

/** 두 기기의 정리를 합친다 (순서와 무관하게 같은 결과) */
export function mergeLibrary(a: Library, b: Library): Library {
  const out = emptyLibrary();
  for (const id of new Set([...Object.keys(a.folders), ...Object.keys(b.folders)])) out.folders[id] = pickFolder(a.folders[id], b.folders[id]);
  for (const id of new Set([...Object.keys(a.placements), ...Object.keys(b.placements)]))
    out.placements[id] = pickPlacement(a.placements[id], b.placements[id]);
  return out;
}

export function hasFolders(lib: Library): boolean {
  return Object.keys(lib.folders).length > 0;
}

// ── 화면에 보일 모양 ───────────────────────────────────────

export interface LibraryView {
  lib: Library;
  /** 살아 있는 폴더 */
  folders: Map<string, Folder>;
  /** 살아 있는 폴더가 실제로 보일 윗 폴더 */
  parentOf(folderId: string): string | null;
  /** 문서가 실제로 보일 폴더 */
  folderOfDoc(docId: string): string | null;
  /** 이 폴더 바로 안의 폴더 (이름 순) */
  children(parentId: string | null): Folder[];
  /** 맨 위부터 이 폴더까지 (내 문서 제외) */
  path(folderId: string | null): Folder[];
  /** 이 폴더와 그 안의 모든 폴더 id */
  subtree(folderId: string): Set<string>;
  isLive(folderId: string | null): boolean;
}

export const byName = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" });

export function viewLibrary(lib: Library): LibraryView {
  const live = new Map<string, Folder>();
  for (const f of Object.values(lib.folders)) if (!f.deleted) live.set(f.id, f);

  /** 지웠거나 없는 폴더를 건너 살아 있는 가장 가까운 윗 폴더 */
  const nearestLive = (start: string | null): string | null => {
    const seen = new Set<string>();
    let id = start;
    while (id != null && !seen.has(id)) {
      if (live.has(id)) return id;
      seen.add(id);
      id = lib.folders[id]?.parentId ?? null;
    }
    return null;
  };

  const parent = new Map<string, string | null>();
  for (const f of live.values()) parent.set(f.id, nearestLive(f.parentId));
  // 서로가 서로의 안에 든 고리 → 고리의 폴더들을 모두 맨 위로 (어느 기기에서나 같은 결과)
  const inCycle: string[] = [];
  for (const f of live.values()) {
    const seen = new Set<string>();
    let p = parent.get(f.id) ?? null;
    while (p != null && !seen.has(p)) {
      if (p === f.id) {
        inCycle.push(f.id);
        break;
      }
      seen.add(p);
      p = parent.get(p) ?? null;
    }
  }
  for (const id of inCycle) parent.set(id, null);

  const kids = new Map<string | null, Folder[]>();
  for (const f of live.values()) {
    const p = parent.get(f.id) ?? null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(f);
  }
  for (const list of kids.values()) list.sort((a, b) => byName(a.name, b.name) || a.createdAt - b.createdAt);

  return {
    lib,
    folders: live,
    parentOf: (id) => parent.get(id) ?? null,
    folderOfDoc: (docId) => nearestLive(lib.placements[docId]?.folderId ?? null),
    children: (p) => kids.get(p) ?? [],
    path(id) {
      const out: Folder[] = [];
      let cur = id != null && live.has(id) ? id : null;
      while (cur != null && out.length <= live.size) {
        out.unshift(live.get(cur)!);
        cur = parent.get(cur) ?? null;
      }
      return out;
    },
    subtree(id) {
      const out = new Set<string>([id]);
      const stack = [id];
      while (stack.length) {
        for (const c of kids.get(stack.pop()!) ?? []) {
          if (out.has(c.id)) continue;
          out.add(c.id);
          stack.push(c.id);
        }
      }
      return out;
    },
    isLive: (id) => id == null || live.has(id),
  };
}

/** 같은 곳에 같은 이름이 있으면 "이름 2", "이름 3" … */
export function uniqueName(view: LibraryView, parentId: string | null, base: string): string {
  const names = new Set(view.children(parentId).map((f) => f.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}
