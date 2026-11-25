// 화면(확대·이동)이 멈춘 때를 알린다 (v0.50): 확대한 필기·PDF를 보이는 자리만 선명하게 다시 그리는 데 쓴다.
// 이어 보기·한 장씩 보기가 화면을 옮길 때마다 viewMoved()를 부르고, 마지막으로 부른 뒤 SETTLE_MS가 지나면 알린다.

const SETTLE_MS = 220;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function viewMoved(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const fn of subs) fn();
  }, SETTLE_MS);
}

export function onViewSettled(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
