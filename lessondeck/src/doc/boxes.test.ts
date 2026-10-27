import { describe, expect, it } from "vitest";
import { addBox, boxesOf, boxLabel, copyBoxes, isDangling, makeClip, pasteBoxes, removeBox, setBoxLink } from "./boxes";
import { movePageTo, removePage } from "./pages";
import type { Page, TextBox } from "./types";

const blank = (id: string): Page => ({ id, kind: "blank", background: "plain", aspect: 0.7 });
const box = (id: string, text = ""): TextBox => ({ id, x: 0.1, y: 0.1, text, size: 24, color: "#1a1a1a" });

function setup() {
  let pages = [blank("a"), blank("b"), blank("c")];
  pages = addBox(pages, "a", box("link1", "자료 보기"));
  return pages;
}

const page = (pages: Page[], id: string) => pages.find((p) => p.id === id)!;

describe("페이지 링크와 돌아가기 링크", () => {
  it("다른 페이지로 링크를 걸면 그 페이지에 돌아가기 링크가 생긴다", () => {
    const pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    expect(boxesOf(page(pages, "a"))[0].link).toEqual({ type: "page", pageId: "c" });
    const back = boxesOf(page(pages, "c"));
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ role: "back", backOf: "link1", link: { type: "page", pageId: "a" }, text: "" });
    expect(boxLabel(back[0], pages, [])).toBe("↩ 1쪽으로 돌아가기");
  });

  it("연결한 페이지에 이미 돌아오는 링크가 있으면 또 만들지 않는다", () => {
    let pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    pages = addBox(pages, "a", box("link2"));
    pages = setBoxLink(pages, "a", "link2", { type: "page", pageId: "c" });
    expect(boxesOf(page(pages, "c"))).toHaveLength(1);
  });

  it("링크를 다른 페이지로 바꾸면 돌아가기 링크도 옮겨 간다", () => {
    let pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    pages = setBoxLink(pages, "a", "link1", { type: "page", pageId: "b" });
    expect(boxesOf(page(pages, "c"))).toHaveLength(0);
    expect(boxesOf(page(pages, "b"))[0]).toMatchObject({ role: "back", backOf: "link1" });
  });

  it("링크를 없애거나 상자를 지우면 돌아가기 링크도 지운다", () => {
    let pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    const unlinked = setBoxLink(pages, "a", "link1", undefined);
    expect(boxesOf(page(unlinked, "c"))).toHaveLength(0);
    expect("link" in boxesOf(page(unlinked, "a"))[0]).toBe(false);
    pages = removeBox(pages, "a", "link1");
    expect(boxesOf(page(pages, "a"))).toHaveLength(0);
    expect(boxesOf(page(pages, "c"))).toHaveLength(0);
  });

  it("같은 페이지·웹 주소 링크는 돌아가기 링크를 만들지 않는다", () => {
    let pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "a" });
    pages = setBoxLink(pages, "a", "link1", { type: "url", url: "https://example.com/x" });
    expect(pages.flatMap((p) => boxesOf(p))).toHaveLength(1);
    expect(boxLabel({ ...boxesOf(page(pages, "a"))[0], text: "" }, pages, [])).toBe("example.com");
  });

  it("비어 있는 링크 이름은 페이지 순서를 바꾸면 쪽 번호가 따라 바뀐다", () => {
    let pages = addBox([blank("a"), blank("b"), blank("c")], "a", box("l"));
    pages = setBoxLink(pages, "a", "l", { type: "page", pageId: "c" }, false);
    const l = boxesOf(page(pages, "a"))[0];
    expect(boxLabel(l, pages, [])).toBe("3쪽으로 가기 →");
    pages = movePageTo(pages, "c", 0);
    expect(boxLabel(l, pages, [])).toBe("1쪽으로 가기 →");
    expect(boxLabel(l, pages, ["c"])).toBe("숨긴 쪽으로 가기 →");
  });

  it("연결한 페이지를 지우면 링크가 끊긴 것으로 본다", () => {
    let pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    pages = removePage(pages, "a");
    const back = boxesOf(page(pages, "c"))[0];
    expect(isDangling(back, pages)).toBe(true);
    expect(boxLabel(back, pages, [])).toBe("연결된 페이지 없음");
  });

  it("페이지 복제: 상자는 새 id, 돌아가기 링크는 원래 링크와 떨어진다", () => {
    const pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    const original = boxesOf(page(pages, "c"));
    const copied = copyBoxes(original)!;
    expect(copied[0].id).not.toBe(original[0].id);
    expect(copied[0].backOf).toBeUndefined();
    expect(copied[0].role).toBe("back");
    expect(copyBoxes(undefined)).toBeUndefined();
  });
});

