import { describe, expect, it } from "vitest";
import { josa } from "./josa";

describe("josa", () => {
  it("받침에 맞춘다 (따옴표는 건너뜀)", () => {
    expect(josa("‘3단원’", "을", "를")).toBe("‘3단원’을");
    expect(josa("‘동아시아사’", "을", "를")).toBe("‘동아시아사’를");
    expect(josa("‘내 문서’", "으로", "로")).toBe("‘내 문서’로");
    expect(josa("‘2단원 고려’", "으로", "로")).toBe("‘2단원 고려’로");
    expect(josa("‘3단원’", "으로", "로")).toBe("‘3단원’으로");
    expect(josa("‘Quiz’", "을", "를")).toBe("‘Quiz’을(를)");
  });
});
