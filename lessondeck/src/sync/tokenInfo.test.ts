import { describe, expect, it } from "vitest";
import { parseTokenInfo, projectOf } from "./tokenInfo";

describe("tokenInfo", () => {
  it("클라이언트 ID 앞의 숫자가 프로젝트 번호", () => {
    expect(projectOf("325753720508-2b9vs0nukm5aqo3q90gmro646jfqi43s.apps.googleusercontent.com")).toBe("325753720508");
    expect(projectOf("226543437007-93s1r6fm90cllqnoovmcdbqnhnmeipkd.apps.googleusercontent.com")).toBe("226543437007");
    expect(projectOf("abc-123.apps.googleusercontent.com")).toBeUndefined();
    expect(projectOf("325753720508-x.example.com")).toBeUndefined();
    expect(projectOf("")).toBeUndefined();
  });

  it("tokeninfo 응답: azp를 먼저, 없으면 aud", () => {
    expect(
      parseTokenInfo({
        azp: "325753720508-a.apps.googleusercontent.com",
        aud: "999-b.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/drive.appdata",
        expires_in: "3500",
      }),
    ).toEqual({ clientId: "325753720508-a.apps.googleusercontent.com", project: "325753720508" });
    expect(parseTokenInfo({ aud: "226543437007-b.apps.googleusercontent.com" })).toEqual({
      clientId: "226543437007-b.apps.googleusercontent.com",
      project: "226543437007",
    });
  });

  it("오류 응답·엉뚱한 값은 null", () => {
    expect(parseTokenInfo({ error: "invalid_token", error_description: "Invalid Value" })).toBeNull();
    expect(parseTokenInfo(null)).toBeNull();
    expect(parseTokenInfo("x")).toBeNull();
    expect(parseTokenInfo({ azp: 5 })).toBeNull();
  });
});
