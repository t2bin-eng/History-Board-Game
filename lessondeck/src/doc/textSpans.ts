import type { TextSpan } from "./types";

// 글자 일부 색 (v0.48, SPEC 5장 "글자 일부 색"): 상자 글(text)의 구간마다 다른 글자색.
// 구간은 앞에서부터 차례로·겹치지 않게·붙은 같은 색은 하나로·상자 글자색과 같은 색은 빼고 둔다.

const HEX = /^#[0-9a-f]{6}$/;

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * 구간 다듬기: 잘못된 값은 버리고, 글 길이(len) 밖은 잘라 내고, 겹치면 뒤 구간이 이긴다.
 * 상자 글자색(base)과 같은 색은 빼고, 붙은 같은 색은 합친다. 남는 것이 없으면 undefined
 */
export function normalizeSpans(spans: readonly TextSpan[] | undefined, len: number, base: string): TextSpan[] | undefined {
  if (!spans?.length) return undefined;
  // 글자마다 색을 칠해 보는 대신 경계로: 뒤 구간이 앞 구간을 덮는다
  let out: TextSpan[] = [];
  for (const sp of spans) {
    if (!sp || typeof sp.start !== "number" || typeof sp.end !== "number" || typeof sp.color !== "string") continue;
    const color = sp.color.toLowerCase();
    if (!HEX.test(color)) continue;
    const a = Math.max(0, Math.min(len, Math.floor(sp.start)));
    const b = Math.max(0, Math.min(len, Math.floor(sp.end)));
    if (!(a < b)) continue;
    out = cover(out, a, b, color);
  }
  const merged: TextSpan[] = [];
  for (const sp of out.sort((x, y) => x.start - y.start)) {
    if (same(sp.color, base)) continue;
    const last = merged[merged.length - 1];
    if (last && last.end === sp.start && same(last.color, sp.color)) last.end = sp.end;
    else merged.push({ ...sp });
  }
  return merged.length ? merged : undefined;
}

/** [a, b)를 color로 덮는다 (겹친 구간은 잘라 냄) */
function cover(spans: TextSpan[], a: number, b: number, color: string): TextSpan[] {
  const out: TextSpan[] = [];
  for (const sp of spans) {
    if (sp.end <= a || sp.start >= b) {
      out.push(sp);
      continue;
    }
    if (sp.start < a) out.push({ ...sp, end: a });
    if (sp.end > b) out.push({ ...sp, start: b });
  }
  out.push({ start: a, end: b, color });
  return out;
}

/** 상자에서 그릴 구간 (글 길이·상자 글자색에 맞춰 다듬은 것) */
export function spansOf(box: { text: string; color: string; spans?: TextSpan[] }): TextSpan[] {
  return normalizeSpans(box.spans, box.text.length, box.color) ?? [];
}

/** [start, end) 글자를 color로 칠한다 (상자 글자색과 같으면 그 구간은 상자 글자색으로 돌아감) */
export function paintSpans(spans: readonly TextSpan[] | undefined, start: number, end: number, color: string, base: string, len: number): TextSpan[] | undefined {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.min(len, Math.max(start, end));
  const now = normalizeSpans(spans, len, base) ?? [];
  if (!(a < b)) return now.length ? now : undefined;
  return normalizeSpans(cover(now, a, b, color.toLowerCase()), len, base);
}

/**
 * 글을 고친 뒤 구간 옮기기. 바뀌기 전·뒤 글의 같은 앞부분·뒷부분으로 고친 자리를 찾는다.
 * caret(고친 뒤 커서 자리)을 주면, 같은 글자가 이어져 자리가 애매한 글 넣기를 커서 앞에서 일어난 것으로 본다.
 * 구간 안이나 바로 뒤에 넣은 글자는 그 색을 잇고, 바로 앞에 넣은 글자는 잇지 않는다.
 */
