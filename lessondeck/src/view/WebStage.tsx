import { ExternalLink, Globe, TriangleAlert, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { htmlAsset, VIRTUAL_SCREEN, type Asset, type WebPage } from "../doc/types";
import { youtubeEmbedUrl, youtubeErrorMessage, youtubeWatchUrl } from "../doc/youtube";
import type { PageSize } from "../ink/geometry";

interface Props {
  /** 열어 둔 웹 페이지들 (처음 연 순서). 넘겼다 돌아와도 웹앱 상태가 유지된다. */
  pages: WebPage[];
  currentId: string;
  assets: Record<string, Asset>;
  size: PageSize;
}

// 사용자 HTML은 앱 데이터에 접근하지 못하게 출처 없이(sandbox, allow-same-origin 금지) 실행한다 (SPEC R5)
const HTML_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";
// URL 페이지는 그 사이트 자신의 출처로 열어 localStorage 등이 동작하게 한다 (SPEC R6)
const URL_SANDBOX = `${HTML_SANDBOX} allow-same-origin`;
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
export function WebStage({ pages, currentId, assets, size }: Props) {
  const online = useOnline();
  const current = pages.find((p) => p.id === currentId);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [ytErrors, setYtErrors] = useState<Record<string, number>>({});

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
      if (page.kind === "youtube" && page.id !== currentId) {
        postToYouTube(frames.current.get(page.id), page.id, { event: "command", func: "pauseVideo", args: [] });
      }
    }
  }, [currentId, pages]);

  const setFrame = (id: string) => (el: HTMLIFrameElement | null) => {
    if (el) frames.current.set(id, el);
    else frames.current.delete(id);
  };

  return (
    <div className="web-stage">
      {pages.map((page) => {
        const screen = VIRTUAL_SCREEN[page.aspect];
        const style = { width: screen.width, height: screen.height, transform: `scale(${size.width / screen.width})` };
        const visible = page.id === currentId;
        return (
          <div key={page.id} className="web-frame" style={{ display: visible ? "block" : "none" }}>
            {page.kind === "html" && (
              <iframe
                title={htmlAsset(assets, page.asset)?.name ?? "HTML 페이지"}
                srcDoc={htmlAsset(assets, page.asset)?.html ?? "<p>원본 HTML을 찾을 수 없습니다</p>"}
                sandbox={HTML_SANDBOX}
                allow="fullscreen; autoplay; clipboard-write"
                style={style}
              />
            )}
            {page.kind === "url" && (
              <iframe
                title={page.url}
                src={page.url}
                sandbox={urlSandbox(page.url)}
                allow="fullscreen; autoplay; clipboard-write"
                referrerPolicy="no-referrer"
                style={style}
              />
            )}
            {page.kind === "youtube" && (
              <>
                {/* 유튜브는 출처 정보(Referer)가 없으면 재생을 막으므로(오류 153) referrerPolicy를 명시한다 */}
                <iframe
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
        <div className={`web-badge${online ? "" : " warn"}`} title={current.url}>
          {online ? <Globe size={13} /> : <WifiOff size={13} />}
          {online ? "인터넷 필요" : "오프라인 · 인터넷 연결 후 다시 열어 주세요"}
        </div>
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
