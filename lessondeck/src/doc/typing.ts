// 글상자 타자 효과 (v0.26, SPEC 5장 boxes "애니메이션"): 글자가 한 자씩 입력되듯 나오는 순서와 시간.
// 한글은 실제 두벌식 입력처럼 자모가 조합되며 나온다: ㅇ → 오 → 와 → 왕.
// 받침 없는 글자 뒤에 자음이 오면 잠깐 앞 글자의 받침이 됐다가(가 → 간) 모음이 오면 다음 글자로 넘어간다(가나).

/** 초성 19자 (한글 호환 자모) */
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 겹모음 → 먼저 치는 모음 (ㅘ = ㅗ + ㅏ) */
const VOWEL_FIRST: Record<number, number> = { 9: 8, 10: 8, 11: 8, 14: 13, 15: 13, 16: 13, 19: 18 };

/** 겹받침 → 먼저 치는 받침 (ㄳ = ㄱ + ㅅ) */
const FINAL_FIRST: Record<number, number> = { 3: 1, 5: 4, 6: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 8, 18: 17 };

/** 초성 번호 → 받침 번호 (ㄸ·ㅃ·ㅉ는 받침이 될 수 없음) */
const CHO_AS_FINAL: Record<number, number> = { 0: 1, 1: 2, 2: 4, 3: 7, 5: 8, 6: 16, 7: 17, 9: 19, 10: 20, 11: 21, 12: 22, 14: 23, 15: 24, 16: 25, 17: 26, 18: 27 };

/** 받침 + 받침 → 겹받침 (받침 번호) */
const COMPOUND_FINAL: Record<string, number> = { "1,19": 3, "4,22": 5, "4,27": 6, "8,1": 9, "8,16": 10, "8,17": 11, "8,19": 12, "8,25": 13, "8,26": 14, "8,27": 15, "17,19": 18 };

const BASE = 0xac00;

interface Syllable {
  cho: number;
  jung: number;
  jong: number;
}

function split(ch: string): Syllable | null {
  const c = ch.codePointAt(0) ?? 0;
  if (ch.length !== 1 || c < BASE || c > 0xd7a3) return null;
  const s = c - BASE;
  return { cho: Math.floor(s / 588), jung: Math.floor((s % 588) / 28), jong: s % 28 };
}

function join(cho: number, jung: number, jong: number): string {
  return String.fromCharCode(BASE + cho * 588 + jung * 28 + jong);
}

/** 글자 하나를 칠 때 차례로 보이는 모양 (마지막이 그 글자). 한글 음절이 아니면 그 글자 하나 */
export function hangulStages(ch: string): string[] {
  const s = split(ch);
  if (!s) return [ch];
  const out = [CHO[s.cho]];
  if (VOWEL_FIRST[s.jung] != null) out.push(join(s.cho, VOWEL_FIRST[s.jung], 0));
  out.push(join(s.cho, s.jung, 0));
  if (s.jong) {
    if (FINAL_FIRST[s.jong] != null) out.push(join(s.cho, s.jung, FINAL_FIRST[s.jong]));
    out.push(ch);
  }
  return out;
}

/**
 * 앞 글자 prev 바로 뒤에 next를 칠 때, next의 첫 자음이 잠깐 prev의 받침으로 붙은 모양 (가 + 나 → "간").
 * 그렇게 붙지 않으면 null
 */
export function borrowFinal(prev: string, next: string): string | null {
  const p = split(prev);
  const n = split(next);
  if (!p || !n) return null;
  const fin = CHO_AS_FINAL[n.cho];
  if (fin == null) return null;
  if (!p.jong) return join(p.cho, p.jung, fin);
  const compound = COMPOUND_FINAL[`${p.jong},${fin}`];
  return compound != null ? join(p.cho, p.jung, compound) : null;
}

/** 한 장면: 앞 done 글자는 다 보이고, 그 자리부터 comp가 보인다(comp 글자 수만큼의 자리). 나머지는 아직 */
export interface TypingFrame {
  done: number;
  comp: string;
}

