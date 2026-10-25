import { describe, expect, it } from "vitest";
import { insertPages, movePage, movePageTo, pageAfterRemoval, removePage, stepVisible, visiblePosition } from "./pages";
import type { Page } from "./types";

const blank = (id: string): Page => ({ id, kind: "blank", background: "plain", aspect: 1 });
const ids = (pages: Page[]) => pages.map((p) => p.id);
const base = [blank("a"), blank("b"), blank("c")];

describe("insertPages", () => {
  it("원하는 위치에 끼워 넣고 뒤 페이지를 민다", () => {
    expect(ids(insertPages(base, 1, [blank("x"), blank("y")]))).toEqual(["a", "x", "y", "b", "c"]);
    expect(ids(insertPages(base, 0, [blank("x")]))).toEqual(["x", "a", "b", "c"]);
    expect(ids(insertPages(base, 99, [blank("x")]))).toEqual(["a", "b", "c", "x"]);
  });
});

describe("removePage / pageAfterRemoval", () => {
  it("지운 뒤에는 뒤 페이지, 마지막이면 앞 페이지를 보여 준다", () => {
    expect(ids(removePage(base, "b"))).toEqual(["a", "c"]);
    expect(pageAfterRemoval(base, "b")).toBe("c");
    expect(pageAfterRemoval(base, "c")).toBe("b");
    expect(pageAfterRemoval([blank("a")], "a")).toBeNull();
  });
});

describe("movePage", () => {
  it("앞뒤로 한 칸씩 옮기고 끝에서는 그대로 둔다", () => {
    expect(ids(movePage(base, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(movePage(base, "b", 1))).toEqual(["a", "c", "b"]);
    expect(movePage(base, "a", -1)).toBe(base);
    expect(movePage(base, "c", 1)).toBe(base);
  });
});

describe("stepVisible / visiblePosition", () => {
  const pages = [blank("a"), blank("b"), blank("c"), blank("d")];
  it("숨긴 페이지를 건너뛴다", () => {
    expect(stepVisible(pages, ["b", "c"], "a", 1)).toBe("d");
    expect(stepVisible(pages, ["b", "c"], "d", -1)).toBe("a");
    expect(stepVisible(pages, ["d"], "c", 1)).toBeNull();
  });
  it("숨기지 않은 페이지 기준 위치", () => {
    expect(visiblePosition(pages, ["b"], "c")).toEqual({ index: 1, count: 3 });
    // 숨긴 페이지를 보고 있으면 -1
    expect(visiblePosition(pages, ["b"], "b")).toEqual({ index: -1, count: 3 });
  });
});

describe("movePageTo", () => {
  const pages = [blank("a"), blank("b"), blank("c"), blank("d")];
  it("놓은 자리(원래 목록의 사이 위치)로 옮긴다", () => {
    expect(ids(movePageTo(pages, "a", 3))).toEqual(["b", "c", "a", "d"]);
    expect(ids(movePageTo(pages, "a", 4))).toEqual(["b", "c", "d", "a"]);
    expect(ids(movePageTo(pages, "d", 0))).toEqual(["d", "a", "b", "c"]);
    expect(ids(movePageTo(pages, "c", 1))).toEqual(["a", "c", "b", "d"]);
  });
  it("제자리(자기 앞뒤 사이)에 놓으면 그대로", () => {
    expect(movePageTo(pages, "b", 1)).toBe(pages);
    expect(movePageTo(pages, "b", 2)).toBe(pages);
    expect(movePageTo(pages, "x", 0)).toBe(pages);
  });
});
