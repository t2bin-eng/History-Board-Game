import { useEffect, useRef, type CSSProperties } from "react";

// 스포트라이트 (v0.28, SPEC 6장 "강의 모드"): 화면을 어둡게 하고 S펜(띄운 채 움직여도)·손가락·마우스가 있는 곳만 동그랗게 밝힌다.
// 누름은 모두 지나간다(그 밑에서 그대로 판서·넘기기). 넘기기 바는 위에 남는다.

export function Spotlight({ radius }: { radius: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    let raf = 0;
    let x = -1;
    let y = -1;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      // 아직 펜·손이 오지 않았으면 가운데
      const px = x < 0 ? r.width / 2 : x - r.left;
      const py = y < 0 ? r.height / 2 : y - r.top;
      el.style.setProperty("--sx", `${px.toFixed(1)}px`);
      el.style.setProperty("--sy", `${py.toFixed(1)}px`);
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointermove", move, opts);
    window.addEventListener("pointerdown", move, opts);
    window.addEventListener("resize", apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move, opts);
      window.removeEventListener("pointerdown", move, opts);
      window.removeEventListener("resize", apply);
    };
  }, []);
  return <div ref={ref} className="spotlight" aria-hidden="true" style={{ "--sr": `${radius}px` } as CSSProperties} />;
}

/** 스포트라이트 크기 단계 (화면 px 반지름) */
export const SPOTLIGHT_SIZES = [80, 120, 170, 230, 310];
