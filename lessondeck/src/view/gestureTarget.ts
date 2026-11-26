// 손가락 제스처(스크롤·확대)를 받을 곳인지 (v0.52)
// data-no-gesture 안(팔레트·패널·글상자·스티커 등)은 받지 않는다. 단 data-finger-pan인 곳 — 텍스트 모드 글상자 층의 빈 곳 — 은
// 손가락으로 끌면 스크롤, 두 손가락이면 확대 (0.51까지는 텍스트 모드를 켜면 층 전체가 data-no-gesture라 둘 다 되지 않았다).
// 그 안의 글상자는 저마다 data-no-gesture라 그대로 막힌다.

/** 첫 손가락이 여기서 시작하면 제스처가 아니다 */
export function blocksGesture(target: EventTarget | null): boolean {
  const g = (target as Element | null)?.closest?.("[data-no-gesture]");
  return !!g && !g.hasAttribute("data-finger-pan");
}

/** 손가락 필기를 켠 때 한 손가락이 "그리기"로 갈 곳 (필기층, 또는 텍스트 모드 글상자 층의 빈 곳) */
export function fingerWritesOn(target: EventTarget | null): boolean {
  const t = target as Element | null;
  return !!t?.classList?.contains("ink-live") || !!t?.hasAttribute?.("data-finger-pan");
}
