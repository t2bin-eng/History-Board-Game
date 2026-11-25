import { useSyncExternalStore } from "react";

// 테마 (v0.49, SPEC 5장 `lessondeck.theme` · 6장 "테마"): 기기마다 고르는 화면 꾸밈 — 색(styles.css의 :root 토큰)·그림·아이콘.
// 문서 데이터와는 상관없다(고른 표지 그림은 테마와 상관없이 그 그림).

export type ThemeId = "apricot" | "water-lily";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  desc: string;
  /** 고르기 창의 색 칩 (바탕 · 윤곽 · 포인트 · 그 밖의 색) */
  swatches: string[];
  /** 고르기 창의 그림 (그 테마의 표지 그림) */
  preview: string;
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: "apricot",
    name: "살구빛 공책",
    desc: "크림 종이에 먹색 윤곽, 살구 주황 포인트",
    swatches: ["#faf8f5", "#28231f", "#f18349", "#fce6d7", "#9c3d15"],
    preview: "covers/apricot-sunrise",
  },
  {
    id: "water-lily",
    name: "수련 정원",
    desc: "모네의 연못과 정원 — 이끼·물빛·수련 분홍",
    swatches: ["#f6f5ea", "#253d36", "#487268", "#557982", "#a26470", "#d9d8ea", "#ddbe7b"],
    preview: "covers/water-lilies",
  },
];

export const DEFAULT_THEME: ThemeId = "apricot";
const KEY = "lessondeck.theme";

function isTheme(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

function load(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

let current: ThemeId = typeof localStorage === "undefined" ? DEFAULT_THEME : load();
const listeners = new Set<() => void>();

export function getTheme(): ThemeId {
  return current;
}

export function themeInfo(id: ThemeId = current): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** 브라우저 주소 막대·작업 전환 화면 색 (앱 바탕) */
const META_COLORS: Record<ThemeId, string> = { apricot: "#faf8f5", "water-lily": "#f6f5ea" };

/** 화면에 반영: <html data-theme="…"> (CSS 토큰이 이 값으로 바뀐다) */
export function applyTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = current;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META_COLORS[current]);
}

/** 캔버스에 그릴 테마 색 (CSS 토큰 값, 예: cssToken("--accent-text") → "#9c3d15") */
export function cssToken(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function setTheme(id: ThemeId): void {
  if (!isTheme(id) || id === current) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // 저장할 수 없으면 이번에만
  }
  applyTheme();
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 지금 테마 (바뀌면 다시 그림) */
export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
