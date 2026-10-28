import { describe, expect, it } from "vitest";
import { boxChrome, fitSize, layoutBox, LINE_HEIGHT, wrapLines, type Measure } from "./textLayout";
import type { TextBox } from "./types";

// 고정폭: 글자 하나 = 글자 크기만큼
const mono: Measure = (text, size) => [...text].length * size;
const plain = boxChrome({ text: "" });

describe("줄바꿈", () => {
  it("띄어쓰기 단위로 나누고 줄바꿈 문자는 그대로", () => {
    expect(wrapLines("조선 후기 사회 변동", 50, 10, mono)).toEqual(["조선 후기", "사회 변동"]);
    expect(wrapLines("첫 줄\n둘째", 100, 10, mono)).toEqual(["첫 줄", "둘째"]);
  });

  it("단어 하나가 줄보다 길면 글자 단위로 나눈다", () => {
    expect(wrapLines("encykorea", 40, 10, mono)).toEqual(["ency", "kore", "a"]);
  });

  it("문단 맨 앞 들여쓰기는 살리고 줄 끝 공백은 지운다", () => {
    expect(wrapLines("  가나 다라", 50, 10, mono)).toEqual(["  가나", "다라"]);
  });
});

describe("상자에 맞춘 글자 크기", () => {
  it("상자를 넓히면 줄이 줄고 글자가 커진다", () => {
    const narrow = fitSize("조선 후기 사회 변동", 100, 60, plain, mono);
    const wide = fitSize("조선 후기 사회 변동", 400, 60, plain, mono);
    expect(wide).toBeGreaterThan(narrow);
    expect(wrapLines("조선 후기 사회 변동", 400, wide, mono)).toHaveLength(1);
  });

  it("고른 크기에서 글이 상자 안에 다 들어간다", () => {
    const s = fitSize("가나다라마바사 아자차카", 120, 90, plain, mono);
    const lines = wrapLines("가나다라마바사 아자차카", 120, s, mono);
    expect(lines.length * s * LINE_HEIGHT).toBeLessThanOrEqual(90);
    for (const l of lines) expect(mono(l, s)).toBeLessThanOrEqual(120);
    // 조금 더 키우면 넘친다
    const bigger = wrapLines("가나다라마바사 아자차카", 120, s + 1, mono);
    expect(bigger.length * (s + 1) * LINE_HEIGHT > 90 || bigger.some((l) => mono(l, s + 1) > 120)).toBe(true);
  });

  it("링크는 테두리 여백과 아이콘 자리를 빼고 맞춘다", () => {
    const chrome = boxChrome({ link: { type: "url", url: "https://example.com" }, text: "자료" });
    expect(fitSize("자료", 100, 100, chrome, mono)).toBeLessThan(fitSize("자료", 100, 100, plain, mono));
  });
});

describe("상자 배치", () => {
  const base: TextBox = { id: "b", x: 0.1, y: 0.1, text: "", size: 24, color: "#000" };

  it("크기가 없는 상자는 글자 크기 그대로, 페이지 끝에서 줄바꿈", () => {
    const l = layoutBox({ ...base, x: 0.9 }, "가나다라마바사", 1.4, mono);
    expect(l.fitted).toBe(false);
    expect(l.size).toBe(24);
    expect(l.lines).toEqual(["가나다라", "마바사"]);
  });

  it("크기가 있는 상자는 글자 크기를 맞춘다 (세로는 페이지 비율로)", () => {
    const l = layoutBox({ ...base, w: 0.2, h: 0.05 }, "가나", 1.4, mono);
    expect(l.fitted).toBe(true);
    // 가로 200에 두 글자 → 100, 세로 0.05×1000×1.4 = 70 (여유 3% 빼고) → 67.9/1.3
    expect(l.size).toBeCloseTo((70 * 0.97) / LINE_HEIGHT, 0);
    expect(l.lines).toEqual(["가나"]);
  });
});
