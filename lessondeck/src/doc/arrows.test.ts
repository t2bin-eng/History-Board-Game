import { describe, expect, it } from "vitest";
import { addArrow, arrowColor, arrowShape, dropArrowsOf, flipArrow, remapArrows } from "./arrows";
import { removeBox } from "./boxes";
import type { Page } from "./types";

const page = (): Page =>
  ({
    id: "p1",
    kind: "blank",
    background: "plain",
    aspect: 1,
    boxes: [
      { id: "b1", x: 0.1, y: 0.1, text: "원인", size: 24, color: "#111111" },
      { id: "b2", x: 0.5, y: 0.1, text: "결과", size: 24, color: "#0050ff" },
    ],
  }) as Page;

describe("상자 잇는 화살표", () => {
  it("잇기: 같은 상자·없는 상자는 안 됨, 같은 방향은 하나만, 흰 글자는 검정 선", () => {
    let r = addArrow([page()], "p1", "b1", "b2", "#ffffff");
    expect(r.id).not.toBeNull();
    expect(r.pages[0].arrows).toHaveLength(1);
    expect(r.pages[0].arrows![0]).toMatchObject({ from: "b1", to: "b2", color: "#111111" });
    const again = addArrow(r.pages, "p1", "b1", "b2", "#ff1e1e");
    expect(again.pages[0].arrows).toHaveLength(1);
    expect(again.id).toBe(r.id);
    expect(addArrow(r.pages, "p1", "b1", "b1", "#111").id).toBeNull();
    expect(addArrow(r.pages, "p1", "b1", "zz", "#111").id).toBeNull();
    r = { pages: flipArrow(r.pages, "p1", r.id!), id: r.id };
    expect(r.pages[0].arrows![0]).toMatchObject({ from: "b2", to: "b1" });
    expect(arrowColor("#0050ff")).toBe("#0050ff");
  });

  it("상자를 지우면 그 상자의 화살표도, 복사하면 새 id로", () => {
    const { pages } = addArrow([page()], "p1", "b1", "b2", "#111111");
    expect(removeBox(pages, "p1", "b2")[0].arrows).toEqual([]);
    expect(dropArrowsOf(pages[0], "b1").arrows).toEqual([]);
    const copied = remapArrows(pages[0].arrows, new Map([["b1", "n1"], ["b2", "n2"]]))!;
    expect(copied[0]).toMatchObject({ from: "n1", to: "n2" });
    expect(copied[0].id).not.toBe(pages[0].arrows![0].id);
    expect(remapArrows(pages[0].arrows, new Map([["b1", "n1"]]))).toBeUndefined();
  });

  it("모양: 두 상자 테두리에서 잘린 선과 끝의 화살촉, 겹치면 없음", () => {
    const s = arrowShape({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 0, w: 100, h: 40 }, 3)!;
    // 가로로 나란한 두 상자: 선은 y=20, 왼쪽 상자 오른쪽 변(100) 뒤에서 시작, 화살촉 끝은 오른쪽 상자 왼쪽 변(300) 앞
    expect(s.line[1]).toBeCloseTo(20, 5);
    expect(s.line[0]).toBeGreaterThan(100);
    expect(s.heads).toHaveLength(1);
    expect(s.heads[0][0][0]).toBeLessThan(300);
    expect(s.heads[0][0][0]).toBeGreaterThan(290);
    expect(arrowShape({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 0, w: 100, h: 40 }, 3, true)!.heads).toHaveLength(2);
    expect(arrowShape({ x: 0, y: 0, w: 100, h: 40 }, { x: 50, y: 10, w: 100, h: 40 }, 3)).toBeNull();
  });
});
