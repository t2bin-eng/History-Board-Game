import { afterEach, describe, expect, it } from "vitest";
import { AUTO_CHECK_MS, autoCheckDue, compareVersions, isSkipped, markChecked, parseRelease, skipVersion } from "./appUpdate";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};
afterEach(() => mem.clear());

describe("버전 비교", () => {
  it("숫자로 비교 (0.10 > 0.9), v 앞머리·꼬리 무시", () => {
    expect(compareVersions("0.10.0", "0.9.3")).toBe(1);
    expect(compareVersions("v0.34.0", "0.34.0")).toBe(0);
    expect(compareVersions("0.33.1", "0.34.0")).toBe(-1);
    expect(compareVersions("1.0", "0.99.9")).toBe(1);
    expect(compareVersions("0.34.0-beta", "0.34.0")).toBe(0);
  });
});

describe("GitHub 릴리스 읽기", () => {
  const ok = {
    tag_name: "v0.35.0",
    body: "레슨덱 v0.35.0: 무엇\\n\\n- 바뀐 것",
    html_url: "https://github.com/t2bin-eng/History-Board-Game/releases/tag/v0.35.0",
    published_at: "2026-11-23T01:00:00Z",
    assets: [
      { name: "other.txt", browser_download_url: "https://x/other.txt", size: 1 },
      { name: "lessondeck.apk", browser_download_url: "https://github.com/t2bin-eng/History-Board-Game/releases/download/v0.35.0/lessondeck.apk", size: 21000000 },
    ],
  };
  it("lessondeck.apk와 버전·설명을 꺼낸다", () => {
    const r = parseRelease(ok)!;
    expect(r.version).toBe("0.35.0");
    expect(r.url).toContain("/releases/download/v0.35.0/lessondeck.apk");
    expect(r.size).toBe(21000000);
    expect(r.notes).toContain("바뀐 것");
  });
  it("APK가 없거나, 버전 꼴이 아니거나, https가 아니면 없음", () => {
    expect(parseRelease({ ...ok, assets: [] })).toBeNull();
    expect(parseRelease({ ...ok, tag_name: "nightly" })).toBeNull();
    expect(parseRelease({ ...ok, assets: [{ name: "lessondeck.apk", browser_download_url: "http://x/lessondeck.apk" }] })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe("자동 확인·건너뛰기", () => {
  it("6시간에 한 번", () => {
    const now = 1_800_000_000_000;
    expect(autoCheckDue(now)).toBe(true);
    markChecked(now);
    expect(autoCheckDue(now + 60_000)).toBe(false);
    expect(autoCheckDue(now + AUTO_CHECK_MS + 1)).toBe(true);
    // 기기 시계가 뒤로 가면 다시 확인
    expect(autoCheckDue(now - 1000)).toBe(true);
  });
  it("건너뛴 버전과 그 이하는 알리지 않고, 더 새 버전은 다시 알린다", () => {
    expect(isSkipped("0.35.0")).toBe(false);
    skipVersion("0.35.0");
    expect(isSkipped("0.35.0")).toBe(true);
    expect(isSkipped("0.34.9")).toBe(true);
    expect(isSkipped("0.35.1")).toBe(false);
  });
});
