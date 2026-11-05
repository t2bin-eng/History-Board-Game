import { useEffect, useState } from "react";
import { isShortMapLink, toEmbeddableUrl } from "../doc/embed";
import { isNativeApp } from "./platform";
import { resolveRedirect } from "./webFrames";

// 지도 앱의 "공유"가 주는 짧은 주소(maps.app.goo.gl/…)는 열어 봐야 실제 지도 주소를 안다.
// 안드로이드 앱이 한 번 열어 본 결과를 기기에 기억해 두고, 웹 주소 페이지는 실제 주소를 삽입용 지도로 바꿔 띄운다.
// 저장된 페이지 주소(page.url)는 선생님이 넣은 그대로 둔다.

const STORAGE_KEY = "lessondeck.resolvedLinks";
const MAX_SAVED = 200;

const cache = new Map<string, string>(loadSaved());
const inflight = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

function loadSaved(): [string, string][] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string");
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries([...cache].slice(-MAX_SAVED))));
  } catch {
    // 저장이 막혀 있어도 이번 실행에서는 기억한다
  }
}

/** 짧은 링크면 알아 둔 실제 주소, 아니면 그대로 */
export function resolvedUrl(url: string): string {
  return cache.get(url) ?? url;
}

/**
 * 짧은 링크의 상태: "pending" 앱이 알아보는 중 · "unresolved" 알 수 없음(브라우저, 실패) · null 짧은 링크가 아니거나 이미 앎
 */
export function shortLinkState(url: string): "pending" | "unresolved" | null {
  if (!isShortMapLink(url) || cache.has(url)) return null;
  if (isNativeApp && !failed.has(url)) return "pending";
  return "unresolved";
}

function resolve(url: string) {
  if (inflight.has(url) || cache.has(url) || failed.has(url)) return;
  inflight.add(url);
  resolveRedirect(url)
    .then((real) => {
      if (real && real !== url && !isShortMapLink(real)) {
        cache.set(url, real);
        save();
      } else {
        failed.add(url);
      }
    })
    .catch(() => failed.add(url))
    .finally(() => {
      inflight.delete(url);
      for (const fn of listeners) fn();
    });
}

/** 실패한 짧은 링크를 다시 알아본다 ("다시 시도") */
export function retryShortLink(url: string) {
  if (!failed.delete(url)) return;
  resolve(url);
  for (const fn of listeners) fn();
}

/** 웹 주소 페이지가 iframe에 실제로 띄울 주소: 짧은 링크는 실제 주소로, 지도·문서는 삽입용 주소로 */
export function pageFrameUrl(url: string): string {
  return toEmbeddableUrl(resolvedUrl(url));
}

/** 이 주소들 중 짧은 링크를 (앱이면) 알아본다. 알게 되면 다시 그리도록 바뀌는 값을 돌려준다 */
export function useShortLinks(urls: string[]): number {
  const [version, setVersion] = useState(0);
  const key = urls.filter(isShortMapLink).sort().join("\n");
  useEffect(() => {
    if (!key) return;
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    if (isNativeApp) for (const url of key.split("\n")) resolve(url);
    return () => {
      listeners.delete(bump);
    };
  }, [key]);
  return version;
}
