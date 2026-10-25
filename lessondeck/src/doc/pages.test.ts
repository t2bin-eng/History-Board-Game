import { describe, expect, it } from "vitest";
import { insertPages, movePage, pageAfterRemoval, removePage } from "./pages";
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
