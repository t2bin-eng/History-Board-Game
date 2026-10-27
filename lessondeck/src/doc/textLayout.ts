import type { TextBox } from "./types";

// 텍스트 상자 글 배치 (SPEC 5장): 줄바꿈과 상자 크기에 맞춘 글자 크기.
// 화면(BoxLayer)과 썸네일(boxPaint)이 같은 결과를 쓰도록 줄을 직접 나눈다.
// 단위는 "페이지 가로 = 1000" (글자 크기 size와 같은 단위).

/** 글 너비 재기: (글, 글자 크기) → 너비 (같은 단위) */
export type Measure = (text: string, size: number) => number;

export const LINE_HEIGHT = 1.3;
const MIN_FIT = 4;
const MAX_FIT = 400;

/** 상자 안쪽 여백·아이콘 자리 (글자 크기 대비 em). 링크는 버튼처럼 보이게 테두리 안에 아이콘과 글 */
export interface BoxChrome {
  padX: number;
  padY: number;
  icon: number;
}

export function boxChrome(box: Pick<TextBox, "link" | "role">): BoxChrome {
  if (box.role === "back") return { padX: 0.45, padY: 0.12, icon: 0 };
  if (box.link) return { padX: 0.4, padY: 0.12, icon: 1.15 };
  return { padX: 0, padY: 0, icon: 0 };
}

/** 띄어쓰기 단위로 줄을 나눈다. 한 단어가 줄보다 길면 글자 단위로. 줄바꿈 문자는 그대로 */
export function wrapLines(text: string, maxWidth: number, size: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const start = lines.length;
    let line = "";
    for (const tok of para.match(/\s+|\S+/g) ?? []) {
      if (/^\s/.test(tok)) {
        // 줄 첫머리 공백은 문단 맨 앞(들여쓰기)만 살린다
        if (line || lines.length === start) line += tok;
        continue;
      }
      if (measure(line + tok, size) <= maxWidth) {
        line += tok;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = "";
      if (measure(tok, size) <= maxWidth) {
        line = tok;
        continue;
      }
      for (const ch of tok) {
        if (line && measure(line + ch, size) > maxWidth) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** 상자(가로·세로) 안에 글이 다 들어가는 가장 큰 글자 크기 */
export function fitSize(text: string, width: number, height: number, chrome: BoxChrome, measure: Measure): number {
  const fits = (s: number) => {
    const inner = width - s * (chrome.padX * 2 + chrome.icon);
    if (inner <= 0) return false;
    const lines = wrapLines(text, inner, s, measure);
    return lines.length * s * LINE_HEIGHT + s * chrome.padY * 2 <= height + 1e-6 && lines.every((l) => measure(l, s) <= inner + 1e-6);
  };
  let lo = MIN_FIT;
  let hi = MAX_FIT;
  if (!fits(lo)) return lo;
  if (fits(hi)) return hi;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 4) / 4;
}

export interface BoxLayout {
  size: number;
  lines: string[];
  chrome: BoxChrome;
  /** 상자 크기가 정해져 있어 글자 크기를 맞춘 상자 */
  fitted: boolean;
}

/**
 * 상자 하나의 배치. label은 화면에 보일 글(비어 있는 링크는 "3쪽으로 가기 →" 등),
 * heightRatio는 페이지 세로/가로.
 */
export function layoutBox(box: TextBox, label: string, heightRatio: number, measure: Measure): BoxLayout {
  const chrome = boxChrome(box);
  const text = label || " ";
  if (box.w != null && box.h != null) {
    // 화면 글자 그리기와 잰 값 사이의 작은 차이로 넘치지 않게 조금 여유를 둔다
    const width = box.w * 1000 * 0.97;
    const height = box.h * 1000 * heightRatio * 0.97;
    const size = fitSize(text, width, height, chrome, measure);
    return { size, lines: wrapLines(text, width - size * (chrome.padX * 2 + chrome.icon), size, measure), chrome, fitted: true };
  }
  const size = box.size;
  const maxWidth = Math.max(size * 4, (1 - box.x) * 1000 - 4) - size * (chrome.padX * 2 + chrome.icon);
  return { size, lines: wrapLines(text, maxWidth, size, measure), chrome, fitted: false };
}
