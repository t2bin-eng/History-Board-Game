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

  if (isGoogleMapsUrl(u)) return googleMapsEmbedUrl(u) ?? url;

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

/** 구글 지도 주소인지 (google.com·google.co.kr 등의 /maps, maps.google.*) */
export function isGoogleMapsUrl(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  if (!/^(www\.|maps\.)?google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(host)) return false;
  return host.startsWith("maps.") || u.pathname === "/maps" || u.pathname.startsWith("/maps/");
}

/**
 * 처음부터 다른 페이지 안에 넣으라고 만든 주소인지 (구글 지도 삽입용).
 * 이런 주소는 안드로이드 앱이 대신 받아 올(FrameProxy) 필요 없이 웹뷰가 바로 연다.
 */
export function isMadeForEmbedding(url: string): boolean {
  try {
    const u = new URL(url);
    return isGoogleMapsUrl(u) && (u.pathname.startsWith("/maps/embed") || u.searchParams.get("output") === "embed");
  } catch {
    return false;
  }
}

/** 공유 버튼이 주는 짧은 지도 주소 (앱이 열어 봐야 원래 주소를 안다) */
export function isShortMapLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === "maps.app.goo.gl" || (host === "goo.gl" && u.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

/**
 * 구글 지도 주소 → 다른 페이지 안에 넣을 수 있는 지도 (API 키가 필요 없는 output=embed).
 * 보통 지도 주소는 "다른 앱 안에 띄우지 마세요"(X-Frame-Options)라 iframe에서 ERR_BLOCKED_BY_RESPONSE로 막힌다.
 * 장소(place)·검색(search)·길찾기(dir)·지도 위치(@위도,경도,확대)·?q= 주소를 알아본다. 모르는 모양이면 null.
 */
export function googleMapsEmbedUrl(u: URL): string | null {
  // 지도 "퍼가기"로 받은 삽입용 주소는 그대로
  if (u.pathname.startsWith("/maps/embed") || u.searchParams.get("output") === "embed") return u.toString();
  const params = new URLSearchParams();
  const segments = u.pathname.split("/").filter(Boolean).map(decodeSegment);
  const at = segments.map(parseAt).find((v) => v);
  const data = segments.find((seg) => seg.startsWith("data="));
  const pin = data?.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const q = u.searchParams;
  const mode = segments[1];

  if (q.get("api") === "1") {
    // 공식 지도 URL 형식: /maps/search/?api=1&query=… , /maps/dir/?api=1&origin=…&destination=… , /maps/@?api=1&center=…
    if (q.get("query")) params.set("q", q.get("query")!);
    if (q.get("origin")) params.set("saddr", q.get("origin")!);
    if (q.get("destination")) params.set("daddr", [q.get("destination")!, ...(q.get("waypoints")?.split("|") ?? [])].join(" to:"));
    if (q.get("center")) params.set("ll", q.get("center")!);
    if (q.get("zoom")) params.set("z", q.get("zoom")!);
    if (q.get("basemap") === "satellite") params.set("t", "k");
  } else if (q.get("q") || q.get("cid") || q.get("ll") || q.get("saddr") || q.get("daddr")) {
    // 예전 형식·공유 링크가 열리는 주소: maps.google.com/?q=장소&ftid=… , /maps?q=… , /maps?cid=…
    for (const key of ["q", "cid", "ll", "z", "t", "saddr", "daddr"]) {
      const v = q.get(key);
      if (v) params.set(key, v);
    }
  } else if (mode === "place" && segments[2] && !segments[2].startsWith("@")) {
    params.set("q", segments[2]);
    if (pin) params.set("ll", `${pin[1]},${pin[2]}`);
    else if (at) params.set("ll", `${at.lat},${at.lng}`);
  } else if (mode === "search" && segments[2] && !segments[2].startsWith("@")) {
    params.set("q", segments[2]);
    if (at) params.set("ll", `${at.lat},${at.lng}`);
  } else if (mode === "dir") {
    const stops = segments.slice(2).filter((seg) => !seg.startsWith("@") && !seg.startsWith("data=") && !seg.startsWith("am="));
    if (stops.length >= 2) {
      params.set("saddr", stops[0]);
      params.set("daddr", stops.slice(1).join(" to:"));
    } else if (stops.length === 1) {
      params.set("daddr", stops[0]);
    }
  } else if (pin) {
    params.set("q", `${pin[1]},${pin[2]}`);
  } else if (at) {
    params.set("ll", `${at.lat},${at.lng}`);
  }
  if (![...params.keys()].length) return null;
  if (at && !params.has("z")) params.set("z", String(at.zoom));
  // 위성 지도(!1e3) 또는 높이(…m)로 본 화면은 위성으로
  if (!params.has("t") && (data?.includes("!1e3") || at?.satellite)) params.set("t", "k");
  params.set("hl", q.get("hl") ?? "ko");
  params.set("ie", "UTF8");
  params.set("output", "embed");
  return `https://maps.google.com/maps?${params.toString()}`;
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg.replace(/\+/g, " "));
  } catch {
    return seg;
  }
}

/** "@37.57,126.97,15z" · "@37.57,126.97,1200m" (위성·3D는 높이) */
function parseAt(seg: string): { lat: string; lng: string; zoom: number; satellite: boolean } | null {
  const m = seg.match(/^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)([zm]))?/);
  if (!m) return null;
  let zoom = 15;
  if (m[4] === "z") zoom = Math.round(Number(m[3]));
  // 높이(m)를 대략의 확대 단계로
  else if (m[4] === "m") zoom = Math.round(Math.log2(35_000_000 / Math.max(1, Number(m[3]))));
  return { lat: m[1], lng: m[2], zoom: Math.min(21, Math.max(1, zoom)), satellite: m[4] === "m" };
}

/** 원래 주소의 다른 매개변수(예: 시트의 gid)는 살리고 필요한 것만 더한다 */
function withParams(base: string, from: URL, extra: Record<string, string>): string {
  const out = new URL(base);
  for (const [k, v] of from.searchParams) if (!out.searchParams.has(k)) out.searchParams.set(k, v);
  for (const [k, v] of Object.entries(extra)) out.searchParams.set(k, v);
  if (from.hash) out.hash = from.hash;
  return out.toString();
}
