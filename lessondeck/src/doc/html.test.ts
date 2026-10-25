import { describe, expect, it } from "vitest";
import { analyzeHtml, decodeHtml, normalizeUrl, sniffCharset } from "./html";

describe("sniffCharset / decodeHtml", () => {
  it("meta charset으로 EUC-KR 파일을 알아본다", () => {
    expect(sniffCharset('<meta charset="euc-kr">')).toBe("euc-kr");
    expect(sniffCharset('<meta http-equiv="Content-Type" content="text/html; charset=ks_c_5601-1987">')).toBe("euc-kr");
    expect(sniffCharset("<meta charset=utf-8>")).toBe("utf-8");
    expect(sniffCharset("<html>")).toBe("utf-8");
  });

  it("UTF-8 한글을 그대로 읽는다", () => {
    const bytes = new TextEncoder().encode("<p>동아시아</p>");
    expect(decodeHtml(bytes.buffer as ArrayBuffer)).toBe("<p>동아시아</p>");
  });

  it("EUC-KR 한글을 읽는다", () => {
    // EUC-KR에서 "한" = C7 D1
    const head = new TextEncoder().encode('<meta charset="euc-kr"><p>');
    const bytes = new Uint8Array([...head, 0xc7, 0xd1]);
    expect(decodeHtml(bytes.buffer)).toBe('<meta charset="euc-kr"><p>한');
  });
});

describe("analyzeHtml", () => {
  it("외부 라이브러리(CDN)를 찾는다", () => {
    expect(analyzeHtml('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>')).toHaveLength(1);
    expect(analyzeHtml('<link rel="stylesheet" href="//fonts.googleapis.com/css">')).toHaveLength(1);
    expect(analyzeHtml("<style>@import url('https://fonts.googleapis.com/css2');</style>")).toHaveLength(1);
  });

  it("같은 폴더 파일과 localStorage 사용을 찾는다", () => {
    const w = analyzeHtml('<img src="images/map.png"><script>localStorage.setItem("a","b")</script>');
    expect(w).toHaveLength(2);
  });

  it("한 파일로 완결된 HTML은 경고가 없다", () => {
    expect(analyzeHtml('<style>body{}</style><script>let x = 1</script><img src="data:image/png;base64,AAA"><a href="#q1">')).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  it("https를 붙이고 형식을 확인한다", () => {
    expect(normalizeUrl("example.vercel.app")).toBe("https://example.vercel.app/");
    expect(normalizeUrl(" https://a.b/c?d=1 ")).toBe("https://a.b/c?d=1");
    expect(normalizeUrl("http://a.b")).toBe("http://a.b/");
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("퀴즈")).toBeNull();
  });
});
