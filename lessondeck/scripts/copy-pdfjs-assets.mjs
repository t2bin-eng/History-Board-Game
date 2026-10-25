// pdf.js가 런타임에 불러오는 파일(한글 CID 글꼴용 cmaps, 표준 글꼴, 이미지 디코더 wasm, ICC)을
// public/pdfjs로 복사한다. 서비스 워커가 함께 캐시해 오프라인에서도 PDF가 열리게 한다.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const from = join(src, dir);
  if (existsSync(from)) cpSync(from, join(dest, dir), { recursive: true });
}
console.log("pdf.js assets copied to public/pdfjs");
