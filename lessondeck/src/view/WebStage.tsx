import { ExternalLink, RotateCw, TriangleAlert, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toEmbeddableUrl } from "../doc/embed";
import { htmlAsset, mediaAsset, VIRTUAL_SCREEN, type Asset, type InteractivePage } from "../doc/types";
import { youtubeEmbedUrl, youtubeErrorMessage, youtubeWatchUrl } from "../doc/youtube";
import type { PageSize } from "../ink/geometry";
import { frameErrorMessage, onFrameError, useFrameHosts } from "../lib/webFrames";

interface Props {
  /** 열어 둔 웹앱·동영상 페이지들 (처음 연 순서). 넘겼다 돌아와도 상태가 유지된다. */
  pages: InteractivePage[];
  currentId: string;
  assets: Record<string, Asset>;
  size: PageSize;
  /** 페이지별 새로고침 횟수. 바뀌면 그 페이지의 웹앱을 처음부터 다시 불러온다 */
  reloads?: Record<string, number>;
  /** 이 문서의 웹 주소 페이지 주소들 (안드로이드 앱이 미리 알아 두고 띄우기 거부 머리글을 처리한다) */
  frameUrls?: string[];
}

/** 이만큼 지나면 덮개를 위쪽 띠로 줄여, 일부만 그려진 사이트도 보이게 한다 */
const BANNER_MS = 4_000;
/** 이만큼 지나도 다 안 열리면 "오래 걸린다"고 알리고 다시 시도·브라우저로 열기를 보여 준다 */
const SLOW_MS = 15_000;

// 사용자 HTML은 앱 데이터에 접근하지 못하게 출처 없이(sandbox, allow-same-origin 금지) 실행한다 (SPEC R5)
const HTML_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";
// URL 페이지는 그 사이트 자신의 출처로 열어 localStorage 등이 동작하게 한다 (SPEC R6).
// 로그인 창·내려받기·발표 화면 등이 막혀 멈추지 않게 몇 가지를 더 허용한다 (앱 화면을 바꾸는 top 이동은 계속 막음)
const URL_SANDBOX = `${HTML_SANDBOX} allow-same-origin allow-popups-to-escape-sandbox allow-downloads allow-presentation allow-storage-access-by-user-activation`;
const URL_ALLOW = "fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; web-share";
const YOUTUBE_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
const YOUTUBE_ORIGINS = ["https://www.youtube-nocookie.com", "https://www.youtube.com"];

function urlSandbox(url: string): string {
  try {
    // 레슨덱과 같은 출처의 주소에 allow-same-origin을 주면 격리가 풀리므로 뺀다
    return new URL(url).origin === window.location.origin ? HTML_SANDBOX : URL_SANDBOX;
  } catch {
    return HTML_SANDBOX;
  }
}

/** 유튜브 플레이어에 명령 보내기 (IFrame API의 postMessage 규약, 스크립트 없이) */
function postToYouTube(frame: HTMLIFrameElement | null | undefined, id: string, message: Record<string, unknown>) {
  frame?.contentWindow?.postMessage(JSON.stringify({ ...message, id, channel: "widget" }), "*");
}

