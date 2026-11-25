import { describe, expect, it } from "vitest";
import { COVER_ART_SETS } from "../doc/cover";
import { art, COVER_ART_LABELS, coverArtUrl, subjectArt } from "./art";

describe("테마 그림 (v0.49)", () => {
  it("테마마다 같은 이름의 그림, 없으면 다음 이름·살구빛 공책 그림", () => {
    expect(art("home-actions/pdf-new", "apricot")).toMatch(/pdf-new/);
    expect(art("home-actions/pdf-new", "water-lily")).toMatch(/pdf-new/);
    expect(art("home-actions/pdf-new", "apricot")).not.toBe(art("home-actions/pdf-new", "water-lily"));
    // 캘리그래피 펜 그림은 수련 정원에만 → 살구빛 공책은 스타일러스
    expect(art(["editor-tools/calligraphy-pen", "editor-tools/stylus"], "water-lily")).toMatch(/calligraphy-pen/);
    expect(art(["editor-tools/calligraphy-pen", "editor-tools/stylus"], "apricot")).toMatch(/stylus/);
    // 홈 머리 그림은 수련 정원에만
    expect(art("backgrounds/garden-banner", "water-lily")).toMatch(/garden-banner/);
    expect(art("backgrounds/garden-banner", "apricot")).toBe("");
    expect(art("no/such", "water-lily")).toBe("");
  });

  it("모든 표지 그림에 이름과 그림이 있다", () => {
    for (const set of Object.values(COVER_ART_SETS)) {
      expect(set.length).toBe(6);
      for (const id of set) {
        expect(COVER_ART_LABELS[id]).toBeTruthy();
        expect(coverArtUrl(id)).toMatch(new RegExp(id));
      }
    }
  });

  it("과목 그림: 영어·영어 회화는 그 그림(없는 테마는 국어 그림), 서양 회화는 세계사", () => {
    expect(subjectArt("영어")).toEqual(["subjects/english", "subjects/language-arts"]);
    expect(subjectArt("영어 회화")?.[0]).toBe("subjects/english-conversation");
    expect(subjectArt("서양 회화")).toEqual(["subjects/world-history"]);
    expect(art(subjectArt("영어")!, "apricot")).toMatch(/language-arts/);
    expect(art(subjectArt("영어")!, "water-lily")).toMatch(/english/);
    expect(subjectArt("국어")).toEqual(["subjects/language-arts"]);
    expect(subjectArt("잡동사니")).toBeNull();
  });
});
