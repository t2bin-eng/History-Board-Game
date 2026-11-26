import { describe, expect, it } from "vitest";
import { bounceRelation, endVelocity, type PenLift } from "./bounce";

const lift = (o: Partial<PenLift> = {}): PenLift => ({ id: "a", raw: [], t: 1000, end: [100, 100], vel: [1.5, 0], len: 40, style: "pen", ...o });

describe("펜이 잠깐 튄 획 잇기 (v0.53)", () => {
  it("움직이며 뗀 뒤 40ms 안에 그 방향으로 다시 닿으면 잇는다", () => {
    // 1.5px/ms로 오른쪽 → 20ms 뒤 30px 오른쪽
    expect(bounceRelation(lift(), 1020, [130, 101], "pen", 3)).toBe("join");
    expect(bounceRelation(lift(), 1008, [112, 100], "pen", 3)).toBe("join");
  });

  it("오래 떴거나, 멈춰서 뗐거나, 다른 방향·다른 자리·다른 펜이면 따로", () => {
    expect(bounceRelation(lift(), 1060, [190, 100], "pen", 3)).toBeNull();
    expect(bounceRelation(lift({ vel: [0.05, 0] }), 1020, [101, 100], "pen", 3)).toBeNull();
    expect(bounceRelation(lift(), 1020, [100, 130], "pen", 3)).toBeNull();
    expect(bounceRelation(lift(), 1020, [80, 100], "pen", 3)).toBeNull();
    expect(bounceRelation(lift(), 1020, [130, 101], "hl", 3)).toBeNull();
    // 다음 글자로 옮겨 쓴 획 (빨라도 60ms 넘게 걸리고 자리도 다름)
    expect(bounceRelation(lift(), 1070, [160, 80], "pen", 3)).toBeNull();
  });

  it("닿는 순간 튄 점: 아주 짧은 앞 획 자리에서 곧 다시 시작하면 점을 버린다", () => {
    expect(bounceRelation(lift({ len: 1.2, vel: [0, 0] }), 1030, [101.5, 101], "pen", 3)).toBe("dropDot");
    // 일부러 찍은 점(마침표 등) 뒤 다른 자리에서 시작한 획은 그대로
    expect(bounceRelation(lift({ len: 1.2, vel: [0, 0] }), 1030, [120, 100], "pen", 3)).toBeNull();
    expect(bounceRelation(lift({ len: 1.2, vel: [0, 0] }), 1200, [101, 100], "pen", 3)).toBeNull();
  });

  it("끝 속도는 마지막 12ms의 움직임", () => {
    const s = Array.from({ length: 10 }, (_, i) => ({ x: i * 2, y: 0, t: i * 4 }));
    const [vx, vy] = endVelocity(s);
    expect(vx).toBeCloseTo(0.5, 5);
    expect(vy).toBe(0);
  });
});
