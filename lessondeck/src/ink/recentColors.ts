import type { InkTool } from "./types";

// 최근 색 (v0.42, SPEC 5장 `lessondeck.recentColors`·6장 "색 고르기"): 펜·형광펜마다 고른 색을 가장 최근 것부터 10개까지 기기에 기억

export const RECENT_COLORS_KEY = "lessondeck.recentColors";
export const RECENT_MAX = 10;

export type RecentColors = Record<InkTool, string[]>;

const HEX6 = /^#[0-9a-f]{6}$/;

/** "#abc"·"abc"·"#AABBCC"·"aabbcc" → "#aabbcc". 아니면 null */
export function normalizeHex(input: string): string | null {
  const t = input.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  return null;
}

function clean(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const c of list) {
    if (typeof c !== "string" || !HEX6.test(c) || out.includes(c)) continue;
    out.push(c);
    if (out.length >= RECENT_MAX) break;
  }
  return out;
}

export function loadRecentColors(): RecentColors {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? "null");
    return { pen: clean(raw?.pen), highlighter: clean(raw?.highlighter) };
  } catch {
    return { pen: [], highlighter: [] };
  }
}

export function saveRecentColors(recent: RecentColors) {
  try {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent));
  } catch {
    // 저장하지 못해도 이번에는 쓴다
  }
}

/** 색 하나를 맨 앞에 (이미 있으면 앞으로 옮김). 바뀌지 않으면 같은 객체 */
export function pushRecentColor(recent: RecentColors, tool: InkTool, color: string): RecentColors {
  const c = normalizeHex(color);
  if (!c || recent[tool][0] === c) return recent;
  return { ...recent, [tool]: [c, ...recent[tool].filter((x) => x !== c)].slice(0, RECENT_MAX) };
}
