import JSZip from "jszip";
import { newId } from "../doc/types";
import type { Stroke } from "../ink/types";
import type { AssetMeta, Manifest } from "./db";
import { getAsset, getDoc, loadInk, writeDoc } from "./docStore";

// 프로젝트 파일(.lessondeck) = zip: manifest.json + ink/<pageId>.json + assets/<id>.<확장자> (SPEC 5장 · F9)
// PC ↔ 태블릿 이동, 백업용.

export const PROJECT_EXT = ".lessondeck";
export const PROJECT_ACCEPT = ".lessondeck,application/zip,application/octet-stream";

const EXT_BY_TYPE: Record<AssetMeta["type"], string> = { pdf: "pdf", html: "html", image: "img", video: "video" };

function assetExt(meta: AssetMeta): string {
  if (meta.type === "image" || meta.type === "video") {
    const sub = meta.mime.split("/")[1]?.split("+")[0];
    if (sub) return sub === "jpeg" ? "jpg" : sub;
  }
  return EXT_BY_TYPE[meta.type];
}

interface ManifestFile extends Manifest {
  format: "lessondeck";
  createdAt: number;
  updatedAt: number;
  /** 원본 파일 위치 (assetId → zip 안 경로) */
  files: Record<string, string>;
}

/** 문서 하나를 .lessondeck 파일로 */
export async function exportProject(docId: string): Promise<{ blob: Blob; title: string }> {
  const rec = await getDoc(docId);
  if (!rec) throw new Error("문서를 찾을 수 없습니다");
  const zip = new JSZip();
  const files: Record<string, string> = {};
  for (const [assetId, meta] of Object.entries(rec.manifest.assets)) {
    const data = await getAsset(docId, assetId);
    if (!data) continue;
    const path = `assets/${assetId}.${assetExt(meta)}`;
    files[assetId] = path;
    // PDF·이미지·동영상은 이미 압축된 형식이라 다시 압축하지 않는다
    zip.file(path, data, { compression: meta.type === "html" ? "DEFLATE" : "STORE" });
  }
  const ink = await loadInk(docId);
  for (const [pageId, strokes] of Object.entries(ink)) {
    zip.file(`ink/${pageId}.json`, JSON.stringify(strokes));
  }
  const manifest: ManifestFile = {
    ...rec.manifest,
    format: "lessondeck",
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    files,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/zip" });
  return { blob, title: rec.title };
}

/** .lessondeck 파일을 새 문서로 가져온다 (같은 문서가 있어도 덮어쓰지 않고 새로 만든다) */
export async function importProject(file: Blob): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("레슨덱 파일(.lessondeck)이 아닙니다");
  }
  const manifestText = await zip.file("manifest.json")?.async("string");
  if (!manifestText) throw new Error("manifest.json이 없는 파일입니다");
  const m = JSON.parse(manifestText) as Partial<ManifestFile>;
  if (!m.pages || !m.assets) throw new Error("레슨덱 파일 형식이 올바르지 않습니다");

  const assets: Record<string, Blob> = {};
  for (const [assetId, meta] of Object.entries(m.assets)) {
    const path = m.files?.[assetId] ?? `assets/${assetId}.${assetExt(meta)}`;
    const entry = zip.file(path);
    if (!entry) continue;
    const type = meta.type === "pdf" ? "application/pdf" : meta.type === "html" ? "text/html;charset=utf-8" : meta.mime;
    assets[assetId] = new Blob([await entry.async("arraybuffer")], { type });
  }
  const ink: Record<string, Stroke[]> = {};
  for (const page of m.pages) {
    const text = await zip.file(`ink/${page.id}.json`)?.async("string");
    if (text) ink[page.id] = JSON.parse(text);
  }
  const id = newId("doc");
  await writeDoc({
    id,
    manifest: { version: 1, title: m.title ?? "가져온 문서", assets: m.assets, pages: m.pages, hidden: m.hidden ?? [] },
    assets,
    ink,
    createdAt: m.createdAt,
  });
  return id;
}
