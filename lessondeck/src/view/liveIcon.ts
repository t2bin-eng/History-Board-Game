import { useSyncExternalStore } from "react";

// 끌어 옮기는 중인 팝업 아이콘의 자리 (v0.52): 아이콘에 이은 화살표가 끄는 동안에도 따라가게.
// PopupLayer가 끄는 동안 알리고, BoxLayer(화살표)만 다시 그린다 (편집 화면 전체를 다시 그리지 않게).

export type LiveIcon = { id: string; x: number; y: number } | null;

let current: LiveIcon = null;
const subs = new Set<() => void>();

export function setLiveIcon(next: LiveIcon): void {
  if (next === current || (next && current && next.id === current.id && next.x === current.x && next.y === current.y)) return;
  current = next;
  for (const fn of subs) fn();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function useLiveIcon(): LiveIcon {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
