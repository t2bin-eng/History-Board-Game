import { describe, expect, it, vi } from "vitest";
import { AI_DOC_ID, AI_PAGE_ID, AI_SHOT_ID, aiScratchPage, openAiScratch, releaseAiScratch } from "./aiScratch";
import type { Asset, DocState, Page } from "./types";
import type { Stroke } from "../ink/types";

const box = { id: "b1", x: 0.1, y: 0.1, text: "원인", size: 0.03, color: "#111111" };
const sticker = { id: "s1", asset: "img-1", x: 0.2, y: 0.3, w: 0.2 };
const arrow = { id: "a1", from: "b1", at: [0.5, 0.5] as [number, number], color: "#111111" };
const pdfPage: Page = { id: "p1", kind: "pdf", asset: "pdf-1", pageIndex: 2, boxes: [box], stickers: [sticker], arrows: [arrow] };
const stroke: Stroke = { id: "k1", tool: "pen", color: "#000000", width: 2, points: [{ x: 0.1, y: 0.1, p: 0.5, t: 0 }] } as unknown as Stroke;
const img = (id: string, url: string): Asset => ({ kind: "image", id, name: id, mime: "image/png", width: 10, height: 10, url });

describe("AI로 보내기 임시 문서 (v0.31)", () => {
  it("임시 페이지: 바탕 그림 위에 글상자·화살표·스티커 사본 (원래 페이지와 따로)", () => {
    const p = aiScratchPage(pdfPage);
    expect(p).toMatchObject({ id: AI_PAGE_ID, kind: "image", asset: AI_SHOT_ID });
    expect(p.boxes).toEqual([box]);
    expect(p.arrows).toEqual([arrow]);
    expect(p.stickers).toEqual([sticker]);
    p.boxes![0].text = "고침";
    expect(box.text).toBe("원인");
    expect(aiScratchPage({ id: "p2", kind: "blank", background: "plain", aspect: 1 })).toEqual({ id: AI_PAGE_ID, kind: "image", asset: AI_SHOT_ID });
  });

  it("열기: 바탕 그림 + 스티커 원본은 빌려 오고, 필기는 사본 (실행 취소 기록은 새로)", async () => {
    const from: DocState = { id: "doc-1", title: "수업", pages: [pdfPage], hidden: [], assets: { "img-1": img("img-1", "blob:a"), "img-2": img("img-2", "blob:b") } };
    const base = { blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), width: 1697, height: 2400 };
    const strokes = [stroke];
    const opened = await openAiScratch({ base, page: pdfPage, strokes, ink: {}, lecture: false }, from);
    expect(opened.doc.id).toBe(AI_DOC_ID);
    expect(opened.doc.pages).toHaveLength(1);
    expect(Object.keys(opened.doc.assets).sort()).toEqual([AI_SHOT_ID, "img-1"]);
    expect(opened.doc.assets["img-1"]).toBe(from.assets["img-1"]);
    expect(opened.doc.assets[AI_SHOT_ID]).toMatchObject({ kind: "image", width: 1697, height: 2400 });
    expect(opened.ink[AI_PAGE_ID].present).toEqual(strokes);
    expect(opened.ink[AI_PAGE_ID].present).not.toBe(strokes);
    expect(opened.ink[AI_PAGE_ID].past).toEqual([]);
  });

  it("닫기: 그 창에서 만든 원본만 정리 (빌려 온 것은 그대로)", () => {
    const borrowed = img("img-1", "blob:borrowed");
    const from: DocState = { id: "doc-1", title: "", pages: [], hidden: [], assets: { "img-1": borrowed } };
    const scratch: DocState = { ...from, id: AI_DOC_ID, assets: { "img-1": borrowed, [AI_SHOT_ID]: img(AI_SHOT_ID, "blob:shot"), "img-9": img("img-9", "blob:new") } };
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    releaseAiScratch(scratch, from);
    expect(revoke.mock.calls.map((c) => c[0]).sort()).toEqual(["blob:new", "blob:shot"]);
    revoke.mockRestore();
  });
});
