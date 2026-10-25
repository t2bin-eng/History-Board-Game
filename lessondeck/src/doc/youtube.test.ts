import { describe, expect, it } from "vitest";
import { parseTime, parseYouTube, youtubeEmbedUrl, youtubeWatchUrl } from "./youtube";

describe("parseYouTube", () => {
  it("여러 형태의 유튜브 링크를 알아본다", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=aqz-KE-bpKQ")).toEqual({ videoId: "aqz-KE-bpKQ" });
    expect(parseYouTube("youtu.be/aqz-KE-bpKQ?t=90")).toEqual({ videoId: "aqz-KE-bpKQ", start: 90 });
    expect(parseYouTube("https://m.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s")).toEqual({ videoId: "aqz-KE-bpKQ", start: 90 });
    expect(parseYouTube("https://youtube.com/shorts/aqz-KE-bpKQ?feature=share")).toEqual({ videoId: "aqz-KE-bpKQ" });
    expect(parseYouTube("https://www.youtube.com/live/aqz-KE-bpKQ")).toEqual({ videoId: "aqz-KE-bpKQ" });
    expect(parseYouTube("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=30")).toEqual({ videoId: "aqz-KE-bpKQ", start: 30 });
  });

  it("재생목록 링크", () => {
    expect(parseYouTube("https://www.youtube.com/playlist?list=PL123abc")).toEqual({ list: "PL123abc" });
    expect(parseYouTube("https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=PL123abc")).toEqual({
      videoId: "aqz-KE-bpKQ",
      list: "PL123abc",
    });
  });

  it("유튜브가 아니거나 영상 id가 이상하면 null", () => {
    expect(parseYouTube("https://example.com/watch?v=aqz-KE-bpKQ")).toBeNull();
    expect(parseYouTube("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTube("https://www.youtube.com/@channel")).toBeNull();
    expect(parseYouTube("")).toBeNull();
  });
});

describe("parseTime", () => {
  it("초·분·시 표기", () => {
    expect(parseTime("90")).toBe(90);
    expect(parseTime("45s")).toBe(45);
    expect(parseTime("1h2m3s")).toBe(3723);
    expect(parseTime("abc")).toBeUndefined();
    expect(parseTime(null)).toBeUndefined();
  });
});

describe("embed / watch URL", () => {
  it("페이지 안 재생 주소와 유튜브에서 열기 주소", () => {
    const embed = new URL(youtubeEmbedUrl({ videoId: "aqz-KE-bpKQ", start: 90 }, "https://localhost"));
    expect(embed.hostname).toBe("www.youtube-nocookie.com");
    expect(embed.pathname).toBe("/embed/aqz-KE-bpKQ");
    expect(embed.searchParams.get("enablejsapi")).toBe("1");
    expect(embed.searchParams.get("origin")).toBe("https://localhost");
    expect(embed.searchParams.get("start")).toBe("90");
    expect(youtubeEmbedUrl({ list: "PL1" }, "https://a.b")).toContain("/embed/videoseries?");
    expect(youtubeWatchUrl({ videoId: "aqz-KE-bpKQ", start: 90 })).toBe("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=90s");
  });
});
