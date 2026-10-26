import { visiblePosition } from "./pages";
import { newId, type BoxLink, type Page, type TextBox } from "./types";

// 텍스트 상자·하이퍼링크 (SPEC 5장 boxes). 페이지 목록을 받아 새 목록을 돌려주는 순수 함수만 둔다.

/** 글자 색 (검정·파랑·빨강·초록) */
export const BOX_COLORS = ["#1a1a1a", "#1565c0", "#d32f2f", "#2e7d32"];
export const LINK_COLOR = "#1565c0";
/** 글자 크기 단계 ("페이지 가로 = 1000" 단위) */
export const BOX_SIZES = [16, 20, 24, 30, 38, 48, 60];
export const DEFAULT_BOX_SIZE = 24;

export function boxesOf(page: Page | undefined): TextBox[] {
  return page?.boxes ?? [];
}

function mapBoxes(pages: Page[], pageId: string, fn: (boxes: TextBox[]) => TextBox[]): Page[] {
  return pages.map((p) => (p.id === pageId ? { ...p, boxes: fn(p.boxes ?? []) } : p));
}

export function addBox(pages: Page[], pageId: string, box: TextBox): Page[] {
  return mapBoxes(pages, pageId, (boxes) => [...boxes, box]);
}

export function patchBox(pages: Page[], pageId: string, boxId: string, patch: Partial<Omit<TextBox, "id" | "link">>): Page[] {
  return mapBoxes(pages, pageId, (boxes) => boxes.map((b) => (b.id === boxId ? { ...b, ...patch } : b)));
}

/** 상자를 지운다. 이 상자의 페이지 링크가 만든 돌아가기 링크도 함께 지운다 */
export function removeBox(pages: Page[], pageId: string, boxId: string): Page[] {
  return removeBackLinks(
    mapBoxes(pages, pageId, (boxes) => boxes.filter((b) => b.id !== boxId)),
    boxId,
  );
}

function removeBackLinks(pages: Page[], sourceBoxId: string): Page[] {
  return pages.map((p) =>
    p.boxes?.some((b) => b.backOf === sourceBoxId) ? { ...p, boxes: p.boxes.filter((b) => b.backOf !== sourceBoxId) } : p,
  );
}

/**
 * 상자의 링크를 바꾸거나(undefined면 없앤다) 새로 건다.
 * 다른 페이지로 가는 링크면 그 페이지에 "돌아가기" 링크를 자동으로 만든다 (이미 이 페이지로 가는 링크가 있으면 만들지 않음).
 */
export function setBoxLink(pages: Page[], pageId: string, boxId: string, link: BoxLink | undefined, addBack = true): Page[] {
  let next = removeBackLinks(pages, boxId);
  next = mapBoxes(next, pageId, (boxes) =>
    boxes.map((b) => {
      if (b.id !== boxId) return b;
      const { link: _old, ...rest } = b;
      return link ? { ...rest, link } : rest;
    }),
  );
  if (link?.type !== "page" || !addBack || link.pageId === pageId) return next;
  const target = next.find((p) => p.id === link.pageId);
  if (!target) return next;
  const targetBoxes = boxesOf(target);
  if (targetBoxes.some((b) => b.link?.type === "page" && b.link.pageId === pageId)) return next;
  const source = boxesOf(next.find((p) => p.id === pageId)).find((b) => b.id === boxId);
  const back: TextBox = {
    id: newId("b"),
    ...backSlot(targetBoxes),
    text: "",
    size: source?.size ?? DEFAULT_BOX_SIZE,
    color: LINK_COLOR,
    link: { type: "page", pageId },
    role: "back",
    backOf: boxId,
  };
  return addBox(next, target.id, back);
}

/** 돌아가기 링크 자리: 오른쪽 위부터 아래로 차례대로 */
function backSlot(existing: TextBox[]): { x: number; y: number } {
  const k = existing.filter((b) => b.role === "back").length;
  return { x: 0.68, y: Math.min(0.9, 0.03 + k * 0.07) };
}

/** 페이지를 복제할 때 상자도 새 id로 복사한다. 돌아가기 링크는 원래 링크와의 연결을 뗀다 */
export function copyBoxes(boxes: TextBox[] | undefined): TextBox[] | undefined {
  return boxes?.map(({ backOf: _backOf, ...b }) => ({ ...b, id: newId("b") }));
}

/** 연결한 페이지가 없어진 페이지 링크 */
export function isDangling(box: TextBox, pages: Page[]): boolean {
  return box.link?.type === "page" && !pages.some((p) => p.id === (box.link as { pageId: string }).pageId);
}

/** "3쪽" (숨긴 페이지면 "숨긴 쪽"), 없는 페이지면 null */
export function pageNumberLabel(pages: Page[], hidden: string[], pageId: string): string | null {
  if (!pages.some((p) => p.id === pageId)) return null;
  const pos = visiblePosition(pages, hidden, pageId);
  return pos.index >= 0 ? `${pos.index + 1}쪽` : "숨긴 쪽";
}

/** 화면에 보일 글자. 비어 있는 링크는 그때의 쪽 번호·사이트 이름으로 */
export function boxLabel(box: TextBox, pages: Page[], hidden: string[]): string {
  if (box.text.trim()) return box.text;
  const link = box.link;
  if (link?.type === "page") {
    const n = pageNumberLabel(pages, hidden, link.pageId);
    if (!n) return "연결된 페이지 없음";
    return box.role === "back" ? `↩ ${n}으로 돌아가기` : `${n}으로 가기 →`;
  }
  if (link?.type === "url") {
    try {
      return new URL(link.url).hostname.replace(/^www\./, "");
    } catch {
      return link.url;
    }
  }
  return "";
}
