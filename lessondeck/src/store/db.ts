import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Page } from "../doc/types";
import type { Stroke } from "../ink/types";

// 기기 안 저장소 (SPEC 5장 · F8). 문서 = 원본 파일들 + 페이지 순서표(manifest) + 페이지별 필기.
// 원본은 Blob으로 따로 보관하고, 필기는 페이지마다 한 건씩 저장해 획이 끝날 때 그 페이지만 쓴다.

export type AssetMeta =
  | { type: "pdf"; name: string; pageCount: number; aspects: number[] }
  | { type: "html"; name: string; warnings: string[] }
  | { type: "image"; name: string; mime: string; width: number; height: number }
  | { type: "video"; name: string; mime: string; width: number; height: number; duration?: number; poster?: string };

/** SPEC 5장 manifest.json */
export interface Manifest {
  version: 1;
  title: string;
  assets: Record<string, AssetMeta>;
  pages: Page[];
  hidden: string[];
}

export interface DocRecord {
  id: string;
  title: string;
  createdAt: number;
  /** 내용(페이지·필기·제목)이 바뀐 시각. 동기화에서 "고친 적 있음"을 판단하는 기준 */
  updatedAt: number;
  pageCount: number;
  manifest: Manifest;
  /** 문서 목록에 보일 첫 페이지 축소 이미지 (data URL) */
  thumb?: string;
}

export interface AssetRecord {
  docId: string;
  assetId: string;
  data: Blob;
}

export interface InkRecord {
  docId: string;
  pageId: string;
  strokes: Stroke[];
}

/** 구글 드라이브 동기화 상태 (문서마다) */
export interface SyncRecord {
  docId: string;
  /** 드라이브의 문서 파일 id */
  docFileId?: string;
  /** 마지막으로 맞춘 드라이브 쪽 updatedAt */
  remoteUpdatedAt?: number;
  /** 마지막으로 올리거나 받은 시점의 이 기기 updatedAt */
  syncedLocalUpdatedAt?: number;
  /** 원본 파일 id → 드라이브 파일 id */
  assetFiles: Record<string, string>;
}

/** 이 기기에서 지운 문서. 다음 동기화 때 드라이브에서도 지운다 */
export interface Tombstone {
  docId: string;
  fileIds: string[];
  deletedAt: number;
}

interface Schema extends DBSchema {
  docs: { key: string; value: DocRecord };
  assets: { key: [string, string]; value: AssetRecord; indexes: { byDoc: string } };
  ink: { key: [string, string]; value: InkRecord; indexes: { byDoc: string } };
  sync: { key: string; value: SyncRecord };
  tombstones: { key: string; value: Tombstone };
  meta: { key: string; value: unknown };
}

export type LessonDeckDB = IDBPDatabase<Schema>;

let opening: Promise<LessonDeckDB> | null = null;

export function db(): Promise<LessonDeckDB> {
  opening ??= openDB<Schema>("lessondeck", 1, {
    upgrade(d) {
      d.createObjectStore("docs", { keyPath: "id" });
      d.createObjectStore("assets", { keyPath: ["docId", "assetId"] }).createIndex("byDoc", "docId");
      d.createObjectStore("ink", { keyPath: ["docId", "pageId"] }).createIndex("byDoc", "docId");
      d.createObjectStore("sync", { keyPath: "docId" });
      d.createObjectStore("tombstones", { keyPath: "docId" });
      d.createObjectStore("meta");
    },
  });
  return opening;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("meta", key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put("meta", value, key);
}

/** 브라우저가 저장 공간이 부족할 때 데이터를 지우지 않도록 요청한다 */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => undefined);
}