// HTML·URL·유튜브 페이지: 가상 화면(1280×720 등) 크기로 그리고 페이지 크기에 맞춰 통째로 축소·확대한다 (SPEC R8)
export function WebStage({ pages, currentId, assets, size, reloads, frameUrls = [] }: Props) {
  const online = useOnline();
  const current = pages.find((p) => p.id === currentId);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [ytErrors, setYtErrors] = useState<Record<string, number>>({});
  const hostsReady = useFrameHosts(frameUrls);
  // 이 화면 안의 다시 시도 횟수 (불러오기 실패 안내의 "다시 시도", 인터넷이 다시 연결될 때)
  const [retries, setRetries] = useState<Record<string, number>>({});
  // 새로고침하면 iframe을 새로 만든다 (srcdoc HTML은 다시 실행, 유튜브 오류 안내도 지움)
  const reloadKey = (id: string) => `${id}:${reloads?.[id] ?? 0}:${retries[id] ?? 0}`;
  // iframe별 불러오기 상태 (reloadKey 기준). 없으면 불러오는 중
  const [loads, setLoads] = useState<Record<string, FrameLoad>>({});
  const setLoad = (key: string, load: FrameLoad | null) =>
    setLoads((m) => {
      const next = { ...m };
      if (load) next[key] = load;
      else delete next[key];
      return next;
    });
  const retry = (id: string) => setRetries((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
  const lastReloads = useRef(reloads);
  useEffect(() => {
    const prev = lastReloads.current;
    lastReloads.current = reloads;
    const changed = Object.keys(reloads ?? {}).filter((id) => reloads?.[id] !== prev?.[id]);
    if (changed.length) setYtErrors((m) => Object.fromEntries(Object.entries(m).filter(([id]) => !changed.includes(id))));
  }, [reloads]);

  // 보이는 웹 페이지가 오래 안 열리면 알린다
  const currentKey = current && current.kind !== "video" ? reloadKey(current.id) : null;
  const currentLoad = currentKey ? loads[currentKey] : undefined;
  useEffect(() => {
    if (!currentKey || (currentLoad && currentLoad.state !== "waiting")) return;
    const t1 = currentLoad ? undefined : setTimeout(() => setLoad(currentKey, { state: "waiting" }), BANNER_MS);
    const t2 = setTimeout(() => setLoad(currentKey, { state: "slow" }), currentLoad ? SLOW_MS - BANNER_MS : SLOW_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [currentKey, currentLoad]);

  // 안드로이드 앱: 네이티브가 알려 준 iframe 오류 (연결 실패, 404 등)를 그 페이지에 보여 준다
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const keyRef = useRef(reloadKey);
  keyRef.current = reloadKey;
  useEffect(
    () =>
      onFrameError((err) => {
        const host = hostOf(err.url);
        for (const p of pagesRef.current) {
          if (p.kind === "url" && host && hostOf(toEmbeddableUrl(p.url)) === host) {
            setLoad(keyRef.current(p.id), { state: "error", message: frameErrorMessage(err) });
          }
        }
      }),
    [],
  );

  // 인터넷이 다시 연결되면 열리지 못한 웹 페이지를 다시 불러온다
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) {
      for (const p of pagesRef.current) {
        if ((p.kind === "url" || p.kind === "html") && loads[keyRef.current(p.id)]?.state !== "loaded") retry(p.id);
      }
    }
    wasOnline.current = online;
  }, [online, loads]);

  // 유튜브 플레이어가 보내는 알림(오류 등)을 받는다
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!YOUTUBE_ORIGINS.includes(e.origin) || typeof e.data !== "string") return;
      let data: { event?: string; info?: unknown };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event !== "onError") return;
      for (const [id, frame] of frames.current) {
        if (frame.contentWindow === e.source) setYtErrors((m) => ({ ...m, [id]: Number(data.info) }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 다른 페이지로 넘어가면 영상을 멈춘다 (숨겨 둔 채 소리만 나지 않도록)
  useEffect(() => {
    for (const page of pages) {
      if (page.id === currentId) continue;
      if (page.kind === "youtube") {
        postToYouTube(frames.current.get(page.id), page.id, { event: "command", func: "pauseVideo", args: [] });
      } else if (page.kind === "video") {
        videos.current.get(page.id)?.pause();
      }
    }
  }, [currentId, pages]);

  const setVideo = (id: string) => (el: HTMLVideoElement | null) => {
    if (el) videos.current.set(id, el);
    else videos.current.delete(id);
  };

  const setFrame = (id: string) => (el: HTMLIFrameElement | null) => {
    if (el) frames.current.set(id, el);
    else frames.current.delete(id);
  };

  return (
    <div className="web-stage">
      {pages.map((page) => {
        const visible = page.id === currentId;
        if (page.kind === "video") {
          const asset = mediaAsset(assets, page.asset);
          return (
            <div key={page.id} className="web-frame video" style={{ display: visible ? "block" : "none" }}>
              {asset ? (
                <video
                  ref={setVideo(page.id)}
                  className="video-page"
                  src={asset.url}
                  poster={asset.poster}
                  controls
                  playsInline
                  preload="metadata"
                  controlsList="nodownload"
                />
              ) : (
                <div className="youtube-error">
                  <TriangleAlert size={28} />
                  <p>원본 동영상을 찾을 수 없습니다.</p>
                </div>
              )}
            </div>
          );
        }
        const screen = VIRTUAL_SCREEN[page.aspect];
        const style = { width: screen.width, height: screen.height, transform: `scale(${size.width / screen.width})` };
        return (
          <div key={page.id} className="web-frame" style={{ display: visible ? "block" : "none" }}>
            {page.kind === "html" && (
              <iframe
                key={reloadKey(page.id)}
                title={htmlAsset(assets, page.asset)?.name ?? "HTML 페이지"}
                srcDoc={htmlAsset(assets, page.asset)?.html ?? "<p>원본 HTML을 찾을 수 없습니다</p>"}
                sandbox={HTML_SANDBOX}
                allow="fullscreen; autoplay; clipboard-write"
                style={style}
                onLoad={() => setLoad(reloadKey(page.id), { state: "loaded" })}
              />
            )}
            {page.kind === "url" && hostsReady && (
              <iframe
                key={reloadKey(page.id)}
                title={page.url}
                src={toEmbeddableUrl(page.url)}
                sandbox={urlSandbox(page.url)}
                allow={URL_ALLOW}
                // 출처를 숨기면 삽입을 허용한 사이트 목록을 확인하는 서비스(지도·영상 등)가 하얗게 막는다
                referrerPolicy="strict-origin-when-cross-origin"
                style={style}
                onLoad={() => {
                  // 네이티브가 먼저 오류를 알렸으면(404 등) 그 안내를 남긴다
                  const key = reloadKey(page.id);
                  setLoads((m) => (m[key]?.state === "error" ? m : { ...m, [key]: { state: "loaded" } }));
                }}
              />
            )}
            {(page.kind === "url" || page.kind === "html") && visible && loads[reloadKey(page.id)]?.state !== "loaded" && (
              <FrameStatus
                load={loads[reloadKey(page.id)]}
                online={online}
                kind={page.kind}
                openUrl={page.kind === "url" ? page.url : undefined}
                onRetry={() => retry(page.id)}
                onDismiss={() => setLoad(reloadKey(page.id), { state: "loaded" })}
              />
            )}
            {page.kind === "youtube" && (
              <>
                {/* 유튜브는 출처 정보(Referer)가 없으면 재생을 막으므로(오류 153) referrerPolicy를 명시한다 */}
                <iframe
                  key={reloadKey(page.id)}
                  ref={setFrame(page.id)}
                  className="youtube"
                  title="유튜브 동영상"
                  src={youtubeEmbedUrl(page, window.location.origin)}
                  allow={YOUTUBE_ALLOW}
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  style={style}
                  onLoad={(e) => postToYouTube(e.currentTarget, page.id, { event: "listening" })}
                />
                {ytErrors[page.id] != null && (
                  <div className="youtube-error">
                    <TriangleAlert size={28} />
                    <p>{youtubeErrorMessage(ytErrors[page.id])}</p>
                    <a href={youtubeWatchUrl(page)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={16} /> YouTube에서 열기
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {current?.kind === "url" && (
        // 사이트가 앱 안에서 제대로 안 보이면 언제든 브라우저로 열 수 있게
        <a className={`web-badge link${online ? "" : " warn"}`} href={current.url} target="_blank" rel="noopener noreferrer" title={current.url}>
          {online ? <ExternalLink size={13} /> : <WifiOff size={13} />}
          {online ? "브라우저에서 열기" : "오프라인 · 인터넷 연결 후 다시 열어 주세요"}
        </a>
      )}
      {current?.kind === "youtube" && (
        <a className={`web-badge link${online ? "" : " warn"}`} href={youtubeWatchUrl(current)} target="_blank" rel="noopener noreferrer">
          {online ? <ExternalLink size={13} /> : <WifiOff size={13} />}
          {online ? "YouTube에서 열기" : "오프라인 · 인터넷 연결 후 재생"}
        </a>
      )}
      {current?.kind === "html" && (htmlAsset(assets, current.asset)?.warnings.length ?? 0) > 0 && (
        <div className="web-badge warn" title={htmlAsset(assets, current.asset)!.warnings.join("\n")}>
          <TriangleAlert size={13} />
          {online ? "확인할 점 있음" : "오프라인 · 일부가 동작하지 않을 수 있음"}
        </div>
      )}
    </div>
  );
}

type FrameLoad = { state: "loaded" } | { state: "waiting" } | { state: "slow" } | { state: "error"; message: string };

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 웹 페이지를 불러오는 동안·실패했을 때 iframe 위에 보이는 안내 (하얀 화면만 남지 않게) */
function FrameStatus({
  load,
  online,
  kind,
  openUrl,
  onRetry,
  onDismiss,
}: {
  load?: FrameLoad;
  online: boolean;
  kind: "url" | "html";
  openUrl?: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const offline = !online && load?.state !== "error";
  const problem = offline || load?.state === "slow" || load?.state === "error";
  // 몇 초 지나면 사이트가 일부라도 그려졌을 수 있으므로 덮지 않고 위쪽 띠로
  const banner = !offline && (load?.state === "waiting" || load?.state === "slow");
  return (
    <div className={`frame-status${problem ? " problem" : ""}${banner ? " banner" : ""}`} data-no-gesture={problem || undefined}>
      {offline ? (
        <>
          <WifiOff size={30} />
          <p>인터넷에 연결되어 있지 않습니다.</p>
          <small>연결되면 저절로 다시 불러옵니다.</small>
        </>
      ) : load?.state === "error" ? (
        <>
          <TriangleAlert size={30} />
          <p>{load.message}</p>
        </>
      ) : (
        <>
          <span className="spinner" aria-hidden="true" />
          <p>불러오는 중…</p>
          {load?.state === "slow" && (
            <small>
              {kind === "url"
                ? "오래 걸리고 있습니다. 인터넷이 느리거나, 사이트가 응답하지 않거나, 학교 인터넷이 막고 있을 수 있습니다."
                : "인터넷에서 받아 오는 파일(라이브러리·글꼴 등)이 늦어지고 있습니다."}
            </small>
          )}
        </>
      )}
      {problem && (
        <div className="frame-actions">
          <button onClick={onRetry}>
            <RotateCw size={16} /> 다시 시도
          </button>
          {openUrl && (
            <a href={openUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> 브라우저에서 열기
            </a>
          )}
          <button onClick={onDismiss}>
            <X size={16} /> 그래도 보기
          </button>
        </div>
      )}
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
