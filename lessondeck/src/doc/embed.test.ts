import { describe, expect, it } from "vitest";
import { toEmbeddableUrl } from "./embed";

describe("삽입용 주소로 바꾸기", () => {
  it("구글 슬라이드 편집·보기 주소 → embed", () => {
    expect(toEmbeddableUrl("https://docs.google.com/presentation/d/1AbC_d-E/edit#slide=id.p")).toBe(
      "https://docs.google.com/presentation/d/1AbC_d-E/embed?start=false&loop=false",
    );
    expect(toEmbeddableUrl("https://docs.google.com/presentation/d/e/2PACX-1vR/pub?start=false")).toBe(
      "https://docs.google.com/presentation/d/e/2PACX-1vR/embed?start=false&loop=false",
    );
  });

  it("구글 문서·시트 → preview, 게시한 문서 → embedded", () => {
    expect(toEmbeddableUrl("https://docs.google.com/document/d/1xyz/edit?usp=sharing")).toBe("https://docs.google.com/document/d/1xyz/preview");
    expect(toEmbeddableUrl("https://docs.google.com/spreadsheets/d/1sh/edit#gid=0")).toBe("https://docs.google.com/spreadsheets/d/1sh/preview");
    expect(toEmbeddableUrl("https://docs.google.com/document/d/e/2PACX-doc/pub")).toBe("https://docs.google.com/document/d/e/2PACX-doc/pub?embedded=true");
  });

  it("구글 설문 → embedded=true (다른 매개변수 유지)", () => {
    expect(toEmbeddableUrl("https://docs.google.com/forms/d/e/1FAIpQL/viewform?usp=sf_link")).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQL/viewform?usp=sf_link&embedded=true",
    );
  });

  it("구글 드라이브 파일 → preview", () => {
    expect(toEmbeddableUrl("https://drive.google.com/file/d/1file/view?usp=drive_link")).toBe("https://drive.google.com/file/d/1file/preview");
    expect(toEmbeddableUrl("https://drive.google.com/open?id=1open")).toBe("https://drive.google.com/file/d/1open/preview");
  });

  it("캔바 디자인 보기 → ?embed", () => {
    expect(toEmbeddableUrl("https://www.canva.com/design/DAF1/abc-Tok/view?utm_content=x")).toBe(
      "https://www.canva.com/design/DAF1/abc-Tok/view?utm_content=x&embed",
    );
  });

  it("그 밖의 주소는 그대로", () => {
    expect(toEmbeddableUrl("https://my-quiz.vercel.app/")).toBe("https://my-quiz.vercel.app/");
    expect(toEmbeddableUrl("not a url")).toBe("not a url");
  });
});
