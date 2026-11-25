import { useEffect, useRef, type RefObject } from "react";

/**
 * 페이지 영역이 브라우저 스스로 스크롤되지 않게 붙잡는다 (v0.48, SPEC 6장 "이어 보기").
 * 페이지 영역은 overflow: hidden이지만 글상자에 입력하면 브라우저가 커서를 보이려고 영역을 스크롤한다 —
 * 그러면 그 안에 떠 있는 펜 바·넘기기 바까지 같이 밀려 올라가 묻히고, 입력을 끝내도 돌아오지 않았다.
 * 스크롤된 만큼을 0으로 되돌리고 onShift로 알려, 보기(띠·확대 화면)를 그만큼 옮겨 커서는 그대로 보이게 한다.
 */
export function usePinnedScroll(areaRef: RefObject<HTMLElement | null>, onShift: (dx: number, dy: number) => void) {
  const shiftRef = useRef(onShift);
  shiftRef.current = onShift;
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onScroll = () => {
      const dx = el.scrollLeft;
      const dy = el.scrollTop;
      if (!dx && !dy) return;
      el.scrollLeft = 0;
      el.scrollTop = 0;
      shiftRef.current(dx, dy);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [areaRef]);
}
