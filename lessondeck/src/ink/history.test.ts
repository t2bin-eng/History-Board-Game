import { describe, expect, it } from "vitest";
import { emptyHistory, inkReducer, type InkHistory } from "./history";
import type { Stroke } from "./types";

const s = (id: string): Stroke => ({ id, tool: "pen", color: "#000", width: 2, points: [[0, 0, 0.5]] });

function commit(state: InkHistory, strokes: Stroke[]) {
  return inkReducer(state, { type: "commit", strokes });
}

describe("inkReducer", () => {
  it("획 추가 → 실행 취소 → 다시 실행", () => {
    const a = s("a");
    const b = s("b");
    let st = commit(emptyHistory, [a]);
    st = commit(st, [a, b]);
    expect(st.present.map((x) => x.id)).toEqual(["a", "b"]);

    st = inkReducer(st, { type: "undo" });
    expect(st.present.map((x) => x.id)).toEqual(["a"]);
    st = inkReducer(st, { type: "undo" });
    expect(st.present).toEqual([]);
    expect(inkReducer(st, { type: "undo" })).toBe(st);

    st = inkReducer(st, { type: "redo" });
    st = inkReducer(st, { type: "redo" });
    expect(st.present.map((x) => x.id)).toEqual(["a", "b"]);
    expect(inkReducer(st, { type: "redo" })).toBe(st);
  });

  it("새 획을 그으면 다시 실행 목록이 비워진다", () => {
    let st = commit(emptyHistory, [s("a")]);
    st = inkReducer(st, { type: "undo" });
    st = commit(st, [s("c")]);
    expect(st.future).toEqual([]);
  });

  it("페이지 지우기도 실행 취소할 수 있다", () => {
    let st = commit(emptyHistory, [s("a"), s("b")]);
    st = inkReducer(st, { type: "clear" });
    expect(st.present).toEqual([]);
    st = inkReducer(st, { type: "undo" });
    expect(st.present).toHaveLength(2);
  });

  it("기록은 최대 100단계까지 보관한다", () => {
    let st = emptyHistory;
    for (let i = 0; i < 150; i++) st = commit(st, [s(String(i))]);
    expect(st.past).toHaveLength(100);
  });
});
