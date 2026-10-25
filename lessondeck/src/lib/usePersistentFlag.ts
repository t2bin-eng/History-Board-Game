import { useCallback, useState } from "react";

/** 기기별 편의 설정(손가락 필기·저지연 캔버스·패널 열림)은 다음 실행 때도 유지한다 */
export function usePersistentFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? initial : v === "1";
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, v ? "1" : "0");
        } catch {
          // 저장이 막혀 있어도 이번 실행에서는 그대로 동작한다
        }
        return v;
      });
    },
    [key],
  );
  return [value, set] as const;
}