describe("상자 복사·붙여넣기", () => {
  it("같은 페이지에 붙이면 새 id로 조금 비켜서 놓인다", () => {
    const pages = setup();
    const src = boxesOf(page(pages, "a"))[0];
    const clip = makeClip("doc1", [src], pages, []);
    const r1 = pasteBoxes(pages, "a", clip, "doc1");
    const r2 = pasteBoxes(r1.pages, "a", clip, "doc1");
    const boxes = boxesOf(page(r2.pages, "a"));
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes.map((b) => b.id)).size).toBe(3);
    expect(boxes[1]).toMatchObject({ text: "자료 보기", x: 0.13, y: 0.13 });
    expect(boxes[2].x).toBeCloseTo(0.16);
  });

  it("페이지 링크를 다른 페이지에 붙이면 링크를 잇고 돌아가기 링크도 만든다", () => {
    const pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    const clip = makeClip("doc1", [boxesOf(page(pages, "a"))[0]], pages, []);
    const r = pasteBoxes(pages, "b", clip, "doc1");
    const pasted = boxesOf(page(r.pages, "b"))[0];
    expect(pasted.link).toEqual({ type: "page", pageId: "c" });
    const backs = boxesOf(page(r.pages, "c")).filter((b) => b.role === "back");
    expect(backs.map((b) => (b.link as { pageId: string }).pageId).sort()).toEqual(["a", "b"]);
    expect(backs.find((b) => b.backOf === pasted.id)).toBeTruthy();
  });

  it("잘라내서(지우고) 붙이면 돌아가기 링크도 새 자리를 가리킨다", () => {
    let pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    const clip = makeClip("doc1", [boxesOf(page(pages, "a"))[0]], pages, []);
    pages = removeBox(pages, "a", "link1");
    const r = pasteBoxes(pages, "b", clip, "doc1");
    const backs = boxesOf(page(r.pages, "c"));
    expect(backs).toHaveLength(1);
    expect(backs[0].link).toEqual({ type: "page", pageId: "b" });
  });

  it("다른 문서에 붙이면 페이지 링크는 풀고 보이던 글자를 남긴다, 웹 주소 링크는 그대로", () => {
    let pages = addBox([blank("a"), blank("b"), blank("c")], "a", box("l"));
    pages = setBoxLink(pages, "a", "l", { type: "page", pageId: "c" }, false);
    pages = addBox(pages, "a", { ...box("u"), link: { type: "url", url: "https://example.com/" } });
    const clip = makeClip("doc1", boxesOf(page(pages, "a")), pages, []);
    const other = [blank("x")];
    const r = pasteBoxes(other, "x", clip, "doc2");
    const [l, u] = boxesOf(r.pages[0]);
    expect(r.unlinked).toBe(1);
    expect(l.link).toBeUndefined();
    expect(l.text).toBe("3쪽으로 가기 →");
    expect(u.link).toEqual({ type: "url", url: "https://example.com/" });
  });

  it("돌아가기 링크를 붙여도 돌아가기 링크를 또 만들지 않는다", () => {
    const pages = setBoxLink(setup(), "a", "link1", { type: "page", pageId: "c" });
    const back = boxesOf(page(pages, "c"))[0];
    const r = pasteBoxes(pages, "b", makeClip("doc1", [back], pages, []), "doc1");
    const pasted = boxesOf(page(r.pages, "b"))[0];
    expect(pasted).toMatchObject({ role: "back", link: { type: "page", pageId: "a" } });
    expect(pasted.backOf).toBeUndefined();
    expect(boxesOf(page(r.pages, "a"))).toHaveLength(1);
  });
});