export function editSpans(before: string, after: string, spans: readonly TextSpan[] | undefined, caret?: number): TextSpan[] | undefined {
  if (!spans?.length || before === after) return spans?.length ? [...spans] : undefined;
  const n0 = before.length;
  const n1 = after.length;
  const min = Math.min(n0, n1);
  let pMax = 0;
  while (pMax < min && before.charCodeAt(pMax) === after.charCodeAt(pMax)) pMax++;
  let sMax = 0;
  while (sMax < min && before.charCodeAt(n0 - 1 - sMax) === after.charCodeAt(n1 - 1 - sMax)) sMax++;
  let p = pMax;
  let s = Math.min(sMax, min - p);
  const delta = n1 - n0;
  // 글만 넣었고 넣은 자리가 애매하면 (예: "aa" → "aaa") 커서 앞에서
  if (caret != null && delta > 0) {
    const lo = Math.max(0, n0 - sMax);
    const want = caret - delta;
    if (lo <= pMax && want >= lo && want <= pMax) {
      p = want;
      s = n0 - p;
    }
  }
  const cut = n0 - s; // 바뀌기 전 글에서 지워진(바뀐) 끝
  const ins = n1 - s - p; // 새로 넣은 글자 수
  const moved: TextSpan[] = [];
  for (const sp of spans) {
    const a = sp.start < p ? sp.start : sp.start < cut ? p + ins : sp.start + delta;
    const b = sp.end < p ? sp.end : sp.end <= cut ? p + ins : sp.end + delta;
    if (a < b) moved.push({ ...sp, start: a, end: b });
  }
  return moved.length ? moved : undefined;
}

/** [start, end) 글자가 모두 한 색이면 그 색 (상자 글자색 포함), 섞여 있으면 null */
export function colorOfRange(spans: readonly TextSpan[], start: number, end: number, base: string): string | null {
  let color: string | null = null;
  let at = start;
  for (const sp of spans) {
    if (sp.end <= at) continue;
    if (sp.start >= end) break;
    if (sp.start > at) {
      if (color && !same(color, base)) return null;
      color = base;
    }
    if (color && !same(color, sp.color)) return null;
    color = sp.color;
    at = sp.end;
    if (at >= end) return color;
  }
  if (at < end) {
    if (color && !same(color, base)) return null;
    color = base;
  }
  return color ?? base;
}

/** 글 조각: color가 없으면 상자 글자색 */
export interface TextSeg {
  text: string;
  color?: string;
}

/** text의 [from, to) 를 색 구간대로 조각낸다 */
export function segmentsOf(text: string, from: number, to: number, spans: readonly TextSpan[]): TextSeg[] {
  const out: TextSeg[] = [];
  let at = from;
  for (const sp of spans) {
    if (at >= to || sp.start >= to) break;
    if (sp.end <= at) continue;
    if (sp.start > at) out.push({ text: text.slice(at, sp.start) });
    const e = Math.min(to, sp.end);
    out.push({ text: text.slice(Math.max(at, sp.start), e), color: sp.color });
    at = e;
  }
  if (at < to) out.push({ text: text.slice(at, to) });
  return out;
}

/**
 * 줄마다 text 안의 시작 자리. 줄은 text에서 공백·줄바꿈만 건너뛰고 차례로 나온다 (wrapLines가 앞뒤 공백만 덜어 냄).
 * 줄이 text에서 그대로 나오지 않으면(링크의 "3P" 등) null
 */
export function lineOffsets(text: string, lines: readonly string[]): number[] | null {
  const out: number[] = [];
  let at = 0;
  for (const line of lines) {
    let i = at;
    while (!text.startsWith(line, i) && i < text.length && /\s/.test(text[i])) i++;
    if (!text.startsWith(line, i)) return null;
    out.push(i);
    at = i + line.length;
  }
  return out;
}

/** 화면·썸네일의 줄마다 색 조각 (색 구간이 없거나 줄을 맞출 수 없으면 null — 상자 글자색 하나로) */
export function lineSegments(text: string, lines: readonly string[], spans: readonly TextSpan[]): TextSeg[][] | null {
  if (!spans.length) return null;
  const offs = lineOffsets(text, lines);
  if (!offs) return null;
  return lines.map((line, i) => segmentsOf(text, offs[i], offs[i] + line.length, spans));
}
