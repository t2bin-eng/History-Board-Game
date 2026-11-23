import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEAR_HOLD_MS, onPenNear, penNear, reportPenNear } from "./penNear";

describe("penNear (펜은 판서, 손가락은 조작)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    reportPenNear(false);
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("가까움은 바로, 멂은 잠깐 기다렸다가", () => {
    const seen: boolean[] = [];
    const off = onPenNear((v) => seen.push(v));
    reportPenNear(true);
    expect(penNear()).toBe(true);
    reportPenNear(false);
    vi.advanceTimersByTime(NEAR_HOLD_MS - 50);
    expect(penNear()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(penNear()).toBe(false);
    expect(seen).toEqual([true, false]);
    off();
  });

  it("띄움 끝 → 곧 닿음(멂 → 가까움)은 비키지 않는다", () => {
    const seen: boolean[] = [];
    const off = onPenNear((v) => seen.push(v));
    reportPenNear(true);
    reportPenNear(false);
    vi.advanceTimersByTime(30);
    reportPenNear(true);
    vi.advanceTimersByTime(NEAR_HOLD_MS * 3);
    expect(penNear()).toBe(true);
    expect(seen).toEqual([true]);
    off();
  });

  it("멀 때 멂이 또 와도 아무 일 없음", () => {
    const seen: boolean[] = [];
    const off = onPenNear((v) => seen.push(v));
    reportPenNear(false);
    vi.runAllTimers();
    expect(penNear()).toBe(false);
    expect(seen).toEqual([]);
    off();
  });
});
