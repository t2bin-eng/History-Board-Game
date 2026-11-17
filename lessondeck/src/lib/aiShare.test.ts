import { describe, expect, it } from "vitest";
import { AI_APPS, lastAiApp } from "./aiShare";

describe("AI로 보내기 앱 (v0.31)", () => {
  it("Claude · ChatGPT · Gemini 안드로이드 패키지", () => {
    expect(AI_APPS.map((a) => [a.id, a.label, a.pkg])).toEqual([
      ["claude", "Claude", "com.anthropic.claude"],
      ["chatgpt", "ChatGPT", "com.openai.chatgpt"],
      ["gemini", "Gemini", "com.google.android.apps.bard"],
    ]);
    for (const a of AI_APPS) expect(a.web).toMatch(/^https:\/\//);
  });

  it("기억한 앱이 없거나 이상하면 Claude", () => {
    expect(lastAiApp()).toBe("claude");
  });
});
