// 유튜브 링크 → 페이지 안에서 바로 재생하는 삽입 주소
// 유튜브 시청 페이지(watch)는 다른 앱 안에 띄울 수 없어서 embed 주소로 바꿔야 한다.

export interface YouTubeRef {
  videoId?: string;
  list?: string;
  /** 시작 시각(초) */
  start?: number;
}

const ID = /^[\w-]{11}$/;
const HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

/** "90", "90s", "1m30s", "1h2m3s" → 초 */
export function parseTime(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t) || undefined;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return undefined;
  const sec = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return sec || undefined;
}

/** 유튜브 링크면 영상 정보를, 아니면 null */
export function parseYouTube(input: string): YouTubeRef | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z\d+.-]*:/i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (!HOSTS.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const list = url.searchParams.get("list") ?? undefined;
  const start = parseTime(url.searchParams.get("t") ?? url.searchParams.get("start"));

  let videoId: string | undefined;
  if (/youtu\.be$/i.test(url.hostname)) {
    videoId = parts[0];
  } else if (parts[0] === "watch") {
    videoId = url.searchParams.get("v") ?? undefined;
  } else if (["shorts", "live", "embed", "v"].includes(parts[0])) {
    videoId = parts[1] === "videoseries" ? undefined : parts[1];
  } else if (parts[0] !== "playlist") {
    return null;
  }

  if (videoId && !ID.test(videoId)) return null;
  if (!videoId && !list) return null;
  return { videoId, list, start };
}

/** 페이지 안 재생용 주소. enablejsapi로 일시정지·오류 알림을 주고받는다 */
export function youtubeEmbedUrl(ref: YouTubeRef, origin: string): string {
  const path = ref.videoId ?? "videoseries";
  const q = new URLSearchParams({ rel: "0", playsinline: "1", enablejsapi: "1", origin });
  if (ref.list) q.set("list", ref.list);
  if (ref.start) q.set("start", String(ref.start));
  return `https://www.youtube-nocookie.com/embed/${path}?${q}`;
}

/** 유튜브 앱·사이트에서 열기 */
export function youtubeWatchUrl(ref: YouTubeRef): string {
  if (!ref.videoId) return `https://www.youtube.com/playlist?list=${ref.list}`;
  const q = new URLSearchParams({ v: ref.videoId });
  if (ref.list) q.set("list", ref.list);
  if (ref.start) q.set("t", `${ref.start}s`);
  return `https://www.youtube.com/watch?${q}`;
}

/** 페이지 바 썸네일 (인터넷 필요) */
export function youtubeThumbUrl(ref: YouTubeRef): string | null {
  return ref.videoId ? `https://i.ytimg.com/vi/${ref.videoId}/mqdefault.jpg` : null;
}

/** 플레이어 오류 코드 → 안내 문구 (YouTube IFrame API onError) */
export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 101:
    case 150:
      return "영상 주인이 다른 앱 안에서 재생하지 못하게 막아 둔 영상입니다.";
    case 100:
      return "삭제되었거나 비공개인 영상입니다.";
    case 153:
      return "유튜브가 이 앱의 출처 정보를 받지 못해 재생을 막았습니다.";
    default:
      return `영상을 재생할 수 없습니다 (오류 ${code}).`;
  }
}
