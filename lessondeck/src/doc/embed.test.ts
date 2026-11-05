import { describe, expect, it } from "vitest";
import { isShortMapLink, toEmbeddableUrl } from "./embed";

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

  it("구글 지도: 장소 → 이름으로 찾고 장소 좌표를 중심으로 (output=embed)", () => {
    const url = toEmbeddableUrl(
      "https://www.google.com/maps/place/%EA%B2%BD%EB%B3%B5%EA%B6%81/@37.5796212,126.9748523,17z/data=!3m1!4b1!4m6!3m5!1s0x357ca2c74aeddea1:0x8b3046532cc715f6!8m2!3d37.5796212!4d126.9770162!16zL20vMDM5dHJw?entry=ttu",
    );
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://maps.google.com/maps");
    expect(u.searchParams.get("q")).toBe("경복궁");
    expect(u.searchParams.get("ll")).toBe("37.5796212,126.9770162");
    expect(u.searchParams.get("z")).toBe("17");
    expect(u.searchParams.get("output")).toBe("embed");
    expect(u.searchParams.get("t")).toBeNull();
  });

  it("구글 지도: 검색·길찾기·지도 위치·위성", () => {
    const p = (url: string) => Object.fromEntries(new URL(toEmbeddableUrl(url)).searchParams);
    expect(p("https://www.google.co.kr/maps/search/%EA%B3%B5%EC%82%B0%EC%84%B1/@36.46,127.12,14z")).toMatchObject({ q: "공산성", ll: "36.46,127.12", z: "14", output: "embed" });
    expect(p("https://www.google.com/maps/dir/%EC%84%9C%EC%9A%B8%EC%97%AD/%EA%B2%BD%EB%B3%B5%EA%B6%81/@37.56,126.97,14z/data=!4m2!4m1!3e3")).toMatchObject({ saddr: "서울역", daddr: "경복궁", output: "embed" });
    expect(p("https://www.google.com/maps/@37.5665,126.978,12z")).toMatchObject({ ll: "37.5665,126.978", z: "12", output: "embed" });
    expect(p("https://www.google.com/maps/@37.5665,126.978,1000m/data=!3m1!1e3")).toMatchObject({ ll: "37.5665,126.978", z: "15", t: "k" });
    expect(p("https://maps.google.com/?q=Gyeongbokgung+Palace&ftid=0x357ca2c74aeddea1:0x8b3046532cc715f6&entry=gps")).toMatchObject({ q: "Gyeongbokgung Palace", output: "embed" });
    expect(p("https://www.google.com/maps/search/?api=1&query=%EC%B2%A8%EC%84%B1%EB%8C%80")).toMatchObject({ q: "첨성대", output: "embed" });
  });

  it("구글 지도: 퍼가기 주소는 그대로, 짧은 공유 주소 알아보기", () => {
    const embed = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3162.5!2d126.97!3d37.57";
    expect(toEmbeddableUrl(embed)).toBe(embed);
    expect(isShortMapLink("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isShortMapLink("https://goo.gl/maps/AbCdEf123")).toBe(true);
    expect(isShortMapLink("https://goo.gl/abc")).toBe(false);
    // 구글 검색 등 지도가 아닌 주소는 그대로
    expect(toEmbeddableUrl("https://www.google.com/search?q=maps")).toBe("https://www.google.com/search?q=maps");
  });
});
