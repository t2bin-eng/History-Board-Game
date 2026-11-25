import { describe, expect, it } from "vitest";
import { colorOfRange, editSpans, lineOffsets, lineSegments, normalizeSpans, paintSpans, segmentsOf } from "./textSpans";
import { wrapLines } from "./textLayout";

const R = "#ff1e1e";
const B = "#1565c0";
const K = "#111111";

describe("글자 일부 색 (v0.48)", () => {
  it("칠하기: 겹치면 나중 색, 붙은 같은 색은 합치고, 상자 글자색과 같으면 없앰", () => {
    let s = paintSpans(undefined, 2, 5, R, K, 10);
    expect(s).toEqual([{ start: 2, end: 5, color: R }]);
    s = paintSpans(s, 4, 8, B, K, 10);
    expect(s).toEqual([
      { start: 2, end: 4, color: R },
      { start: 4, end: 8, color: B },
    ]);
    s = paintSpans(s, 0, 2, R, K, 10);
    expect(s).toEqual([
      { start: 0, end: 4, color: R },
      { start: 4, end: 8, color: B },
    ]);
    // 상자 글자색으로 칠하면 그 부분은 구간에서 빠짐
    s = paintSpans(s, 3, 6, K, K, 10);
    expect(s).toEqual([
      { start: 0, end: 3, color: R },
      { start: 6, end: 8, color: B },
    ]);
    expect(paintSpans(s, 0, 10, K, K, 10)).toBeUndefined();
    // 빈 범위는 그대로
    expect(paintSpans(s, 4, 4, R, K, 10)).toEqual(s);
  });

  it("다듬기: 잘못된 값·글 밖은 버리거나 자르고, 대문자 색도 같은 색", () => {
    const bad = [
      { start: 8, end: 30, color: "#FF1E1E" },
      { start: 5, end: 2, color: R },
      { start: 0, end: 2, color: "red" },
      { start: 2, end: 3, color: K.toUpperCase() },
    ];
    expect(normalizeSpans(bad as never, 10, K)).toEqual([{ start: 8, end: 10, color: R }]);
    expect(normalizeSpans([], 10, K)).toBeUndefined();
  });

  it("글 고치기: 뒤 구간은 밀리고, 구간 안·바로 뒤에 쓴 글자는 색을 잇고, 바로 앞은 잇지 않음", () => {
    const sp = [{ start: 3, end: 5, color: R }]; // "abcDEfg" 의 DE
    // 앞쪽에 넣기 → 밀림
    expect(editSpans("abcDEfg", "XabcDEfg", sp)).toEqual([{ start: 4, end: 6, color: R }]);
    // 바로 앞(3)에 넣기 → 잇지 않음
    expect(editSpans("abcDEfg", "abcXDEfg", sp)).toEqual([{ start: 4, end: 6, color: R }]);
    // 안에 넣기 → 늘어남
    expect(editSpans("abcDEfg", "abcDXEfg", sp)).toEqual([{ start: 3, end: 6, color: R }]);
    // 바로 뒤(5)에 넣기 → 이어서 늘어남
    expect(editSpans("abcDEfg", "abcDEXfg", sp)).toEqual([{ start: 3, end: 6, color: R }]);
    // 뒤쪽에 넣기 → 그대로
    expect(editSpans("abcDEfg", "abcDEfXg", sp)).toEqual(sp);
    // 걸쳐 지우기 → 줄어듦, 다 지우면 없어짐
    expect(editSpans("abcDEfg", "abcEfg", sp)).toEqual([{ start: 3, end: 4, color: R }]);
    expect(editSpans("abcDEfg", "abcfg", sp)).toBeUndefined();
    // 고른 글자를 바꿔 쓰기 (E → X) → 그 색
    expect(editSpans("abcDEfg", "abcDXfg", sp)).toEqual([{ start: 3, end: 5, color: R }]);
  });

  it("한글 조합: ㄱ → 가 → 각 처럼 바뀌어도 이어 쓴 색이 유지", () => {
    let sp = editSpans("조선", "조선ㄱ", [{ start: 0, end: 2, color: R }])!;
    sp = editSpans("조선ㄱ", "조선거", sp)!;
    sp = editSpans("조선거", "조선건", sp)!;
    expect(sp).toEqual([{ start: 0, end: 3, color: R }]);
    // 띄어 쓰고 앞 색과 떨어진 곳에서는 바탕 글자색
    const sp2 = editSpans("조선 ", "조선 왕", [{ start: 0, end: 2, color: R }]);
    expect(sp2).toEqual([{ start: 0, end: 2, color: R }]);
  });

  it("같은 글자가 이어진 애매한 넣기는 커서 자리로", () => {
    const sp = [{ start: 2, end: 4, color: R }]; // "aaBB" 의 BB
    // "aa" 앞쪽에 a를 넣음 (커서 1) → 구간이 밀림
    expect(editSpans("aaBB", "aaaBB", sp, 1)).toEqual([{ start: 3, end: 5, color: R }]);
    // 커서가 없으면 앞부분을 최대로 본다 (2에 넣음 = 구간 바로 앞) → 마찬가지로 밀림
    expect(editSpans("aaBB", "aaaBB", sp)).toEqual([{ start: 3, end: 5, color: R }]);
    // "BB" 뒤에 B를 넣음 (커서 5) → 늘어남
    expect(editSpans("aaBB", "aaBBB", sp, 5)).toEqual([{ start: 2, end: 5, color: R }]);
    // "BB" 가운데에 B (커서 4) → 늘어남, "BB" 바로 앞에 B (커서 3) → 잇지 않음
    expect(editSpans("aaBB", "aaBBB", sp, 4)).toEqual([{ start: 2, end: 5, color: R }]);
    expect(editSpans("aaBB", "aaBBB", sp, 3)).toEqual([{ start: 3, end: 5, color: R }]);
  });

  it("고른 범위의 색: 한 색이면 그 색, 섞이면 null", () => {
    const sp = [
      { start: 2, end: 4, color: R },
      { start: 6, end: 8, color: B },
    ];
    expect(colorOfRange(sp, 2, 4, K)).toBe(R);
    expect(colorOfRange(sp, 0, 2, K)).toBe(K);
    expect(colorOfRange(sp, 4, 6, K)).toBe(K);
    expect(colorOfRange(sp, 3, 5, K)).toBeNull();
    expect(colorOfRange(sp, 2, 8, K)).toBeNull();
    expect(colorOfRange(sp, 6, 7, K)).toBe(B);
  });

  it("줄 나누기와 맞춘 줄별 색 조각 (줄 끝 공백·줄바꿈을 건너뜀)", () => {
    const text = "고려 말 신진 사대부\n  이성계 위화도 회군";
    const measure = (t: string, size: number) => t.length * size;
    const lines = wrapLines(text, 6 * 10, 10, measure);
    expect(lines).toEqual(["고려 말", "신진 사대부", "  이성계", "위화도 회군"]);
    expect(lineOffsets(text, lines)).toEqual([0, 5, 12, 18]);
    const sp = [{ start: text.indexOf("이성계"), end: text.indexOf("이성계") + 3, color: R }];
    const segs = lineSegments(text, lines, sp)!;
    expect(segs[2]).toEqual([{ text: "  " }, { text: "이성계", color: R }]);
    expect(segs[0]).toEqual([{ text: "고려 말" }]);
    // 줄에 걸친 구간
    const across = lineSegments(text, lines, [{ start: 3, end: 8, color: B }])!;
    expect(across[0]).toEqual([{ text: "고려 " }, { text: "말", color: B }]);
    expect(across[1]).toEqual([{ text: "신진 ", color: B }, { text: "사대부" }]);
    // 글과 다른 줄(링크 "3P")이면 null → 상자 글자색 하나로
    expect(lineSegments("", ["3P"], sp)).toBeNull();
    expect(lineSegments(text, lines, [])).toBeNull();
  });

  it("조각내기는 글자를 빠뜨리지도 겹치지도 않는다", () => {
    const text = "ABCDEFGHIJ";
    const sp = [
      { start: 1, end: 3, color: R },
      { start: 5, end: 9, color: B },
    ];
    for (let a = 0; a <= 10; a++)
      for (let b = a; b <= 10; b++) {
        const segs = segmentsOf(text, a, b, sp);
        expect(segs.map((x) => x.text).join("")).toBe(text.slice(a, b));
        expect(segs.every((x) => x.text.length > 0)).toBe(true);
      }
  });
});
