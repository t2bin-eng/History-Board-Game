import { useSyncExternalStore } from "react";
import { newId } from "../doc/types";
import type { Stroke } from "../ink/types";
import { db, getMeta, setMeta, type DocRecord, type Manifest, type SyncRecord } from "../store/db";
import { deleteDoc, getAsset, getDoc, hasAsset, listDocs, loadInk, onDocChange, writeDoc } from "../store/docStore";
import { AuthRequiredError, driveAvailability, getAccessToken, revokeAccess } from "./auth";
import { aboutEmail, createFile, deleteFile, downloadFile, listAppFiles, updateFile, type DriveFile } from "./drive";

// 구글 드라이브 백업·동기화
// 드라이브 앱 전용 숨김 폴더에 문서마다
//   - doc-<docId>.json.gz : 페이지 구성(manifest) + 모든 페이지 필기 (자주 바뀜, 압축)
//   - asset-<docId>-<assetId> : PDF·HTML·이미지·동영상 원본 (한 번만 올림)
// 을 둔다. 어느 기기에서든 같은 구글 계정을 연결하면 문서를 모두 받아 오고, 이후 자동으로 맞춘다.

export type SyncPhase = "off" | "unavailable" | "idle" | "syncing" | "offline" | "needs-auth" | "error";

export interface SyncState {
  phase: SyncPhase;
  email?: string;
  lastSyncAt?: number;
  message?: string;
}

interface DriveMeta {
  connected: boolean;
  email?: string;
  lastSyncAt?: number;
}

interface DocPayload {
  format: "lessondeck-sync";
  version: 1;
  docId: string;
  createdAt: number;
  updatedAt: number;
  manifest: Manifest;
  ink: Record<string, Stroke[]>;
}

/** 고친 뒤 이만큼 조용하면 올린다 */
const CHANGE_DELAY = 15_000;
/** 열려 있는 동안 이 간격으로 다른 기기의 변경을 확인한다 */
const POLL_INTERVAL = 3 * 60_000;

// ── 상태 (화면 표시용) ───────────────────────────────────

let state: SyncState = { phase: "off" };
const subscribers = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const fn of subscribers) fn();
}

export function getSyncState(): SyncState {
  return state;
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    () => state,
  );
}

// ── 연결 ─────────────────────────────────────────────────

let connected = false;

export async function initSync(): Promise<void> {
  const avail = driveAvailability();
  const meta = await getMeta<DriveMeta>("drive");
  if (!meta?.connected) {
    setState(avail.ok ? { phase: "off" } : { phase: "unavailable", message: avail.reason });
    return;
  }
  connected = true;
  setState({ phase: "idle", email: meta.email, lastSyncAt: meta.lastSyncAt, message: undefined });
  startAuto();
  scheduleSync(1500);
}

/** 구글 계정 연결 (동의 화면) → 바로 첫 동기화 */
export async function connectDrive(): Promise<void> {
  setState({ phase: "syncing", message: "구글 계정 연결 중…" });
  try {
    await getAccessToken(true);
    const email = await aboutEmail();
    await setMeta("drive", { connected: true, email } satisfies DriveMeta);
    connected = true;
    setState({ phase: "idle", email, message: undefined });
    startAuto();
    await syncNow();
  } catch (err) {
    console.error(err);
    setState({ phase: connected ? "needs-auth" : "off", message: err instanceof Error ? err.message : "연결하지 못했습니다" });
  }
}

/** 이 기기의 연결을 끊는다 (기기 안 문서와 드라이브 백업은 그대로 둔다) */
export async function disconnectDrive(): Promise<void> {
  connected = false;
  stopAuto();
  await revokeAccess();
  const d = await db();
  await d.clear("sync");
  await d.clear("tombstones");
  await setMeta("drive", { connected: false } satisfies DriveMeta);
  setState({ phase: "off", email: undefined, lastSyncAt: undefined, message: undefined });
}

// ── 자동 동기화 ──────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | undefined;
let poll: ReturnType<typeof setInterval> | undefined;
let offChange: (() => void) | undefined;

function scheduleSync(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

const onVisibility = () => {
  if (document.visibilityState === "hidden") void syncNow();
  else scheduleSync(1000);
};
const onOnline = () => scheduleSync(1000);

function startAuto() {
  stopAuto();
  offChange = onDocChange((_id, kind) => {
    if (kind !== "remote") scheduleSync(CHANGE_DELAY);
  });
  poll = setInterval(() => void syncNow(), POLL_INTERVAL);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
}

function stopAuto() {
  clearTimeout(timer);
  clearInterval(poll);
  offChange?.();
  offChange = undefined;
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("online", onOnline);
}

let running: Promise<void> | null = null;
let again = false;

/** 지금 동기화 (이미 도는 중이면 끝난 뒤 한 번 더) */
export function syncNow(): Promise<void> {
  if (!connected) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = runSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      scheduleSync(500);
    }
  });
  return running;
}

// ── 동기화 본체 ──────────────────────────────────────────

