import { describe, expect, it } from "vitest";
import { BOX_FONT, BOX_FONTS, boxTextStyle, canvasFont, cleanFormat, formatOf } from "./boxFonts";
import { BOX_SIZES, formatBox, stepBoxSize } from "./boxes";
import { layoutBox } from "./textLayout";
import type { Page, TextBox } from "./types";

const box = (over: Partial<TextBox> = {}): TextBox => ({ id: "b1", x: 0.1, y: 0.1, text: "왕건은 918년 고려를 세웠다", size: 24, color: "#111111", ...over });
const page = (b: TextBox): Page => ({ id: "p1", kind: "blank", background: "plain", aspect: 1, boxes: [b] }) as Page;

describe("글상자 서식 (v0.25)", () => {
  it("글꼴 5가지: 기본은 0.24와 같은 글꼴·굵기 500, 굵게·기울임은 캔버스 font에도", () => {
    expect(BOX_FONTS.map((f) => f.label)).toEqual(["기본", "명조", "손글씨", "둥근", "제목"]);
    expect(canvasFont(boxTextStyle({}), 24)).toBe(`500 24px ${BOX_FONT}`);
    expect(canvasFont(boxTextStyle({ font: "serif", bold: true, italic: true }), 30)).toBe(`italic 700 30px "Nanum Myeongjo", serif`);
    expect(boxTextStyle({ bold: true }).weight).toBe(800);
    // 글꼴·굵기·기울임이 다르면 너비 재기도 따로
    expect(boxTextStyle({ font: "hand" }).key).not.toBe(boxTextStyle({}).key);
    expect(boxTextStyle({ font: "hand", bold: true }).key).not.toBe(boxTextStyle({ font: "hand" }).key);
  });

  it("서식 바꾸기: 끈 것·기본값은 빼서 0.24와 같은 상자, 다음 상자용 서식만 뽑기", () => {
    let pages = formatBox([page(box())], "p1", "b1", { font: "round", bold: true, align: "center" });
    expect(pages[0].boxes![0]).toMatchObject({ font: "round", bold: true, align: "center" });
    pages = formatBox(pages, "p1", "b1", { font: undefined, bold: false, align: undefined, underline: true });
    const b = pages[0].boxes![0];
    expect(b.underline).toBe(true);
    expect("font" in b || "bold" in b || "align" in b).toBe(false);
    expect(formatOf(b)).toEqual({ underline: true });
    // 이상한 값은 버림
    expect(cleanFormat({ font: "comic" as never, align: "justify" as never })).toEqual({});
  });

  it("글자 크기 단계: 16~96, 가장 가까운 단계에서 한 칸", () => {
    expect(BOX_SIZES).toEqual([16, 20, 24, 30, 38, 48, 60, 72, 96]);
    expect(stepBoxSize(24, 1)).toBe(30);
    expect(stepBoxSize(60, 1)).toBe(72);
    expect(stepBoxSize(96, 1)).toBe(96);
    expect(stepBoxSize(17, -1)).toBe(16);
  });

  it("줄바꿈은 그 상자 글꼴로 잰 너비로 (넓은 글꼴이면 더 일찍 줄바꿈)", () => {
    const narrow = (t: string, s: number) => [...t].length * s * 0.5;
    const wide = (t: string, s: number) => [...t].length * s * 0.9;
    const b = box({ x: 0.8 });
    expect(layoutBox(b, b.text, 1, wide).lines.length).toBeGreaterThan(layoutBox(b, b.text, 1, narrow).lines.length);
  });
});
