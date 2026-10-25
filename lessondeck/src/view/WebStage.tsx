import { Globe, TriangleAlert, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { htmlAsset, VIRTUAL_SCREEN, type Asset, type WebPage } from "../doc/types";
import type { PageSize } from "../ink/geometry";

interface Props {
  /** 열어 둔 웹 페이지들 (최근 방문 순). 넘겼다 돌아와도 웹앱 상태가 유지된다. */
  pages: WebPage[];
  currentId: string;
  assets: Record<string, Asset>;
  size: PageSize;
}

// 사용자 HTML은 앱 데이터에 접근하지 못하게 출처 없이(sandbox, allow-same-origin 금지) 실행한다 (SPEC R5)
const HTML_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";
// URL 페이지는 그 사이트 자신의 출처로 열어 localStorage 등이 동작하게 한다 (SPEC R6)
const URL_SANDBOX = `${HTML_SANDBOX} allow-same-origin`;

function urlSandbox(url: string): string {
  try {
    // 레슨덱과 같은 출처의 주소에 allow-same-origin을 주면 격리가 풀리므로 뺀다
    return new URL(url).origin === window.location.origin ? HTML_SANDBOX : URL_SANDBOX;
  } catch {
    return HTML_SANDBOX;
  }
}

// HTML·URL 페이지: 가상 화면(1280×720 등) 크기로 웹앱을 그리고 페이지 크기에 맞춰 통째로 축소·확대한다 (SPEC R8)
export function WebStage({ pages, currentId, assets, size }: Props) {
  const online = useOnline();
  const current = pages.find((p) => p.id === currentId);

  return (
    <div className="web-stage">
      {pages.map((page) => {
        const screen = VIRTUAL_SCREEN[page.aspect];
        const scale = size.width / screen.width;
        const visible = page.id === currentId;
        const asset = page.kind === "html" ? htmlAsset(assets, page.asset) : undefined;
        return (
          <div key={page.id} className="web-frame" style={{ display: visible ? "block" : "none" }}>
            {page.kind === "html" ? (
              <iframe
                title={asset?.name ?? "HTML 페이지"}
                srcDoc={asset?.html ?? "<p>원본 HTML을 찾을 수 없습니다</p>"}
                sandbox={HTML_SANDBOX}
                allow="fullscreen; autoplay; clipboard-write"
                style={{ width: screen.width, height: screen.height, transform: `scale(${scale})` }}
              />
            ) : (
              <iframe
                title={page.url}
                src={page.url}
                sandbox={urlSandbox(page.url)}
                allow="fullscreen; autoplay; clipboard-write"
                referrerPolicy="no-referrer"
                style={{ width: screen.width, height: screen.height, transform: `scale(${scale})` }}
              />
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
