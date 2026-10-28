import type { Asset, DocState } from "../doc/types";
import { emptyHistory, type InkBook } from "../ink/history";
import type { Stroke } from "../ink/types";
import { openPdf } from "../pdf/pdfjs";
import { db, type AssetMeta, type DocRecord, type Manifest } from "./db";

// 문서 저장·불러오기. 화면(App)은 DocState로 일하고, 여기서 Manifest·Blob·필기 레코드로 바꿔 저장한다.

type ChangeKind = "local" | "remote" | "deleted";
type Listener = (docId: string, kind: ChangeKind) => void;
const listeners = new Set<Listener>();

/** 문서가 바뀌면 알림 (동기화 예약, 열린 문서 다시 불러오기 등) */
export function onDocChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDocChange(docId: string, kind: ChangeKind) {
  for (const fn of listeners) fn(docId, kind);
}

export async function listDocs(): Promise<DocRecord[]> {
  const all = await (await db()).getAll("docs");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  return (await db()).get("docs", id);
}

export interface NewDocInput {
  id: string;
  manifest: Manifest;
  assets: Record<string, Blob>;
  ink?: Record<string, Stroke[]>;
  createdAt?: number;
  updatedAt?: number;
}

/** 새 문서(또는 드라이브·파일에서 받은 문서)를 통째로 쓴다. 같은 id가 있으면 바꿔 쓴다. */
export async function writeDoc(input: NewDocInput, kind: ChangeKind = "local"): Promise<DocRecord> {
  const d = await db();
  const now = Date.now();
  const record: DocRecord = {
    id: input.id,
    title: input.manifest.title,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    pageCount: input.manifest.pages.length,
    manifest: input.manifest,
  };
  const tx = d.transaction(["docs", "assets", "ink"], "readwrite");
  const old = await tx.objectStore("docs").get(input.id);
  if (old?.thumb) record.thumb = old.thumb;
  // 바꿔 쓰는 경우 예전 필기는 지운다 (원본 Blob은 같은 id면 덮어쓴다)
  for (const key of await tx.objectStore("ink").index("byDoc").getAllKeys(input.id)) await tx.objectStore("ink").delete(key);
  for (const [assetId, data] of Object.entries(input.assets)) {
    await tx.objectStore("assets").put({ docId: input.id, assetId, data });
  }
  for (const [pageId, strokes] of Object.entries(input.ink ?? {})) {
    if (strokes.length) await tx.objectStore("ink").put({ docId: input.id, pageId, strokes });
  }
  await tx.objectStore("docs").put(record);
  await tx.done;
  emitDocChange(input.id, kind);
  return record;
}

export async function putAsset(docId: string, assetId: string, data: Blob): Promise<void> {
  await (await db()).put("assets", { docId, assetId, data });
}

export async function getAsset(docId: string, assetId: string): Promise<Blob | undefined> {
  return (await (await db()).get("assets", [docId, assetId]))?.data;
}

export async function hasAsset(docId: string, assetId: string): Promise<boolean> {
  return (await (await db()).getKey("assets", [docId, assetId])) !== undefined;
}

/** 페이지 구성·제목 저장 */
export async function saveManifest(docId: string, manifest: Manifest): Promise<void> {
  const d = await db();
  const tx = d.transaction("docs", "readwrite");
  const rec = await tx.store.get(docId);
  if (!rec) return;
  await tx.store.put({ ...rec, manifest, title: manifest.title, pageCount: manifest.pages.length, updatedAt: Date.now() });
  await tx.done;
  emitDocChange(docId, "local");
}

