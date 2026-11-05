import { describe, expect, it } from "vitest";
import { recognizeShape, type Pt } from "./shapeRecognize";

// 실제 손으로 그린 사각형처럼: 모서리가 둥글고, 변이 살짝 휘고, 아무 데서나 시작해 지나치거나 덜 닫고, 조금 기울고, 떨림
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
}

interface RectOpts {
  w: number;
  h: number;
  round: number; // 모서리 반지름 / 짧은 변
  bow: number; // 변 휨 / 변 길이
  start: number; // 둘레의 어디서 시작 (0~1)
  close: number; // 1 = 딱 닫음, 1.1 = 10% 지나침, 0.93 = 덜 닫음
  tilt: number; // 도
  jitter: number;
  seed: number;
}

function handRect(o: RectOpts): Pt[] {
  const r = rng(o.seed);
  const rad = Math.min(o.w, o.h) * o.round;
  // 둥근 모서리 사각형 둘레를 고르게 찍기
  const path: Pt[] = [];
  const corners: [number, number, number][] = [
    [o.w / 2 - rad, -o.h / 2 + rad, -90],
    [o.w / 2 - rad, o.h / 2 - rad, 0],
    [-o.w / 2 + rad, o.h / 2 - rad, 90],
    [-o.w / 2 + rad, -o.h / 2 + rad, 180],
  ];
  for (let c = 0; c < 4; c++) {
    const [x, y, a0] = corners[c];
    const [nx, ny] = corners[(c + 1) % 4];
    for (let k = 0; k <= 8; k++) {
      const t = ((a0 + k * (90 / 8)) * Math.PI) / 180;
      path.push([x + Math.cos(t) * rad, y + Math.sin(t) * rad]);
    }
    // 다음 모서리까지 곧은 변 (조금 휨)
    const ex = x + Math.cos(((a0 + 90) * Math.PI) / 180) * rad;
    const ey = y + Math.sin(((a0 + 90) * Math.PI) / 180) * rad;
    const tx = nx + Math.cos(((a0 + 90) * Math.PI) / 180) * rad;
    const ty = ny + Math.sin(((a0 + 90) * Math.PI) / 180) * rad;
    const len = Math.hypot(tx - ex, ty - ey);
    const n = Math.max(2, Math.round(len / 6));
    const ox = Math.cos(((a0 + 90) * Math.PI) / 180);
    const oy = Math.sin(((a0 + 90) * Math.PI) / 180);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      const b = Math.sin(f * Math.PI) * o.bow * len;
      path.push([ex + (tx - ex) * f + ox * b, ey + (ty - ey) * f + oy * b]);
    }
  }
  const total = path.length;
  const startI = Math.floor(o.start * total);
  const count = Math.round(total * o.close);
  const out: Pt[] = [];
  const t = (o.tilt * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const [x, y] = path[(startI + i) % total];
    out.push([400 + x * Math.cos(t) - y * Math.sin(t) + r() * o.jitter, 400 + x * Math.sin(t) + y * Math.cos(t) + r() * o.jitter]);
  }
  return out;
}

describe("실제 손그림 같은 사각형", () => {
  it("둥근 모서리·휜 변·아무 데서 시작·지나침/덜 닫음·기울기", () => {
    const misses: string[] = [];
    let n = 0;
    for (const round of [0.05, 0.15, 0.3]) {
      for (const bow of [0, 0.03, 0.06]) {
        for (const start of [0, 0.12, 0.4]) {
          for (const close of [0.94, 1, 1.08]) {
            for (const tilt of [0, 4, 20]) {
              n++;
              const pts = handRect({ w: 320, h: 200, round, bow, start, close, tilt, jitter: 3, seed: n });
              const g = recognizeShape(pts);
              if (g?.kind !== "rect") misses.push(`r${round} b${bow} s${start} c${close} t${tilt} → ${g?.kind ?? "null"}`);
            }
          }
        }
      }
    }
    // 실패 목록을 보여 주고, 95% 이상 맞혀야 한다
    if (misses.length) console.log(`${misses.length}/${n} 놓침:\n` + misses.slice(0, 30).join("\n"));
    expect(misses.length / n).toBeLessThan(0.05);
  });

  it("손그림 원·타원(울퉁불퉁, 덜 닫음·지나침)은 사각형이 되지 않는다", () => {
    const misses: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 7);
      const a = 120;
      const b = 120 * (0.5 + Math.abs(r()));
      const wob = 0.04 + Math.abs(r()) * 0.08;
      const sweep = 340 + Math.abs(r()) * 50;
      const pts: Pt[] = [];
      for (let d = 0; d <= sweep; d += 4) {
        const t = (d * Math.PI) / 180;
        const k = 1 + Math.sin(t * 3 + seed) * wob;
        pts.push([400 + Math.cos(t) * a * k + r() * 3, 400 + Math.sin(t) * b * k + r() * 3]);
      }
      const g = recognizeShape(pts);
      if (g?.kind !== "ellipse") misses.push(`seed ${seed} → ${g?.kind ?? "null"}`);
    }
    if (misses.length) console.log(misses.join("\n"));
    expect(misses.length).toBeLessThanOrEqual(2);
  });

  it("손그림 삼각형(둥근 꼭짓점, 덜 닫음)", () => {
    const misses: string[] = [];
    let n = 0;
    for (const close of [0.94, 1, 1.06]) {
      for (const tri of [
        [[400, 200], [560, 470], [240, 468]],
        [[300, 220], [600, 300], [360, 480]],
        [[260, 220], [260, 470], [560, 470]],
      ] as Pt[][]) {
        n++;
        const r = rng(n * 31);
        // 꼭짓점을 둥글게 돌아가는 길
        const path: Pt[] = [];
        for (let i = 0; i < 3; i++) {
          const a = tri[i];
          const b = tri[(i + 1) % 3];
          for (let k = 0; k < 40; k++) {
            const f = 0.06 + (k / 40) * 0.88;
            path.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
          }
        }
        const count = Math.round(path.length * close);
        const pts = Array.from({ length: count }, (_, i): Pt => {
          const [x, y] = path[i % path.length];
          return [x + r() * 3, y + r() * 3];
        });
        const g = recognizeShape(pts);
        if (!(g?.kind === "triangle" || (g?.kind === "polygon" && g.pts?.length === 3))) misses.push(`${n} → ${g?.kind ?? "null"} ${g?.pts?.length ?? ""}`);
      }
    }
    if (misses.length) console.log(misses.join("\n"));
    expect(misses).toEqual([]);
  });
});
