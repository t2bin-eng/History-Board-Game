import { headParts } from "../ink/arrowHeads";
import type { ArrowHead } from "../ink/types";

// 화살촉 모양 고르기 단추 그림 (v0.30): 짧은 선 끝에 그 촉
export function HeadIcon({ head, size = 26 }: { head: ArrowHead; size?: number }) {
  const w = size;
  const h = Math.round(size * 0.62);
  const y = h / 2;
  const tip: [number, number] = [w - 3, y];
  const lineW = 2;
  const parts = headParts(head, tip, [1, 0], 9, lineW);
  const pts = (p: [number, number][]) => p.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1={3} y1={y} x2={tip[0] - parts.inset} y2={y} stroke="currentColor" strokeWidth={lineW} strokeLinecap="round" />
      {parts.fills.map((p, i) => (
        <polygon key={`f${i}`} points={pts(p)} fill="currentColor" stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
      ))}
      {parts.lines.map((p, i) => (
        <polyline key={`l${i}`} points={pts(p)} fill="none" stroke="currentColor" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