export interface TypingPlan {
  /** 줄마다의 글자 (코드 포인트 단위) */
  lines: string[][];
  /** 장면들 (마지막은 다 친 모양 {done: 전체, comp: ""}) */
  frames: TypingFrame[];
  /** 장면마다 시작 시각(ms) */
  times: number[];
  /** 마지막 장면이 시작하는 시각 = 다 치는 데 걸리는 시간(ms) */
  total: number;
}

/** 한 번 누름(자모·글자 하나)에 걸리는 기본 시간, 아무리 길어도 이 안에 다 친다 */
const STEP_MS = 55;
const MAX_MS = 2600;

/** 정해진 수열로 조금씩 다른 박자 (사람이 치는 것처럼, 매번 같게) */
function wobble(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return 0.75 + (x - Math.floor(x)) * 0.5;
}

/** 줄들을 타자로 칠 순서와 시간 */
export function typingPlan(lines: string[], opts: { stepMs?: number; maxMs?: number } = {}): TypingPlan {
  const chars = lines.map((l) => [...l]);
  const flat: { ch: string; line: number }[] = chars.flatMap((cs, line) => cs.map((ch) => ({ ch, line })));
  const frames: TypingFrame[] = [];
  const weights: number[] = [];
  flat.forEach(({ ch, line }, i) => {
    const stages = hangulStages(ch);
    const prev = i > 0 && flat[i - 1].line === line ? flat[i - 1].ch : "";
    const borrowed = prev ? borrowFinal(prev, ch) : null;
    // 띄어쓰기·문장부호 앞은 조금 쉰다
    const pause = /[\s,.!?·:;)\]」』]/.test(ch) ? 1.6 : 1;
    if (borrowed) {
      frames.push({ done: i - 1, comp: borrowed });
      weights.push(wobble(frames.length));
      for (const st of stages.slice(1)) {
        frames.push({ done: i, comp: st });
        weights.push(wobble(frames.length));
      }
    } else {
      stages.forEach((st, k) => {
        frames.push({ done: i, comp: st });
        weights.push(wobble(frames.length) * (k === 0 ? pause : 1));
      });
    }
  });
  frames.push({ done: flat.length, comp: "" });
  const sum = weights.reduce((a, b) => a + b, 0);
  const step = Math.min(opts.stepMs ?? STEP_MS, (opts.maxMs ?? MAX_MS) / Math.max(1, sum));
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < frames.length; i++) {
    times.push(t);
    t += (weights[i] ?? 0) * step;
  }
  return { lines: chars, frames, times, total: times[times.length - 1] };
}

/** ms 시각에 보일 장면 번호 */
export function frameAt(plan: TypingPlan, ms: number): number {
  let lo = 0;
  let hi = plan.times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (plan.times[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 한 줄의 보이는 모양: shown(다 친 것) + comp(치는 중) + 커서 + rest(아직, 자리만 차지) */
export interface TypedLine {
  shown: string;
  comp: string;
  rest: string;
  /** 커서가 이 줄에 있는지 (comp 뒤) */
  caret: boolean;
}

/** 장면 하나를 줄마다 나눠서 */
export function typedLines(plan: TypingPlan, frame: number): TypedLine[] {
  const f = plan.frames[Math.max(0, Math.min(plan.frames.length - 1, frame))];
  const comp = [...f.comp];
  const end = f.done + comp.length;
  // 커서는 마지막으로 친 자리 뒤: 치는 중이면 comp 끝, 다 쳤으면 맨 끝 줄 끝
  const caretAt = comp.length ? end : f.done;
  let start = 0;
  return plan.lines.map((cs, li) => {
    const a = start;
    const b = start + cs.length;
    start = b;
    const take = (from: number, to: number) => cs.slice(Math.max(0, from - a), Math.max(0, Math.min(cs.length, to - a))).join("");
    const compHere = comp.filter((_, k) => f.done + k >= a && f.done + k < b).join("");
    const shown = take(a, Math.min(f.done, b));
    const rest = take(Math.max(end, a), b);
    // 커서는 친 글자 바로 뒤 (줄 경계면 앞 줄 끝). 하나도 안 쳤으면 첫 줄 앞
    const caret = caretAt === 0 ? li === 0 : caretAt > a && caretAt <= b;
    return { shown, comp: compHere, rest, caret };
  });
}
