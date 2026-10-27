import { useEffect, useSyncExternalStore } from "react";
import { getMeta, setMeta } from "../store/db";
import { snapshotRegion } from "./webFrames";

// 웹 주소 페이지의 페이지 바 미리보기 그림.
// 다른 사이트 화면은 브라우저가 그림으로 꺼내 주지 않으므로, 안드로이드 앱이 화면에 보인 그대로 찍어 둔다.
// 기기마다 따로 둔다 (문서 데이터에 넣지 않아 동기화가 늘지 않음). 웹 버전은 사이트 아이콘으로 대신한다.

const cache = new Map<string, string | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const keyOf = (docId: string, pageId: string) => `preview:${docId}:${pageId}`;
const notify = () => {
  for (const fn of listeners) fn();
};

export function usePreview(docId: string, pageId: string): string | null {
  const key = keyOf(docId, pageId);
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => cache.get(key) ?? null,
  );
  useEffect(() => {
    if (cache.has(key) || loading.has(key)) return;
    loading.add(key);
    getMeta<string>(key)
      .then((v) => {
        cache.set(key, v ?? null);
        notify();
      })
      .catch(() => cache.set(key, null))
      .finally(() => loading.delete(key));
  }, [key]);
  return value;
}

/** 이번 실행에서 이미 찍은 것 (문서·페이지·새로고침 횟수) */
const captured = new Set<string>();

/**
 * 지금 보이는 웹 주소 페이지를 찍어 미리보기로 저장한다. 찍는 순간에만 필기·펜 바·넘기기 바 등
 * 위에 떠 있는 것을 잠깐 감춘다. 확대 중이거나 메뉴·창이 열려 있으면 다음 기회로 미룬다.
 */
export async function captureFramePreview(docId: string, pageId: string, token: string): Promise<boolean> {
  const id = `${docId}:${pageId}:${token}`;
  if (captured.has(id) || document.visibilityState !== "visible") return false;
  const frame = document.querySelector<HTMLElement>(`.page .web-frame[data-page-id="${CSS.escape(pageId)}"]`);
  const page = frame?.closest<HTMLElement>(".page");
  if (!frame || !page || frame.style.display === "none") return false;
  if (page.style.transform) return false;
  if (document.querySelector(".ctx-backdrop, .modal-backdrop, .add-menu")) return false;
  const r = frame.getBoundingClientRect();
  if (r.width < 60 || r.height < 40 || r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) return false;
  captured.add(id);
  const root = document.documentElement;
  root.classList.add("snapshotting");
  try {
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 40))));
    const url = await snapshotRegion({ x: r.left, y: r.top, width: r.width, height: r.height });
    if (!url) return false;
    const key = keyOf(docId, pageId);
    cache.set(key, url);
    notify();
    await setMeta(key, url).catch(() => {});
    return true;
  } finally {
    root.classList.remove("snapshotting");
  }
}
