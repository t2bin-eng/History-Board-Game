import { registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { isNativeApp } from "./platform";

// 안드로이드 앱: 웹 주소 페이지 사이트를 네이티브에 알려 "다른 앱 안에 띄우지 마세요" 머리글을 처리하게 하고
// (android/.../FrameProxy.java), 그 iframe이 열리지 않은 이유를 받는다.

interface WebFramesPlugin {
  setHosts(options: { hosts: string[] }): Promise<void>;
}

const WebFrames = registerPlugin<WebFramesPlugin>("WebFrames");

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

let syncedKey: string | null = null;
let pending: Promise<void> | null = null;

/**
 * 웹 주소 페이지 사이트 목록을 네이티브에 알린 뒤 true. 첫 요청이 머리글 처리 없이 나가지 않도록
 * 알리기 전에는 iframe 주소를 넣지 않는다. 브라우저(웹 버전)는 늘 true.
 */
export function useFrameHosts(urls: string[]): boolean {
  const hosts = [...new Set(urls.map(hostOf).filter((h): h is string => !!h))].sort();
  const key = hosts.join(",");
  const [ready, setReady] = useState(() => !isNativeApp || syncedKey === key);
  useEffect(() => {
    if (!isNativeApp) return;
    if (syncedKey === key) {
      setReady(true);
      return;
    }
    let alive = true;
    setReady(false);
    const run = () =>
      WebFrames.setHosts({ hosts })
        .catch(() => undefined)
        .then(() => {
          syncedKey = key;
        });
    pending = (pending ?? Promise.resolve()).then(run);
    // 플러그인이 없는 옛 앱이어도 화면은 열리게 한다
    const fallback = setTimeout(() => alive && setReady(true), 1500);
    pending.then(() => alive && setReady(true));
    return () => {
      alive = false;
      clearTimeout(fallback);
    };
    // hosts는 key로 대신 비교한다
  }, [key]);
  return ready;
}

export interface FrameError {
  url: string;
  code: number;
  description: string;
}

/** 네이티브가 알려 준 iframe 오류 (연결 실패, 404 등) */
export function onFrameError(fn: (e: FrameError) => void): () => void {
  const handler = (e: Event) => {
    const d = e as unknown as Partial<FrameError>;
    fn({ url: String(d.url ?? ""), code: Number(d.code ?? 0), description: String(d.description ?? "") });
  };
  window.addEventListener("lessondeckframeerror", handler);
  return () => window.removeEventListener("lessondeckframeerror", handler);
}

/** 오류 번호 → 선생님이 알아볼 말 */
export function frameErrorMessage(e: FrameError): string {
  const c = e.code;
  // 안드로이드 웹뷰 오류 번호 (WebViewClient.ERROR_*)
  if (c === -2) return "사이트 주소를 찾지 못했습니다. 인터넷 연결이나 주소를 확인해 주세요.";
  if (c === -6 || c === -8) return "사이트가 응답하지 않습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
  if (c === -11) return "보안 연결(https)에 실패했습니다. 학교 인터넷이 이 사이트를 막고 있을 수 있습니다.";
  if (c === 401) return "로그인이 필요한 페이지입니다. 브라우저에서 열어 로그인해 주세요.";
  if (c === 403) return "접근이 막힌 페이지입니다(403). 공유 설정이나 학교 인터넷 차단을 확인해 주세요.";
  if (c === 404) return "페이지를 찾을 수 없습니다(404). 주소가 바뀌었는지 확인해 주세요.";
  if (c >= 500) return `사이트에 문제가 있습니다(${c}). 잠시 뒤 다시 시도해 주세요.`;
  if (c < 0) return `페이지를 불러오지 못했습니다 (${e.description || c}).`;
  return `페이지를 불러오지 못했습니다 (${c}).`;
}
