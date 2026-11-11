import { describe, expect, it } from "vitest";
import { cleanAnim, MAX_NOTE_W, newVeil, NOTE_COLORS, NOTE_W, noteOf, VEIL_H, VEIL_W, veilLabel } from "./boxAnim";
import { animBox } from "./boxes";
import type { Page, TextBox } from "./types";

const box = (over: Partial<TextBox> = {}): TextBox => ({ id: "b1", x: 0.1, y: 0.1, text: "삼국 통일", size: 24, color: "#111111", ...over });
const page = (b: TextBox): Page => ({ id: "p1", kind: "blank", background: "plain", aspect: 1, boxes: [b] }) as Page;

describe("애니메이션 값 (v0.28)", () => {
  it("쪽지: 기본값은 빼고, 크기는 0.03~0.15, 글은 8자까지, '?'는 기본", () => {
    expect(cleanAnim({ reveal: "fold", typing: true, note: { w: NOTE_W, color: NOTE_COLORS[0], label: "?" } })).toEqual({ reveal: "fold", typing: true });
    expect(cleanAnim({ reveal: "fold", note: { w: 0.5, color: "#FFC4D3", label: "  정답은 무엇일까요요요 " } })).toEqual({
      reveal: "fold",
      note: { w: MAX_NOTE_W, color: "#ffc4d3", label: "정답은 무엇일까" },
    });
    expect(noteOf(undefined)).toEqual({ w: NOTE_W, color: NOTE_COLORS[0], label: "?" });
    expect(noteOf({ reveal: "fold", note: { color: "red" } }).color).toBe(NOTE_COLORS[0]);
  });

  it("강조만 있어도 되고, 접기가 없으면 타자·쪽지는 버림, 아무것도 없으면 anim을 뺌", () => {
    expect(cleanAnim({ emphasis: "glow", typing: true, note: { w: 0.1 } })).toEqual({ emphasis: "glow" });
    expect(cleanAnim({ reveal: "fold", emphasis: "highlight" })).toEqual({ reveal: "fold", emphasis: "highlight" });
    expect(cleanAnim({ emphasis: "spin" as never })).toBeUndefined();
    expect(cleanAnim({})).toBeUndefined();
    const p = animBox([page(box({ anim: { reveal: "fold" } }))], "p1", "b1", { typing: true });
    expect("anim" in p[0].boxes![0]).toBe(false);
  });

  it("베일: 누른 곳이 가운데, 페이지 안, 크기 정해진 상자, 글이 없으면 '?'", () => {
    const v = newVeil(0.5, 0.5);
    expect(v.x + VEIL_W / 2).toBeCloseTo(0.5, 6);
    expect(v.y + VEIL_H / 2).toBeCloseTo(0.5, 6);
    expect(v.w).toBe(VEIL_W);
    expect(v.veil?.color).toBeTruthy();
    const edge = newVeil(0.99, 0.01);
    expect(edge.x + edge.w!).toBeLessThanOrEqual(1);
    expect(edge.y).toBeGreaterThanOrEqual(0);
    expect(veilLabel(v)).toBe("?");
    expect(veilLabel({ text: " ① " })).toBe("①");
  });
});
