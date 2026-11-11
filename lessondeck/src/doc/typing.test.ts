import { describe, expect, it } from "vitest";
import { borrowFinal, frameAt, hangulStages, typedLines, typingPlan } from "./typing";

const join = (plan: ReturnType<typeof typingPlan>, f: number) => typedLines(plan, f).map((l) => l.shown + l.comp).join("|");

describe("타자 효과 (v0.26)", () => {
  it("한글은 자모가 조합되며: ㅇ → 오 → 와 → 왕, 겹받침도 차례로", () => {
    expect(hangulStages("왕")).toEqual(["ㅇ", "오", "와", "왕"]);
    expect(hangulStages("건")).toEqual(["ㄱ", "거", "건"]);
    expect(hangulStages("닭")).toEqual(["ㄷ", "다", "달", "닭"]);
    expect(hangulStages("의")).toEqual(["ㅇ", "으", "의"]);
    expect(hangulStages("A")).toEqual(["A"]);
    expect(hangulStages("9")).toEqual(["9"]);
  });

  it("받침 없는 글자 뒤 자음은 잠깐 받침으로 (가 → 간 → 가나), ㄸ·ㅃ·ㅉ는 아님", () => {
    expect(borrowFinal("가", "나")).toBe("간");
    expect(borrowFinal("일", "곱")).toBe("읽");
    expect(borrowFinal("가", "까")).toBe("갂");
    expect(borrowFinal("가", "따")).toBeNull();
    expect(borrowFinal("강", "아")).toBeNull();
    expect(borrowFinal("가", "A")).toBeNull();
    const plan = typingPlan(["고려"]);
    const seen = plan.frames.map((_, i) => join(plan, i));
    expect(seen).toEqual(["ㄱ", "고", "골", "고려", "고려"]);
  });

  it("줄이 바뀌면 받침으로 붙지 않고, 다 친 장면은 원래 글 그대로, 자리는 늘 같은 글자 수", () => {
    const lines = ["왕건은 918년", "고려를 세웠다"];
    const plan = typingPlan(lines);
    const last = typedLines(plan, plan.frames.length - 1);
    expect(last.map((l) => l.shown)).toEqual(lines);
    expect(last.every((l) => !l.comp && !l.rest)).toBe(true);
    // 첫 줄 끝 "년" 뒤에 둘째 줄 "고"의 ㄱ이 받침으로 붙지 않음
    expect(plan.frames.some((f) => f.comp === "녁")).toBe(false);
    for (let i = 0; i < plan.frames.length; i++) {
      const t = typedLines(plan, i);
      t.forEach((l, k) => expect([...l.shown].length + [...l.comp].length + [...l.rest].length).toBe([...lines[k]].length));
      expect(t.filter((l) => l.caret).length).toBe(1);
    }
    // 처음엔 아무것도 안 보이고 커서는 첫 줄
    expect(join(plan, 0)).toBe("ㅇ|");
  });

  it("시간: 한 자에 0.1초 안팎, 아무리 길어도 2.6초 안에, 시각 → 장면", () => {
    const short = typingPlan(["삼국 통일"]);
    expect(short.total).toBeGreaterThan(400);
    expect(short.total).toBeLessThan(1400);
    const long = typingPlan(["가".repeat(400)]);
    expect(long.total).toBeLessThanOrEqual(2600 + 1);
    expect(frameAt(short, -5)).toBe(0);
    expect(frameAt(short, short.total + 100)).toBe(short.frames.length - 1);
    const mid = frameAt(short, short.total / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(short.frames.length - 1);
  });
});
