import { afterEach, describe, expect, it } from "vitest";
import { inkColorAt, rgbHex } from "../lib/eyedropper";
import { strokeToSvgPath } from "./geometry";
import { loadRecentColors, normalizeHex, pushRecentColor, RECENT_COLORS_KEY, RECENT_MAX } from "./recentColors";
import { loadStabilize, saveStabilize, SMOOTH_V2, STABILIZE_KEY, stabilizeOf, strokeSmoothRadius } from "./smoothing";
import type { InkPoint, Stroke } from "./types";

// 색 고르기·손떨림 보정 세기 (v0.42)

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

describe("색 코드", () => {
  it("#rgb·rgb·대문자 → #rrggbb, 아니면 null", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex(" 1a2B3c ")).toBe("#1a2b3c");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("빨강")).toBeNull();
    expect(normalizeHex("")).toBeNull();
    expect(rgbHex(255, 0, 127.6)).toBe("#ff0080");
  });
});

describe("최근 색", () => {
  it("맨 앞에, 있던 색은 앞으로 옮기고, 10개까지, 같으면 그대로", () => {
    let r = { pen: [] as string[], highlighter: [] as string[] };
    for (let i = 0; i < 12; i++) r = pushRecentColor(r, "pen", `#0000${i.toString(16).padStart(2, "0")}`);
    expect(r.pen).toHaveLength(RECENT_MAX);
    expect(r.pen[0]).toBe("#00000b");
    r = pushRecentColor(r, "pen", "#00000A".toLowerCase());
    expect(r.pen.slice(0, 2)).toEqual(["#00000a", "#00000b"]);
    expect(r.pen).toHaveLength(RECENT_MAX);
    expect(pushRecentColor(r, "pen", "#00000a")).toBe(r);
    expect(pushRecentColor(r, "pen", "nope")).toBe(r);
    expect(r.highlighter).toEqual([]);
  });
  it("읽을 때 이상한 값·겹친 값은 버린다", () => {
    mem.set(RECENT_COLORS_KEY, JSON.stringify({ pen: ["#112233", "red", "#112233", 3, "#AABBCC"], highlighter: "x" }));
    expect(loadRecentColors()).toEqual({ pen: ["#112233"], highlighter: [] });
    mem.set(RECENT_COLORS_KEY, "{망가짐");
    expect(loadRecentColors()).toEqual({ pen: [], highlighter: [] });
  });
});

describe("스포이트: 필기 색", () => {
  const page = { width: 1000, height: 1000 };
  const line = (id: string, tool: Stroke["tool"], color: string, y: number): Stroke => ({
    id,
    tool,
    color,
    width: tool === "highlighter" ? 20 : 3,
    points: [
      [0.1, y, 0.5],
      [0.9, y, 0.5],
    ],
  });
  it("펜이 형광펜 위, 같은 도구면 나중 획, 예전 형광 노랑은 새 노랑, 없으면 null", () => {
    const strokes = [line("a", "pen", "#111111", 0.5), line("h", "highlighter", "#ffe600", 0.5), line("b", "pen", "#FF0000", 0.5)];
    expect(inkColorAt(strokes, 500, 500, page, 6)).toBe("#ff0000");
    expect(inkColorAt([strokes[1]], 500, 505, page, 6)).toBe("#fff200");
    expect(inkColorAt(strokes, 500, 700, page, 6)).toBeNull();
  });
});

describe("손떨림 보정 세기", () => {
  it("기기 설정: 없거나 이상하면 보통(2)", () => {
    expect(loadStabilize()).toBe(2);
    mem.set(STABILIZE_KEY, "9");
    expect(loadStabilize()).toBe(2);
    saveStabilize(4);
    expect(loadStabilize()).toBe(4);
    expect(stabilizeOf(4)).toMatchObject({ tol: 2, radius: 7 });
    expect(stabilizeOf(2)).toMatchObject({ tol: 1, radius: 2 });
  });
  it("획의 다듬는 폭: 1~8 정수만, 아니면 2", () => {
    expect(strokeSmoothRadius(undefined)).toBe(2);
    expect(strokeSmoothRadius(7)).toBe(7);
    expect(strokeSmoothRadius(0)).toBe(2);
    expect(strokeSmoothRadius(2.5)).toBe(2);
    expect(strokeSmoothRadius(20)).toBe(2);
  });
  it("세게 다듬으면 떨리는 선이 더 곧게 그려지고, smoothR 2는 없는 것과 같다", () => {
    // 위아래로 ±3px, 8점마다 한 번 출렁이며 가로로 긋기
    const pts: InkPoint[] = Array.from({ length: 60 }, (_, i) => [0.1 + i * 0.005, 0.5 + 0.003 * Math.sin((i * 2 * Math.PI) / 8), 0.5]);
    const base: Stroke = { id: "s", tool: "pen", color: "#000", width: 2, points: pts, smooth: SMOOTH_V2, fixedWidth: true };
    const page = { width: 1000, height: 1000 };
    /** path 위쪽 가장자리의 위아래 흔들림 */
    const wobble = (d: string) => {
      const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const ys: number[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) if (nums[i] > 200 && nums[i] < 350) ys.push(nums[i + 1]);
      const top = ys.filter((y) => y < 500);
      return Math.max(...top) - Math.min(...top);
    };
    const normal = strokeToSvgPath(base, page);
    expect(strokeToSvgPath({ ...base, smoothR: 2 }, page)).toBe(normal);
    const strong = strokeToSvgPath({ ...base, smoothR: 7 }, page);
    expect(wobble(strong)).toBeLessThan(wobble(normal));
    expect(wobble(strokeToSvgPath({ ...base, smoothR: 1 }, page))).toBeGreaterThan(wobble(strong));
  });
});
