// PDF에서 몇 쪽만 뽑아 새 PDF로 (페이지를 다른 문서에 붙일 때 큰 PDF 전체가 복사되지 않게).
// 쪽을 그대로 옮기므로 글자·그림이 벡터 그대로 남는다. pdf-lib은 이때만 불러온다.
export async function extractPdfPages(blob: Blob, indices: number[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  for (const p of pages) out.addPage(p);
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
