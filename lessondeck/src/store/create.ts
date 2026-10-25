import { loadPdfAsset, pagesForAsset } from "../doc/load";
import { A4_PORTRAIT, newId, newPageId } from "../doc/types";
import { assetMeta, writeDoc } from "./docStore";

// 새 문서 만들기 (문서 목록 화면)

/** PDF 파일로 새 수업 문서 */
export async function createDocFromPdf(file: Blob, fileName: string): Promise<string> {
  const asset = await loadPdfAsset(await file.arrayBuffer(), fileName);
  try {
    const id = newId("doc");
    await writeDoc({
      id,
      manifest: {
        version: 1,
        title: asset.name,
        assets: { [asset.id]: assetMeta(asset) },
        pages: pagesForAsset(asset),
        hidden: [],
      },
      assets: { [asset.id]: file.type ? file : new Blob([file], { type: "application/pdf" }) },
    });
    return id;
  } finally {
    asset.doc.loadingTask.destroy();
  }
}

/** 빈 노트 (A4 세로 백지 한 장) */
export async function createBlankDoc(title = "새 노트"): Promise<string> {
  const id = newId("doc");
  await writeDoc({
    id,
    manifest: {
      version: 1,
      title,
      assets: {},
      pages: [{ id: newPageId(), kind: "blank", background: "plain", aspect: A4_PORTRAIT }],
      hidden: [],
    },
    assets: {},
  });
  return id;
}

/** 필기감 시험지(앱에 들어 있는 샘플 PDF) */
export async function createSampleDoc(): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}sample.pdf`);
  if (!res.ok) throw new Error(`샘플 PDF를 불러오지 못했습니다 (${res.status})`);
  const blob = await res.blob();
  return createDocFromPdf(new Blob([blob], { type: "application/pdf" }), "필기감 시험지.pdf");
}
