import type { BoxFont, TextBox } from "./types";

// 글상자 서식 (v0.25, SPEC 5장 boxes "서식"): 글꼴·굵게·기울임 → 화면(CSS)과 너비 재기·썸네일(캔버스)에 같은 글꼴 값.
// 기본 말고는 앱에 넣은 글꼴(src/fonts.ts)이라 기기마다 같다.

/** 기본 글꼴 (styles.css의 .text-box와 같아야 줄바꿈이 맞는다) */
export const BOX_FONT = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, sans-serif';

export interface BoxFontInfo {
  id: BoxFont | undefined;
  label: string;
  family: string;
  /** 보통·굵게 무게 (글꼴에 굵은 꼴이 없으면 브라우저가 굵게 만든다) */
  weights: [number, number];
}

export const BOX_FONTS: BoxFontInfo[] = [
  { id: undefined, label: "기본", family: BOX_FONT, weights: [500, 800] },
  { id: "serif", label: "명조", family: `"Nanum Myeongjo", serif`, weights: [400, 700] },
  { id: "hand", label: "손글씨", family: `"Yeon Sung", ${BOX_FONT}`, weights: [400, 700] },
  { id: "round", label: "둥근", family: `"Jua", ${BOX_FONT}`, weights: [400, 700] },
  { id: "title", label: "제목", family: `"Black Han Sans", ${BOX_FONT}`, weights: [400, 700] },
];

export function boxFontInfo(font: BoxFont | undefined): BoxFontInfo {
  return BOX_FONTS.find((f) => f.id === font) ?? BOX_FONTS[0];
}

export interface BoxTextStyle {
  family: string;
  weight: number;
  italic: boolean;
  /** 캔버스 font 앞부분 ("italic 700") — 뒤에 `${px}px ${family}`를 붙인다 */
  prefix: string;
  /** 너비 재기 캐시 열쇠 */
  key: string;
}

/** 상자의 글꼴·무게·기울임 */
export function boxTextStyle(box: Pick<TextBox, "font" | "bold" | "italic">): BoxTextStyle {
  const info = boxFontInfo(box.font);
  const weight = info.weights[box.bold ? 1 : 0];
  const italic = !!box.italic;
  const prefix = `${italic ? "italic " : ""}${weight}`;
  return { family: info.family, weight, italic, prefix, key: `${box.font ?? ""}|${prefix}` };
}

/** 캔버스 font 값 */
export function canvasFont(style: BoxTextStyle, px: number): string {
  return `${style.prefix} ${px}px ${style.family}`;
}

/** 서식 바꾸기 값 (꺼진 것은 undefined → 저장할 때 뺀다) */
export type BoxFormat = Partial<Pick<TextBox, "font" | "bold" | "italic" | "underline" | "align">>;

/** 서식 값 다듬기: 기본값(기본 글꼴·끔·왼쪽)은 빼서 0.24까지와 같은 상자로 */
export function cleanFormat<T extends BoxFormat>(box: T): T {
  const out = { ...box };
  if (!out.font || !BOX_FONTS.some((f) => f.id === out.font)) delete out.font;
  for (const k of ["bold", "italic", "underline"] as const) if (!out[k]) delete out[k];
  if (out.align !== "center" && out.align !== "right") delete out.align;
  return out;
}

/** 상자에서 서식만 (다음 새 상자에 쓰려고) */
export function formatOf(box: TextBox): BoxFormat {
  return cleanFormat({ font: box.font, bold: box.bold, italic: box.italic, underline: box.underline, align: box.align });
}
