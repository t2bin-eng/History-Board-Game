// HTML 파일·URL 페이지를 넣기 전 준비: 문자 인코딩 판별, 오프라인·sandbox 문제 미리 알리기 (SPEC R4·R6)

/** 파일 앞부분의 <meta charset>을 보고 글자 인코딩을 고른다 (예전 EUC-KR 파일 대비) */
export function sniffCharset(head: string): string {
  const m = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i);
  const cs = m?.[1]?.toLowerCase();
  if (cs === "euc-kr" || cs === "ks_c_5601-1987" || cs === "cp949" || cs === "ms949") return "euc-kr";
  return "utf-8";
}

export function decodeHtml(bytes: ArrayBuffer): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  try {
    return new TextDecoder(sniffCharset(head)).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const EXTERNAL = /<(?:script|link|img|iframe|audio|video|source)\b[^>]*\s(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i;
const CSS_EXTERNAL = /@import\s+(?:url\()?["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//i;
const RELATIVE = /<(?:script|link|img|audio|video|source)\b[^>]*\s(?:src|href)\s*=\s*["']?(?!https?:|\/\/|data:|blob:|#|javascript:|mailto:)[\w./-]+\.(?:js|css|png|jpe?g|gif|svg|webp|mp3|mp4|wav|json)\b/i;

/** 넣을 HTML에서 문제가 될 만한 점을 찾는다 */
export function analyzeHtml(html: string): string[] {
  const warnings: string[] = [];
  if (EXTERNAL.test(html) || CSS_EXTERNAL.test(html)) {
    warnings.push("인터넷에서 파일(라이브러리·글꼴·이미지)을 불러옵니다. 인터넷이 끊기면 일부가 동작하지 않을 수 있습니다.");
  }
  if (RELATIVE.test(html)) {
    warnings.push("같은 폴더의 다른 파일(이미지·스크립트)을 찾습니다. HTML 파일만 들어가므로 그 부분은 보이지 않습니다.");
  }
  if (/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(html)) {
    warnings.push("브라우저 저장소(localStorage 등)를 씁니다. 동작하지 않으면 배포된 주소를 URL 페이지로 넣어 주세요.");
  }
  return warnings;
}

/** 사용자가 입력한 주소를 https URL로 정리한다. 올바르지 않으면 null */
export function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z\d+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function displayName(fileName: string): string {
  return fileName.replace(/\.html?$/i, "");
}
