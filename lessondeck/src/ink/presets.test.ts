import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PRESETS } from "./palette";
import { loadPresets, PRESETS_KEY, savePresets } from "./presets";
import { loadPenButton, PEN_BUTTON_KEY, savePenButton } from "./penButton";
import { strokeToSvgPath } from "./geometry";
import type { InkPoint, Stroke } from "./types";

// vitest는 node 환경: localStorage 흉내
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

afterEach(() => mem.clear());

describe("펜 바 펜 기억 (v0.33)", () => {
  it("없으면 처음 펜", () => {
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
  });
  it("저장한 펜·곧게 긋기·고른 굵기를 그대로 읽는다", () => {
    const list = [
      { id: "a", tool: "highlighter" as const, color: "#ff0", width: 12, straight: true },
      { id: "b", tool: "pen" as const, color: "#000", width: 2, fixedWidth: true },
    ];
    savePresets(list);
    expect(loadPresets()).toEqual(list);
  });
  it("엉뚱한 설정은 버린다 (펜의 straight, 형광펜의 fixedWidth)", () => {
    mem.set(PRESETS_KEY, JSON.stringify([{ id: "a", tool: "pen", color: "#000", width: 2, straight: true }, { id: "b", tool: "highlighter", color: "#ff0", width: 9, fixedWidth: true }]));
    expect(loadPresets()).toEqual([
      { id: "a", tool: "pen", color: "#000", width: 2 },
      { id: "b", tool: "highlighter", color: "#ff0", width: 9 },
    ]);
  });
  it("모양이 틀리거나 깨진 값이면 처음 펜", () => {
    mem.set(PRESETS_KEY, "{not json");
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    mem.set(PRESETS_KEY, JSON.stringify([{ id: "a", tool: "marker", color: "#000", width: 2 }]));
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    mem.set(PRESETS_KEY, JSON.stringify([]));
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    mem.set(PRESETS_KEY, JSON.stringify([{ id: "a", tool: "pen", color: "#000", width: -1 }]));
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
  });
});

describe("S펜 버튼 동작 (v0.33)", () => {
  it("기본은 지우개, 고른 값은 기억, 모르는 값은 지우개", () => {
    expect(loadPenButton()).toBe("eraser");
    savePenButton("laser");
    expect(loadPenButton()).toBe("laser");
    savePenButton("highlighter");
    expect(loadPenButton()).toBe("highlighter");
    mem.set(PEN_BUTTON_KEY, "select");
    expect(loadPenButton()).toBe("eraser");
  });
});

describe("고른 굵기 획 (v0.33)", () => {
  const page = { width: 800, height: 600 };
  // 필압이 크게 바뀌는 획
  const pts: InkPoint[] = Array.from({ length: 30 }, (_, i) => [(100 + i * 8) / 800, 300 / 600, i < 15 ? 0.1 : 1] as InkPoint);
  const base: Stroke = { id: "s", tool: "pen", color: "#000", width: 6, points: pts };
  /** 외곽선의 세로 폭: x 위치별 위·아래 끝 차이 */
  const thickness = (d: string, x: number) => {
    const nums = [...d.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const near = nums.filter(([px]) => Math.abs(px - x) < 6).map(([, py]) => py);
    return Math.max(...near) - Math.min(...near);
  };
  it("필압 펜은 약하게 누른 곳이 가늘고, 고른 굵기 펜은 같다", () => {
    const vary = strokeToSvgPath(base, page);
    const even = strokeToSvgPath({ ...base, fixedWidth: true }, page);
    expect(thickness(vary, 160)).toBeLessThan(thickness(vary, 300) * 0.7);
    expect(Math.abs(thickness(even, 160) - thickness(even, 300))).toBeLessThan(0.6);
  });
});

describe("펜 종류·불투명도 기억 (v0.41)", () => {
  it("펜의 펜 종류·불투명도는 그대로, 잘못된 값이나 형광펜에 붙은 값은 버린다", () => {
    mem.set(
      PRESETS_KEY,
      JSON.stringify([
        { id: "a", tool: "pen", color: "#000", width: 2, nib: "fountain", opacity: 0.6 },
        { id: "b", tool: "pen", color: "#000", width: 2, nib: "brush", opacity: 0.1 },
        { id: "c", tool: "highlighter", color: "#ff0", width: 12, nib: "pencil", opacity: 0.6 },
        { id: "d", tool: "pen", color: "#000", width: 2, nib: "calligraphy", opacity: 1 },
      ]),
    );
    const [a, b, c, d] = loadPresets();
    expect(a).toMatchObject({ nib: "fountain", opacity: 0.6 });
    expect(b.nib).toBeUndefined();
    expect(b.opacity).toBeUndefined();
    expect(c.nib).toBeUndefined();
    expect(c.opacity).toBeUndefined();
    expect(d.nib).toBe("calligraphy");
    expect(d.opacity).toBeUndefined();
  });
});
