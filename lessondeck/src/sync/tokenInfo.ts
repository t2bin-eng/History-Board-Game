// 지금 토큰을 준 Google Cloud OAuth 클라이언트 (v0.34.2, SPEC 5장 "연결된 프로젝트 기억").
// 드라이브의 앱 전용 숨김 폴더는 Google Cloud 프로젝트마다 따로라, 어느 프로젝트에 연결됐는지 알아야
// "같은 계정인데 문서가 안 온다"를 가려내고, 프로젝트가 바뀌었을 때 이 기기 문서를 지우지 않게 할 수 있다.

const TOKENINFO = "https://oauth2.googleapis.com/tokeninfo";

export interface TokenClient {
  /** "325753720508-xxxx.apps.googleusercontent.com" */
  clientId: string;
  /** Google Cloud 프로젝트 번호 ("325753720508") */
  project: string;
}

/** 클라이언트 ID 앞의 프로젝트 번호. 꼴이 다르면 undefined */
export function projectOf(clientId: string): string | undefined {
  return /^(\d+)-[^\s]+\.apps\.googleusercontent\.com$/.exec(clientId)?.[1];
}

/** tokeninfo 응답 → 클라이언트 (azp가 토큰을 받은 클라이언트, 없으면 aud) */
export function parseTokenInfo(json: unknown): TokenClient | null {
  if (!json || typeof json !== "object") return null;
  const r = json as { azp?: unknown; aud?: unknown };
  const id = typeof r.azp === "string" && r.azp ? r.azp : typeof r.aud === "string" ? r.aud : "";
  const project = projectOf(id);
  return project ? { clientId: id, project } : null;
}

let last: { token: string; result: Promise<TokenClient | null> } | null = null;

/** 토큰마다 한 번만 묻는다. 알아내지 못하면(오프라인·오류) null */
export function tokenClient(token: string): Promise<TokenClient | null> {
  if (last?.token === token) return last.result;
  const result = (async () => {
    try {
      const res = await fetch(`${TOKENINFO}?access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!res.ok) return null;
      return parseTokenInfo(await res.json());
    } catch {
      return null;
    }
  })();
  last = { token, result };
  // 실패는 기억하지 않는다 (다음 동기화 때 다시)
  void result.then((r) => {
    if (!r && last?.token === token) last = null;
  });
  return result;
}