/** 한 페이지의 필기 저장 (획이 끝날 때마다) */
export async function saveInk(docId: string, pageId: string, strokes: Stroke[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(["ink", "docs"], "readwrite");
  if (strokes.length) await tx.objectStore("ink").put({ docId, pageId, strokes });
  else await tx.objectStore("ink").delete([docId, pageId]);
  const rec = await tx.objectStore("docs").get(docId);
  if (rec) await tx.objectStore("docs").put({ ...rec, updatedAt: Date.now() });
  await tx.done;
  emitDocChange(docId, "local");
}

export async function loadInk(docId: string): Promise<Record<string, Stroke[]>> {
  const rows = await (await db()).getAllFromIndex("ink", "byDoc", docId);
  return Object.fromEntries(rows.map((r) => [r.pageId, r.strokes]));
}

export async function renameDoc(docId: string, title: string): Promise<void> {
  const rec = await getDoc(docId);
  if (!rec) return;
  await saveManifest(docId, { ...rec.manifest, title });
}

/** 목록용 축소 이미지만 바꾼다 (내용 변경이 아니므로 updatedAt은 그대로) */
export async function setThumb(docId: string, thumb: string | undefined): Promise<void> {
  const d = await db();
  const tx = d.transaction("docs", "readwrite");
  const rec = await tx.store.get(docId);
  if (rec && rec.thumb !== thumb) await tx.store.put({ ...rec, thumb });
  await tx.done;
}

/** 문서 삭제. 드라이브에 올라간 적이 있으면 다음 동기화 때 드라이브에서도 지우도록 표시한다 */
export async function deleteDoc(docId: string, kind: ChangeKind = "deleted"): Promise<void> {
  const d = await db();
  const tx = d.transaction(["docs", "assets", "ink", "sync", "tombstones"], "readwrite");
  for (const key of await tx.objectStore("assets").index("byDoc").getAllKeys(docId)) await tx.objectStore("assets").delete(key);
  for (const key of await tx.objectStore("ink").index("byDoc").getAllKeys(docId)) await tx.objectStore("ink").delete(key);
  const sync = await tx.objectStore("sync").get(docId);
  if (sync?.docFileId && kind === "deleted") {
    await tx.objectStore("tombstones").put({
      docId,
      fileIds: [sync.docFileId, ...Object.values(sync.assetFiles)],
      deletedAt: Date.now(),
    });
  }
  await tx.objectStore("sync").delete(docId);
  await tx.objectStore("docs").delete(docId);
  await tx.done;
  emitDocChange(docId, kind);
}

// ── 화면용 문서(DocState) ↔ 저장용(Manifest) ────────────────────

export function assetMeta(asset: Asset): AssetMeta {
  switch (asset.kind) {
    case "pdf":
      return { type: "pdf", name: asset.name, pageCount: asset.pageCount, aspects: asset.aspects };
    case "html":
      return { type: "html", name: asset.name, warnings: asset.warnings };
    case "image":
      return { type: "image", name: asset.name, mime: asset.mime, width: asset.width, height: asset.height };
    case "video":
      return {
        type: "video",
        name: asset.name,
        mime: asset.mime,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        poster: asset.poster,
      };
  }
}

export function toManifest(doc: DocState): Manifest {
  return {
    version: 1,
    title: doc.title,
    assets: Object.fromEntries(Object.entries(doc.assets).map(([id, a]) => [id, assetMeta(a)])),
    pages: doc.pages,
    hidden: doc.hidden,
  };
}

export interface OpenedDoc {
  doc: DocState;
  ink: InkBook;
  /** 원본 파일이 없는 것(드라이브에서 아직 다 못 받음 등) */
  missingAssets: string[];
}

/** 저장된 문서를 열어 화면용 상태로 만든다 (PDF 열기, 이미지·동영상 URL 만들기) */
export async function openDoc(docId: string): Promise<OpenedDoc | null> {
  const rec = await getDoc(docId);
  if (!rec) return null;
  const assets: Record<string, Asset> = {};
  const missingAssets: string[] = [];
  for (const [id, meta] of Object.entries(rec.manifest.assets)) {
    const blob = await getAsset(docId, id);
    if (!blob) {
      missingAssets.push(id);
      continue;
    }
    try {
      assets[id] = await toRuntimeAsset(id, meta, blob);
    } catch (err) {
      console.error("원본을 열지 못했습니다", id, err);
      missingAssets.push(id);
    }
  }
  const inkRows = await loadInk(docId);
  const ink: InkBook = Object.fromEntries(Object.entries(inkRows).map(([pageId, strokes]) => [pageId, { ...emptyHistory, present: strokes }]));
  return {
    doc: { id: docId, title: rec.title, assets, pages: rec.manifest.pages, hidden: rec.manifest.hidden ?? [] },
    ink,
    missingAssets,
  };
}

/** 저장된 원본(Blob)을 화면용 원본으로 (PDF 열기, 이미지·동영상 URL 만들기) */
export async function toRuntimeAsset(id: string, meta: AssetMeta, blob: Blob): Promise<Asset> {
  switch (meta.type) {
    case "pdf": {
      const doc = await openPdf(await blob.arrayBuffer());
      return { kind: "pdf", id, name: meta.name, doc, pageCount: meta.pageCount, aspects: meta.aspects };
    }
    case "html":
      return { kind: "html", id, name: meta.name, html: await blob.text(), warnings: meta.warnings };
    case "image":
    case "video":
      return {
        kind: meta.type,
        id,
        name: meta.name,
        mime: meta.mime,
        width: meta.width,
        height: meta.height,
        duration: meta.type === "video" ? meta.duration : undefined,
        poster: meta.type === "video" ? meta.poster : undefined,
        url: URL.createObjectURL(blob),
      };
  }
}

/** 문서를 닫을 때 PDF·object URL을 정리한다 */
export function releaseDoc(doc: DocState) {
  for (const a of Object.values(doc.assets)) {
    if (a.kind === "pdf") a.doc.loadingTask.destroy();
    else if (a.kind === "image" || a.kind === "video") URL.revokeObjectURL(a.url);
  }
}
