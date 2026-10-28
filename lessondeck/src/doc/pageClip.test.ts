import { describe, expect, it } from "vitest";
import type { PageClip } from "./clipboard";
import { pageAssetIds, pdfPagesUsed, planPaste } from "./pageClip";
import type { Page } from "./types";

const stroke = { id: "k1", tool: "pen" as const, color: "#000", width: 2, points: [[0.1, 0.1, 0.5]] as [number, number, number][] };

const pdfPage: Page = {
  id: "p2",
  kind: "pdf",
  asset: "pdf-a",
  pageIndex: 7,
  boxes: [
    { id: "b1", x: 0.1, y: 0.1, text: "", size: 24, color: "#1565c0", link: { type: "page", pageId: "p1" } },
    { id: "b2", x: 0.1, y: 0.2, text: "", size: 24, color: "#1565c0", link: { type: "page", pageId: "p9" }, role: "back", backOf: "bx" },
    { id: "b3", x: 0.1, y: 0.3, text: "누리집", size: 24, color: "#1565c0", link: { type: "url", url: "https://example.com/" } },
  ],
  stickers: [{ id: "s1", asset: "img-x", x: 0.5, y: 0.5, w: 0.2 }],
};

const clip: PageClip = {
  docId: "doc-a",
  pages: [pdfPage],
  ink: { p2: [stroke] },
  labels: { b1: "1쪽으로 가기 →", b2: "↩ 9쪽으로 돌아가기" },
  assets: {},
};

describe("페이지 붙여넣기", () => {
  it("쓰는 원본과 PDF 쪽", () => {
    expect(pageAssetIds(pdfPage).sort()).toEqual(["img-x", "pdf-a"]);
    expect(pdfPagesUsed([pdfPage, { ...pdfPage, id: "p3", pageIndex: 2 }, { ...pdfPage, id: "p4" }])).toEqual({ "pdf-a": [2, 7] });
  });

  it("같은 문서: 새 id, 링크는 그대로(있는 페이지), 필기 복사, backOf는 뗀다", () => {
    const target: Page[] = [{ id: "p1", kind: "blank", background: "plain", aspect: 1 }, pdfPage, { id: "p9", kind: "blank", background: "plain", aspect: 1 }];
    const plan = planPaste(clip, "doc-a", target);
    const [p] = plan.pages;
    expect(p.id).not.toBe("p2");
    expect(p.kind === "pdf" && p.asset).toBe("pdf-a");
    expect(p.boxes!.map((b) => b.id)).not.toContain("b1");
    expect(p.boxes![0].link).toEqual({ type: "page", pageId: "p1" });
    expect(p.boxes![1].backOf).toBeUndefined();
    expect(p.stickers![0].id).not.toBe("s1");
    expect(plan.ink[p.id]).toEqual([stroke]);
    expect(plan.unlinked).toBe(0);
  });

  it("다른 문서: 페이지 링크는 글자만, 웹 링크는 그대로, 원본 id·PDF 쪽 바꾸기", () => {
    const plan = planPaste(clip, "doc-b", [], { "pdf-a": "pdf-new", "img-x": "img-new" }, { "pdf-a": { 7: 0 } });
    const [p] = plan.pages;
    expect(p.kind === "pdf" && [p.asset, p.pageIndex]).toEqual(["pdf-new", 0]);
    expect(p.boxes![0].link).toBeUndefined();
    expect(p.boxes![0].text).toBe("1쪽으로 가기 →");
    expect(p.boxes![1].role).toBeUndefined();
    expect(p.boxes![2].link).toEqual({ type: "url", url: "https://example.com/" });
    expect(p.stickers![0].asset).toBe("img-new");
    expect(plan.unlinked).toBe(2);
  });

  it("함께 붙이는 페이지끼리의 링크는 새 id로 이어진다", () => {
    const two: PageClip = { ...clip, pages: [{ id: "p1", kind: "blank", background: "plain", aspect: 1 }, pdfPage] };
    const plan = planPaste(two, "doc-b", []);
    expect(plan.pages[1].boxes![0].link).toEqual({ type: "page", pageId: plan.pages[0].id });
    expect(plan.unlinked).toBe(1);
  });
});
