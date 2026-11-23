import { describe, expect, it } from "vitest";
import { parsePinchMessage, parsePointerMessage } from "./frameInput";
import { guardHtml } from "./htmlFrame";

describe("HTML 페이지 액자 안 손가락·펜 (v0.38)", () => {
  it("두 손가락 메시지: 시작·움직임은 두 점(screen·액자 좌표)과 접촉 크기, 끝은 점 없이", () => {
    const a = [100, 200, 50, 60];
    const b = [300, 200, 150, 60];
    expect(parsePinchMessage({ lessondeck: "pinch", phase: "start", a, b, r: 5 })).toEqual({ phase: "start", a, b, r: 5 });
    expect(parsePinchMessage({ lessondeck: "pinch", phase: "move", a, b })).toEqual({ phase: "move", a, b, r: 0 });
    expect(parsePinchMessage({ lessondeck: "pinch", phase: "end" })).toEqual({ phase: "end", r: 0 });
  });
  it("이상한 메시지는 버린다", () => {
    expect(parsePinchMessage({ lessondeck: "pinch", phase: "move", a: [1, 2, 3], b: [1, 2, 3, 4] })).toBeNull();
    expect(parsePinchMessage({ lessondeck: "pinch", phase: "zoom", a: [1, 2, 3, 4], b: [1, 2, 3, 4] })).toBeNull();
    expect(parsePinchMessage({ lessondeck: "scroll", x: 1 })).toBeNull();
    expect(parsePinchMessage(null)).toBeNull();
  });
  it("펜·손가락 자리 메시지", () => {
    expect(parsePointerMessage({ lessondeck: "pointer", s: [10, 20, 5, 6] })).toEqual([10, 20, 5, 6]);
    expect(parsePointerMessage({ lessondeck: "pointer", s: [10, "20", 5, 6] })).toBeNull();
    expect(parsePointerMessage({ lessondeck: "pinch" })).toBeNull();
  });
  it("안내 스크립트가 두 손가락·펜 자리를 알리고, 두 손가락일 때 웹앱 스크롤을 막는다", () => {
    const out = guardHtml("<html><head></head><body></body></html>");
    expect(out).toContain('lessondeck:"pinch"');
    expect(out).toContain('lessondeck:"pointer"');
    expect(out).toContain('lessondeck:"hello"');
    expect(out).toContain("preventDefault");
  });
});
