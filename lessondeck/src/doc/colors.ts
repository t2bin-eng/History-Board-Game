// 글자와 배경의 색 대비 (WCAG 상대 휘도·대비율). 글상자 배경 "자동"이 글자가 잘 보이는 바탕을 고른다.

type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** 상대 휘도 (0 검정 ~ 1 흰색) */
export function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 대비율 (1 ~ 21). 큰 글자는 3 이상, 보통 글자는 4.5 이상이면 잘 읽힌다 */
export function contrast(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * 글자색에 맞춘 배경: 진한 글자면 같은 빛깔의 아주 옅은 바탕, 밝은 글자(흰색·노랑·주황 등)면 같은 빛깔의 아주 짙은 바탕.
 * 글상자 글자는 크므로 대비 3 이상(되도록 4.5)이 되는 것 중 글자 빛깔이 살짝 비치는 쪽을 고른다.
 */
export function autoBackground(text: string): string {
  const rgb = parseHex(text) ?? [17, 17, 17];
  const light = [0.9, 0.94, 0.97, 1].map((t) => toHex(mix(rgb, [255, 255, 255], t)));
  const dark = [0.82, 0.87, 0.92, 1].map((t) => toHex(mix(rgb, [0, 0, 0], t)));
  const textHex = toHex(rgb);
  const pick = (list: string[], min: number) => list.find((c) => contrast(textHex, c) >= min);
  return pick(light, 4.5) ?? pick(dark, 4.5) ?? pick(light, 3) ?? pick(dark, 3) ?? (luminance(rgb) > 0.4 ? "#111111" : "#ffffff");
}
