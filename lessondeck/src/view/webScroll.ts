import { useEffect, useState } from "react";

// HTML 페이지 웹앱의 스크롤 위치 (v0.36, SPEC 5장 "HTML 페이지 필기는 웹앱 문서에 붙는다").
// 액자 안 안내 스크립트(htmlFrame.ts)가 스크롤될 때마다 postMessage로 알려 준다. 페이지별로 기억한다(저장하지 않음).

/** 액자 크기 대비 비율 (x: 가로, y: 세로) */
export interface WebScroll {
  x: number;
  y: number;
}

export const NO_SCROLL: WebScroll = { x: 0, y: 0 };

/** 안내 스크립트가 보낸 메시지 → 비율 (아니면 null) */
export function parseScrollMessage(data: unknown): WebScroll | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { lessondeck?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown };
  if (d.lessondeck !== "scroll") return null;
  const nums = [d.x, d.y, d.w, d.h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x, y, w, h] = nums as number[];
  if (w <= 0 || h <= 0) return null;
  return { x: Math.max(0, x) / w, y: Math.max(0, y) / h };
}

const scrolls = new Map<string, WebScroll>();
const listeners = new Set<(pageId: string) => void>();

/** 메시지를 보낸 액자가 어느 페이지 것인지 */
function pageIdOf(source: MessageEventSource | null): string | null {
  if (!source) return null;
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(".web-frame[data-page-id] iframe")) {
    if (frame.contentWindow === source) return frame.closest<HTMLElement>(".web-frame")?.dataset.pageId ?? null;
  }
  return null;
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (e) => {
    const scroll = parseScrollMessage(e.data);
    if (!scroll) return;
    const pageId = pageIdOf(e.source);
    if (!pageId) return;
    const prev = scrolls.get(pageId);
    if (prev && prev.x === scroll.x && prev.y === scroll.y) return;
    scrolls.set(pageId, scroll);
    for (const fn of listeners) fn(pageId);
  });
}

export function webScrollOf(pageId: string | null): WebScroll {
  return (pageId && scrolls.get(pageId)) || NO_SCROLL;
}

/** 이 페이지(HTML)의 지금 스크롤. null이면 늘 0 */
export function useWebScroll(pageId: string | null): WebScroll {
  const [scroll, setScroll] = useState(() => webScrollOf(pageId));
  useEffect(() => {
    setScroll(webScrollOf(pageId));
    if (!pageId) return;
    const fn = (id: string) => {
      if (id === pageId) setScroll(webScrollOf(pageId));
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [pageId]);
  return scroll;
}
