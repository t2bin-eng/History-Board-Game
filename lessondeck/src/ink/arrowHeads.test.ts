import { describe, expect, it } from "vitest";
import { arrowShape, flipArrow } from "../doc/arrows";
import type { Page } from "../doc/types";
import { ARROW_HEADS, headParts, trimEnd } from "./arrowHeads";
import { flipLineSpec, lineEnds, lineSpec, shapeFillsPx, shapePathsPx, shapeStrokePath } from "./shapes";

const page = { width: 1000, height: 700 };

describe("화살촉 모양 (v0.30)", () => {
  it("여섯 가지: 열린 V·막대는 선, 삼각형·동그라미·마름모는 채운 면(몸통은 안쪽에서 끊음), 없음은 아무것도", () => {
    expect(ARROW_HEADS.map((h) => h.id)).toEqual(["open", "tri", "dot", "diamond", "bar", "none"]);
    const at = (s: Parameters<typeof headParts>[0]) => headParts(s, [100, 0], [1, 0], 20, 3);
    expect(at("open")).toMatchObject({ fills: [], inset: 0 });
    expect(at("open").lines[0][1]).toEqual([100, 0]);
    expect(at("bar").lines[0].every(([x]) => Math.abs(x - 100) < 1e-9)).toBe(true);
    expect(at("tri").fills[0][0]).toEqual([100, 0]);
    expect(at("tri").inset).toBeCloseTo(12, 6);
    // 동그라미는 촉 끝에 닿는 원, 몸통은 원 가운데까지
    const dot = at("dot");
    const r = dot.inset;
    expect(Math.max(...dot.fills[0].map(([x]) => x))).toBeCloseTo(100, 6);
    expect(Math.min(...dot.fills[0].map(([x]) => x))).toBeCloseTo(100 - 2 * r, 6);
    expect(Math.min(...at("diamond").fills[0].map(([x]) => x))).toBeCloseTo(76, 6);
    expect(at("none")).toEqual({ lines: [], fills: [], inset: 0 });
    expect(trimEnd([[0, 0], [10, 0], [20, 0]], 15)).toEqual([[0, 0], [5, 0]]);
  });

  it("글상자 화살표: 방향 바꾸기 — 상자끼리는 맞바꾸고, 아무 곳은 촉이 상자 쪽(rev)으로, 다시 누르면 제자리", () => {
    const pg = (arrows: Page["arrows"]): Page[] => [{ id: "p", kind: "blank", background: "plain", aspect: 1, arrows } as Page];
    let ps = flipArrow(pg([{ id: "a", from: "b1", at: [0.5, 0.5], color: "#000" }]), "p", "a");
    expect(ps[0].arrows![0].rev).toBe(true);
    ps = flipArrow(ps, "p", "a");
    expect("rev" in ps[0].arrows![0]).toBe(false);
    ps = flipArrow(pg([{ id: "a", from: "b1", to: "b2", color: "#000" }]), "p", "a");
    expect(ps[0].arrows![0]).toMatchObject({ from: "b2", to: "b1" });
    // rev: 촉이 시작(상자) 쪽, 끝 손잡이는 그대로 가리키는 곳
    const box = { x: 0, y: 0, w: 100, h: 40 };
    const s = arrowShape(box, [400, 20], 3, false, 0, "tri", true)!;
    expect(s.heads.fills).toHaveLength(1);
    expect(s.heads.fills[0][0][0]).toBeLessThan(120);
    expect(s.tip[0]).toBeCloseTo(400, 6);
    // 동그라미 촉, 양쪽 → 두 개
    expect(arrowShape(box, [400, 20], 3, true, 0, "dot")!.heads.fills).toHaveLength(2);
    expect(arrowShape(box, [400, 20], 3, false, 0, "open")!.heads.lines).toHaveLength(1);
  });

  it("펜 화살표 도형: 촉 모양대로, 채운 촉은 면으로 그림, 방향 바꾸기는 두 끝 맞바꿈(모양 그대로)", () => {
    const spec = lineSpec("arrow", [100, 300], [500, 300], page);
    expect(spec.head).toBeUndefined();
    // 기본 열린 V: 0.29와 같이 [몸통, 날개]
    expect(shapePathsPx(spec, page, 3)).toHaveLength(2);
    expect(shapeFillsPx(spec, page, 3)).toHaveLength(0);
    const tri = { ...spec, head: "tri" as const };
    const fills = shapeFillsPx(tri, page, 3);
    expect(fills).toHaveLength(1);
    expect(fills[0][0][0]).toBeCloseTo(500, 3);
    // 몸통은 촉 안쪽에서 끝남
    const trunk = shapePathsPx(tri, page, 3)[0];
    expect(trunk[trunk.length - 1][0]).toBeLessThan(495);
    expect(shapeStrokePath({ id: "s", tool: "pen", color: "#000", width: 3, points: [], shape: tri }, page).split("M").length).toBeGreaterThan(5);
    // 방향 바꾸기
    const curved = { ...spec, curve: [-0.2, 0.3, 0.2, 0.1] as [number, number, number, number] };
    const f = flipLineSpec(curved);
    const [a0, b0] = lineEnds(curved, page);
    const [a1, b1] = lineEnds(f, page);
    expect(a1[0]).toBeCloseTo(b0[0], 6);
    expect(b1[0]).toBeCloseTo(a0[0], 6);
    // 곡선 위 점들이 같은 자리 (순서만 거꾸로)
    const p0 = shapePathsPx({ ...curved, kind: "line" }, page, 3)[0];
    const p1 = shapePathsPx({ ...f, kind: "line" }, page, 3)[0];
    expect(p1[10][0]).toBeCloseTo(p0[p0.length - 11][0], 6);
    expect(p1[10][1]).toBeCloseTo(p0[p0.length - 11][1], 6);
  });
});