interface Remote {
  docs: Map<string, DriveFile>;
  assets: Map<string, DriveFile>;
}

const assetKey = (docId: string, assetId: string) => `${docId}/${assetId}`;

async function runSync(): Promise<void> {
  if (!navigator.onLine) {
    setState({ phase: "offline", message: "인터넷에 연결되면 동기화합니다" });
    return;
  }
  setState({ phase: "syncing", message: "드라이브 확인 중…" });
  try {
    await getAccessToken(false);
  } catch (err) {
    setState({
      phase: "needs-auth",
      message: err instanceof AuthRequiredError ? "구글 계정을 다시 연결해 주세요" : err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const errors: string[] = [];
  try {
    const remote = indexRemote(await listAppFiles());
    const d = await db();

    // 1) 이 기기에서 지운 문서 → 드라이브에서도 삭제
    for (const t of await d.getAll("tombstones")) {
      const ids = new Set(t.fileIds);
      const r = remote.docs.get(t.docId);
      if (r) ids.add(r.id);
      for (const [key, f] of remote.assets) if (key.startsWith(`${t.docId}/`)) ids.add(f.id);
      for (const id of ids) await deleteFile(id);
      remote.docs.delete(t.docId);
      await d.delete("tombstones", t.docId);
    }

    // 2) 이 기기의 문서
    const syncRecs = new Map((await d.getAll("sync")).map((s) => [s.docId, s]));
    for (const doc of await listDocs()) {
      try {
        await syncDoc(doc, syncRecs.get(doc.id), remote);
      } catch (err) {
        console.error("동기화 실패", doc.title, err);
        errors.push(`${doc.title}: ${err instanceof Error ? err.message : err}`);
      }
      remote.docs.delete(doc.id);
    }

    // 3) 다른 기기에만 있는 문서 → 받아 오기
    for (const r of remote.docs.values()) {
      try {
        await download(r, remote, false);
      } catch (err) {
        console.error("받기 실패", r.name, err);
        errors.push(`${r.name}: ${err instanceof Error ? err.message : err}`);
      }
    }
  } catch (err) {
    console.error(err);
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const lastSyncAt = Date.now();
  if (errors.length) {
    setState({ phase: "error", message: errors[0], lastSyncAt: state.lastSyncAt });
  } else {
    await setMeta("drive", { connected: true, email: state.email, lastSyncAt } satisfies DriveMeta);
    setState({ phase: "idle", message: undefined, lastSyncAt });
  }
}

function indexRemote(files: DriveFile[]): Remote {
  const docs = new Map<string, DriveFile>();
  const assets = new Map<string, DriveFile>();
  for (const f of files) {
    const p = f.appProperties ?? {};
    if (p.kind === "doc" && p.docId) {
      const prev = docs.get(p.docId);
      if (!prev || Number(p.updatedAt) > Number(prev.appProperties?.updatedAt)) docs.set(p.docId, f);
    } else if (p.kind === "asset" && p.docId && p.assetId) {
      assets.set(assetKey(p.docId, p.assetId), f);
    }
  }
  return { docs, assets };
}

async function syncDoc(doc: DocRecord, st: SyncRecord | undefined, remote: Remote) {
  const r = remote.docs.get(doc.id);
  const localDirty = !st || st.syncedLocalUpdatedAt == null || doc.updatedAt > st.syncedLocalUpdatedAt;
  if (!r) {
    if (st?.docFileId && !localDirty) {
      // 다른 기기에서 지운 문서
      await deleteDoc(doc.id, "remote");
      return;
    }
    await upload(doc, st, remote);
    return;
  }
  const remoteUpdated = Number(r.appProperties?.updatedAt ?? 0);
  const remoteChanged = !st || remoteUpdated !== st.remoteUpdatedAt;
  if (localDirty && remoteChanged) {
    if (remoteUpdated === doc.updatedAt) {
      // 같은 내용 (예: 연결을 끊었다 다시 연결)
      await putSync({ docId: doc.id, docFileId: r.id, remoteUpdatedAt: remoteUpdated, syncedLocalUpdatedAt: doc.updatedAt, assetFiles: assetFilesOf(doc.id, doc.manifest, remote) });
      return;
    }
    // 두 기기에서 모두 고침 → 다른 기기 쪽을 사본으로 남기고 이 기기 내용을 올린다
    setState({ message: `${doc.title}: 다른 기기의 변경을 사본으로 받는 중…` });
    const copyId = await download(r, remote, true);
    await upload(doc, { ...(st ?? { docId: doc.id, assetFiles: {} }), docFileId: r.id }, remote);
    // 사본도 바로 올려 다른 기기에서도 두 판을 모두 볼 수 있게 한다
    const copy = copyId && (await getDoc(copyId));
    if (copy) await upload(copy, undefined, remote);
    return;
  }
  if (localDirty) await upload(doc, { ...(st ?? { docId: doc.id, assetFiles: {} }), docFileId: r.id }, remote);
  else if (remoteChanged) await download(r, remote, false);
}

function assetFilesOf(docId: string, manifest: Manifest, remote: Remote): Record<string, string> {
  const out: Record<string, string> = {};
  for (const assetId of Object.keys(manifest.assets)) {
    const f = remote.assets.get(assetKey(docId, assetId));
    if (f) out[assetId] = f.id;
  }
  return out;
}

async function putSync(rec: SyncRecord) {
  await (await db()).put("sync", rec);
}

async function upload(docBefore: DocRecord, st: SyncRecord | undefined, remote: Remote) {
  // 올리는 도중 고치면 updatedAt이 커져 다음 동기화 때 다시 올라간다
  const doc = (await getDoc(docBefore.id)) ?? docBefore;
  const updatedAt = doc.updatedAt;
  const assetFiles = { ...(st?.assetFiles ?? {}), ...assetFilesOf(doc.id, doc.manifest, remote) };

  for (const [assetId, meta] of Object.entries(doc.manifest.assets)) {
    if (assetFiles[assetId]) continue;
    const blob = await getAsset(doc.id, assetId);
    if (!blob) continue;
    setState({ message: `${doc.title}: ${meta.name} 올리는 중…` });
    assetFiles[assetId] = await createFile(
      {
        name: `asset-${doc.id}-${assetId}`,
        mimeType: blob.type || "application/octet-stream",
        appProperties: { kind: "asset", docId: doc.id, assetId },
      },
      blob,
    );
  }

  setState({ message: `${doc.title} 올리는 중…` });
  const payload: DocPayload = {
    format: "lessondeck-sync",
    version: 1,
    docId: doc.id,
    createdAt: doc.createdAt,
    updatedAt,
    manifest: doc.manifest,
    ink: await loadInk(doc.id),
  };
  const data = await gzipJson(payload);
  const meta = { appProperties: { kind: "doc", docId: doc.id, updatedAt: String(updatedAt) } };
  const docFileId = st?.docFileId
    ? await updateFile(st.docFileId, meta, data)
    : await createFile({ ...meta, name: `doc-${doc.id}.json.gz`, mimeType: "application/gzip" }, data);
  await putSync({ docId: doc.id, docFileId, remoteUpdatedAt: updatedAt, syncedLocalUpdatedAt: updatedAt, assetFiles });
}

/** 받아서 쓴 문서 id (이 기기에서 그사이 고쳐 건너뛰었으면 undefined) */
async function download(r: DriveFile, remote: Remote, asCopy: boolean): Promise<string | undefined> {
  const payload = await gunzipJson<DocPayload>(await downloadFile(r.id));
  if (payload.format !== "lessondeck-sync") throw new Error("알 수 없는 파일 형식");
  const sourceId = payload.docId;
  const targetId = asCopy ? newId("doc") : sourceId;
  setState({ message: `${payload.manifest.title} 받는 중…` });

  const assets: Record<string, Blob> = {};
  const assetFiles: Record<string, string> = {};
  for (const [assetId, meta] of Object.entries(payload.manifest.assets)) {
    const f = remote.assets.get(assetKey(sourceId, assetId));
    if (f) assetFiles[assetId] = f.id;
    const have = await hasAsset(targetId, assetId);
    if (have) continue;
    if (!f && !asCopy) continue;
    // 사본은 원래 문서의 원본을 기기 안에서 그대로 복사한다
    const local = asCopy ? await getAsset(sourceId, assetId) : undefined;
    if (local) assets[assetId] = local;
    else if (f) {
      setState({ message: `${payload.manifest.title}: ${meta.name} 받는 중…` });
      assets[assetId] = await downloadFile(f.id, f.mimeType);
    }
  }

  if (!asCopy) {
    // 받는 사이에 이 기기에서 고쳤으면 덮어쓰지 않는다 (다음 동기화 때 충돌로 처리)
    const st = await (await db()).get("sync", targetId);
    const local = await getDoc(targetId);
    if (local && st && local.updatedAt > (st.syncedLocalUpdatedAt ?? 0)) return undefined;
  }

  const manifest = asCopy ? { ...payload.manifest, title: `${payload.manifest.title} (다른 기기)` } : payload.manifest;
  await writeDoc(
    {
      id: targetId,
      manifest,
      assets,
      ink: payload.ink,
      createdAt: payload.createdAt,
      updatedAt: asCopy ? Date.now() : payload.updatedAt,
    },
    "remote",
  );
  if (!asCopy) {
    const remoteUpdated = Number(r.appProperties?.updatedAt ?? payload.updatedAt);
    await putSync({ docId: targetId, docFileId: r.id, remoteUpdatedAt: remoteUpdated, syncedLocalUpdatedAt: payload.updatedAt, assetFiles });
  }
  return targetId;
}

// ── 압축 ─────────────────────────────────────────────────

async function gzipJson(value: unknown): Promise<Blob> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(stream).arrayBuffer()], { type: "application/gzip" });
}

async function gunzipJson<T>(blob: Blob): Promise<T> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as T;
}
