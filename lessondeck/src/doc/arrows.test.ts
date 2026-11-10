import { describe, expect, it } from "vitest";
import { addArrow, arrowColor, arrowShape, bendFromHandle, cleanBend, dropArrowsOf, flipArrow, moveArrowEnd, patchArrow, remapArrows, shapeOfArrow } from "./arrows";
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
    expect(s.curve[0][1]).toBeCloseTo(20, 5);
    expect(s.curve[2][1]).toBeCloseTo(20, 5);
    expect(s.curve[0][0]).toBeGreaterThan(100);
    expect(s.heads).toHaveLength(1);
    expect(s.heads[0][0][0]).toBeLessThan(300);
    expect(s.heads[0][0][0]).toBeGreaterThan(290);
    expect(arrowShape({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 0, w: 100, h: 40 }, 3, true)!.heads).toHaveLength(2);
    expect(arrowShape({ x: 0, y: 0, w: 100, h: 40 }, { x: 50, y: 10, w: 100, h: 40 }, 3)).toBeNull();
  });

  it("아무 곳 가리키기 (v0.24): 누른 곳에 촉 끝, 페이지 안으로, 끝 옮기기·상자에 붙이기", () => {
    const r = addArrow([page()], "p1", "b1", [0.4, 1.3], "#0050ff");
    const a = r.pages[0].arrows![0];
    expect(a).toMatchObject({ from: "b1", at: [0.4, 1], color: "#0050ff" });
    expect(a.to).toBeUndefined();
    // 같은 상자에서 여러 곳을 가리킬 수 있음
    const r2 = addArrow(r.pages, "p1", "b1", [0.6, 0.7], "#0050ff");
    expect(r2.pages[0].arrows).toHaveLength(2);
    // 상자 위로 옮기면 상자로 잇고, 다시 아무 곳으로
    let pages = moveArrowEnd(r.pages, "p1", a.id, "b2");
    expect(pages[0].arrows![0]).toMatchObject({ to: "b2" });
    expect(pages[0].arrows![0].at).toBeUndefined();
    pages = moveArrowEnd(pages, "p1", a.id, [0.2, 0.8]);
    expect(pages[0].arrows![0]).toMatchObject({ at: [0.2, 0.8] });
    expect(pages[0].arrows![0].to).toBeUndefined();
    expect(moveArrowEnd(pages, "p1", a.id, "b1")[0].arrows![0]).toMatchObject({ at: [0.2, 0.8] });
    // 가리키는 화살표는 방향 바꾸기 없음, 시작 상자만 있으면 복사·지우기 따라감
    expect(flipArrow(pages, "p1", a.id)[0].arrows![0]).toMatchObject({ from: "b1", at: [0.2, 0.8] });
    expect(remapArrows(pages[0].arrows, new Map([["b1", "n1"]]))![0]).toMatchObject({ from: "n1", at: [0.2, 0.8] });
    expect(dropArrowsOf(pages[0], "b1").arrows).toEqual([]);
    // 촉 끝이 그 점에 닿음 (페이지 1000×1000)
    const rects = new Map([["b1", { x: 100, y: 100, w: 100, h: 40 }]]);
    const s = shapeOfArrow(pages[0].arrows![0], rects, { width: 1000, height: 1000 }, 3)!;
    expect(s.tip[0]).toBeCloseTo(200, 3);
    expect(s.tip[1]).toBeCloseTo(800, 3);
    expect(s.heads[0][0]).toEqual(s.tip);
    // 끝이 시작 상자 안이면 그리지 않음
    expect(arrowShape({ x: 100, y: 100, w: 100, h: 40 }, [150, 110], 3)).toBeNull();
  });

  it("휘기 (v0.24): 곡선 가운데가 곧은 선에서 bend × 길이만큼 오른쪽, 손잡이로 bend, 거의 곧으면 곧게", () => {
    const a = { x: 0, y: 0, w: 100, h: 40 };
    const s = arrowShape(a, [450, 20], 3, false, 0.25)!;
    // 가운데 (50,20) → (450,20): 길이 400, 오른쪽(화면 아래)으로 100
    expect(s.mid[0]).toBeCloseTo(250, 5);
    expect(s.mid[1]).toBeCloseTo(120, 5);
    // 촉은 곡선이 끝나는 방향(위에서 내려와 오른쪽 위로 올라오며 끝남)
    expect(s.tip).toEqual([450, 20]);
    const [, w1, w2] = s.heads[0];
    expect((w1[1] + w2[1]) / 2).toBeGreaterThan(20);
    expect(bendFromHandle([50, 20], [450, 20], 250, 120)).toBeCloseTo(0.25, 5);
    expect(bendFromHandle([50, 20], [450, 20], 250, -60)).toBeCloseTo(-0.2, 5);
    expect(cleanBend(0.02)).toBeUndefined();
    expect(cleanBend(-1.5)).toBe(-0.8);
    // 곧게 되면 bend를 빼 둠, 방향을 바꾸면 휜 쪽이 그대로 보이게 부호를 바꿈
    let { pages, id } = addArrow([page()], "p1", "b1", "b2", "#111111");
    pages = patchArrow(pages, "p1", id!, { bend: 0.3 });
    expect(flipArrow(pages, "p1", id!)[0].arrows![0].bend).toBe(-0.3);
    pages = patchArrow(pages, "p1", id!, { bend: undefined });
    expect("bend" in pages[0].arrows![0]).toBe(false);
  });
});
