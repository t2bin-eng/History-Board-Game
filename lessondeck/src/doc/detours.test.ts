import { describe, expect, it } from "vitest";
import { followDetour, stepSkipping } from "./detours";
import type { Page } from "./types";

const pages = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id): Page => ({ id, kind: "blank", background: "plain" }) as Page);

describe("링크로 본 쪽 건너뛰기", () => {
  it("링크로 갔다가 돌아오면 들렀던 쪽을 본 것으로 (겹쳐 들어가도 하나씩)", () => {
    let r = followDetour([], "p2", "p5");
    expect(r.seen).toBeNull();
    r = followDetour(r.trail, "p5", "p6");
    expect(r.seen).toBeNull();
    r = followDetour(r.trail, "p6", "p5");
    expect(r.seen).toBe("p6");
    r = followDetour(r.trail, "p5", "p2");
    expect(r.seen).toBe("p5");
    expect(r.trail).toEqual([]);
    // 돌아오지 않고 다른 쪽으로 가면 아직 아님
    expect(followDetour([{ from: "p2", to: "p5" }], "p5", "p3").seen).toBeNull();
  });

  it("다음·이전은 숨긴 쪽과 본 쪽을 건너뛴다. 지금 쪽은 빼고, 끝이면 null", () => {
    expect(stepSkipping(pages, [], ["p3", "p4"], "p2", 1)).toEqual({ next: "p5", skipped: ["p3", "p4"] });
    expect(stepSkipping(pages, ["p3"], ["p4"], "p2", 1)).toEqual({ next: "p5", skipped: ["p4"] });
    expect(stepSkipping(pages, [], ["p5"], "p6", -1)).toEqual({ next: "p4", skipped: ["p5"] });
    expect(stepSkipping(pages, [], ["p5"], "p5", 1)).toEqual({ next: "p6", skipped: [] });
    expect(stepSkipping(pages, [], ["p6"], "p5", 1)).toEqual({ next: null, skipped: ["p6"] });
  });
});
