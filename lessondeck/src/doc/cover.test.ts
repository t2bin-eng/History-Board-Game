import { describe, expect, it } from "vitest";
import { contrast } from "./colors";
import { autoCoverColor, COVER_COLORS, coverLook, splitCoverTitle } from "./cover";

describe("표지", () => {
  it("차시 번호와 제목을 나눈다", () => {
    expect(splitCoverTitle("33. 동아시아의 기후·환경 문제·기념관과 기념행사")).toEqual({ num: "33", title: "동아시아의 기후·환경 문제·기념관과 기념행사" });
    expect(splitCoverTitle("25. 전염병의 확산(2)")).toEqual({ num: "25", title: "전염병의 확산(2)" });
    expect(splitCoverTitle("7.고려의 건국")).toEqual({ num: "7", title: "고려의 건국" });
    expect(splitCoverTitle("3) 임진왜란")).toEqual({ num: "3", title: "임진왜란" });
    expect(splitCoverTitle("3차시 고려의 건국")).toEqual({ num: "3", unit: "차시", title: "고려의 건국" });
    expect(splitCoverTitle("12강 냉전")).toEqual({ num: "12", unit: "강", title: "냉전" });
    expect(splitCoverTitle("3-1 고려의 성립")).toEqual({ num: "3-1", title: "고려의 성립" });
    expect(splitCoverTitle("4 조선의 건국")).toEqual({ num: "4", title: "조선의 건국" });
  });

  it("번호가 아닌 숫자는 그대로 둔다", () => {
    expect(splitCoverTitle("6.25 전쟁")).toEqual({ title: "6.25 전쟁" });
    expect(splitCoverTitle("1592 임진왜란")).toEqual({ title: "1592 임진왜란" });
    expect(splitCoverTitle("19세기 조선")).toEqual({ title: "19세기 조선" });
    expect(splitCoverTitle("새 노트")).toEqual({ title: "새 노트" });
    expect(splitCoverTitle("33.")).toEqual({ title: "33." });
  });

  it("표지 색은 흰 글자가 잘 보이고, 자동 색은 문서마다 늘 같다", () => {
    for (const c of COVER_COLORS) expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(new Set(COVER_COLORS).size).toBe(COVER_COLORS.length);
    expect(autoCoverColor("doc-abc")).toBe(autoCoverColor("doc-abc"));
    const used = new Set(Array.from({ length: 60 }, (_, i) => autoCoverColor(`doc-${i}-x`)));
    expect(used.size).toBeGreaterThanOrEqual(8);
    expect(coverLook("d", "page", false)).toEqual({ type: "color", color: autoCoverColor("d") });
    expect(coverLook("d", "page", true)).toEqual({ type: "page" });
    expect(coverLook("d", "#7a2e4a", true)).toEqual({ type: "color", color: "#7a2e4a" });
    expect(coverLook("d", undefined, true)).toEqual({ type: "color", color: autoCoverColor("d") });
  });
});
