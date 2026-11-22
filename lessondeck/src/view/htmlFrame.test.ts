import { describe, expect, it } from "vitest";
import { guardHtml } from "./htmlFrame";

const MARK = "<script data-lessondeck-guard>";

describe("HTML 페이지 안내 스크립트 (v0.33.1)", () => {
  it("<head> 바로 뒤에 넣는다 (페이지 스크립트보다 먼저)", () => {
    const out = guardHtml('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><script>page()</script></head><body></body></html>');
    expect(out.startsWith('<!DOCTYPE html><html lang="ko"><head>' + MARK)).toBe(true);
    expect(out.indexOf(MARK)).toBeLessThan(out.indexOf("page()"));
  });
  it("<head>가 없으면 <html> 뒤, 그것도 없으면 <!DOCTYPE> 뒤 (호환 모드가 되지 않게)", () => {
    expect(guardHtml("<html><body>x</body></html>").startsWith("<html>" + MARK)).toBe(true);
    expect(guardHtml("<!doctype html>\n<p>x</p>").startsWith("<!doctype html>" + MARK)).toBe(true);
    expect(guardHtml("<p>x</p>").startsWith(MARK)).toBe(true);
  });
  it("<header>를 <head>로 착각하지 않는다", () => {
    const out = guardHtml("<!DOCTYPE html><html><body><header>제목</header></body></html>");
    expect(out.startsWith("<!DOCTYPE html><html>" + MARK)).toBe(true);
  });
  it("원래 내용은 그대로", () => {
    const html = "<!DOCTYPE html><html><head><title>t</title></head><body><a href=\"#a\">a</a></body></html>";
    expect(guardHtml(html).replace(/<script data-lessondeck-guard>[\s\S]*?<\/script>/, "")).toBe(html);
  });
});
