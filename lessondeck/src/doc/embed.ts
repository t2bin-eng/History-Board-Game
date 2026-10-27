// 자주 쓰는 수업 서비스 주소를 "다른 페이지 안에 넣을 수 있는" 주소로 바꾼다.
// 이런 사이트는 보통 주소(편집·보기 화면)를 다른 앱 안에 띄우는 것을 막고, 삽입용 주소는 허용한다.
// 원래 주소는 그대로 저장하고 화면에 띄울 때만 바꾼다 ("브라우저에서 열기"는 원래 주소).

export function toEmbeddableUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "docs.google.com") {
    // 웹에 게시한 문서·슬라이드: /d/e/<게시 id>/pub
    let m = u.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/e\/([\w-]+)\/(pub\w*|embed)/);
    if (m) {
      const [, kind, id] = m;
      if (kind === "presentation") return `https://docs.google.com/presentation/d/e/${id}/embed?start=false&loop=false`;
      if (kind === "spreadsheets") return withParams(`https://docs.google.com/spreadsheets/d/e/${id}/pubhtml`, u, { widget: "true", headers: "false" });
      return withParams(`https://docs.google.com/document/d/e/${id}/pub`, u, { embedded: "true" });
    }
    m = u.pathname.match(/^\/(document|presentation|spreadsheets|drawings)\/d\/([\w-]+)/);
    if (m) {
      const [, kind, id] = m;
      if (kind === "presentation") return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`;
      if (kind === "drawings") return `https://docs.google.com/drawings/d/${id}/preview`;
      // 공유한 문서·시트는 미리보기 주소가 삽입을 허용한다
      return `https://docs.google.com/${kind}/d/${id}/preview`;
    }
    // 설문: /forms/d/e/<id>/viewform → 삽입용 표시
    m = u.pathname.match(/^\/forms\/d\/e\/([\w-]+)\/viewform/);
    if (m) return withParams(`https://docs.google.com/forms/d/e/${m[1]}/viewform`, u, { embedded: "true" });
    return url;
  }

  if (host === "drive.google.com") {
    const m = u.pathname.match(/^\/file\/d\/([\w-]+)/) ?? (u.pathname === "/open" ? ["", u.searchParams.get("id") ?? ""] : null);
    if (m && m[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return url;
  }

  if (host === "canva.com") {
    // 디자인 보기 링크(/design/<id>/<token>/view)는 ?embed를 붙이면 삽입된다
    if (/^\/design\/[\w-]+\/[\w-]+\/view/.test(u.pathname) && !u.searchParams.has("embed")) {
      u.searchParams.set("embed", "");
      return u.toString().replace(/embed=(&|$)/, "embed$1");
    }
    return url;
  }

  return url;
}

/** 원래 주소의 다른 매개변수(예: 시트의 gid)는 살리고 필요한 것만 더한다 */
function withParams(base: string, from: URL, extra: Record<string, string>): string {
  const out = new URL(base);
  for (const [k, v] of from.searchParams) if (!out.searchParams.has(k)) out.searchParams.set(k, v);
  for (const [k, v] of Object.entries(extra)) out.searchParams.set(k, v);
  if (from.hash) out.hash = from.hash;
  return out.toString();
}
