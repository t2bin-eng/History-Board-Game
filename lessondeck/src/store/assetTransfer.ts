import type { ClipAsset } from "../doc/clipboard";
import { newId, type Asset } from "../doc/types";
import { extractPdfPages } from "../pdf/extract";
import type { AssetMeta } from "./db";
import { assetMeta, getAsset, putAsset, toRuntimeAsset } from "./docStore";

// 복사한 스티커·페이지가 쓰는 원본 파일을 클립보드에 담고, 붙일 문서에 넣는다 (SPEC 5장 "앱 안 클립보드").

/** 원본 파일을 클립보드에 담는다 (기기에 아직 없는 원본은 빼고) */
export async function collectAssets(docId: string, ids: string[], assets: Record<string, Asset>): Promise<Record<string, ClipAsset>> {
  const out: Record<string, ClipAsset> = {};
  for (const id of ids) {
    const asset = assets[id];
    const blob = asset && (await getAsset(docId, id));
    if (asset && blob) out[id] = { meta: assetMeta(asset), blob };
  }
  return out;
}

export interface ImportedAssets {
  /** 문서에 새로 더할 화면용 원본 */
  added: Record<string, Asset>;
  /** 클립보드 원본 id → 붙일 문서의 원본 id (바뀐 것만) */
  assetMap: Record<string, string>;
  /** PDF 쪽만 뽑았을 때: 클립보드 원본 id → (원래 쪽 → 새 쪽) */
  pdfIndexMap: Record<string, Record<number, number>>;
}

const PREFIX: Record<AssetMeta["type"], string> = {
  pdf: "pdf",
  html: "html",
  image: "img",
  video: "video",
};

/**
 * 붙일 문서에 원본을 넣는다.
 * 같은 문서면 그대로 같이 쓴다. 다른 문서에 같은 id가 있으면 같은 파일(종류·이름·크기)일 때만 같이 쓰고 아니면 새 id로.
 * pdfPages가 있으면 PDF는 그 쪽만 뽑은 새 PDF로 넣는다(뽑지 못하면 전체).
 */
export async function importAssets(
  target: { id: string; assets: Record<string, Asset> },
  clipDocId: string,
  clipAssets: Record<string, ClipAsset>,
  pdfPages: Record<string, number[]> = {},
): Promise<ImportedAssets> {
  const result: ImportedAssets = { added: {}, assetMap: {}, pdfIndexMap: {} };
  for (const [id, { meta, blob }] of Object.entries(clipAssets)) {
    const existing = target.assets[id];
    if (existing && clipDocId === target.id) continue;
    if (existing && (await sameFile(target.id, id, existing, meta, blob))) continue;

    let outMeta = meta;
    let outBlob = blob;
    let outId = existing ? newId(PREFIX[meta.type]) : id;
    const wanted = pdfPages[id];
    if (meta.type === "pdf" && wanted?.length && wanted.length < meta.pageCount) {
      try {
        outBlob = await extractPdfPages(blob, wanted);
        outMeta = {
          ...meta,
          pageCount: wanted.length,
          aspects: wanted.map((i) => meta.aspects[i] ?? meta.aspects[0]),
        };
        result.pdfIndexMap[id] = Object.fromEntries(wanted.map((i, k) => [i, k]));
        // 원래 파일과 다른 내용이므로 늘 새 id
        outId = newId(PREFIX.pdf);
      } catch (err) {
        console.warn("PDF 쪽을 뽑지 못해 전체를 넣습니다", err);
      }
    }
    await putAsset(target.id, outId, outBlob);
    result.added[outId] = await toRuntimeAsset(outId, outMeta, outBlob);
    if (outId !== id) result.assetMap[id] = outId;
  }
  return result;
}

async function sameFile(docId: string, id: string, existing: Asset, meta: AssetMeta, blob: Blob): Promise<boolean> {
  if (existing.kind !== meta.type || existing.name !== meta.name) return false;
  const have = await getAsset(docId, id);
  return !!have && have.size === blob.size;
}
