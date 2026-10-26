import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useFloatingDrag } from "./useFloatingDrag";

interface Props {
  label: string;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (delta: 1 | -1) => void;
  /** 바 오른쪽에 붙는 버튼들 (강의 모드 도구) */
  extra?: ReactNode;
}

const DOUBLE_TAP_MS = 350;

// 이전/다음 페이지 바. 버튼이 아닌 곳(손잡이·쪽수)을 잡고 끌어 원하는 자리로 옮긴다.
export function PageNav({ label, hasPrev, hasNext, onNavigate, extra }: Props) {
  const lastTap = useRef(0);
  const float = useFloatingDrag<HTMLDivElement>({
    storageKey: "lessondeck.pageNavPos",
    canStart: (t) => !t.closest("button"),
    // 손잡이를 두 번 톡톡 → 원래 자리(아래 가운데)
    onTap: () => {
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        float.reset();
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    },
  });

  return (
    <div
      ref={float.ref}
      className={`page-nav${float.dragging ? " dragging" : ""}`}
      style={float.style}
      data-no-gesture
      {...float.handlers}
    >
      <span className="page-nav-grip" title="끌어서 옮기기 · 두 번 누르면 원래 자리" aria-hidden="true">
        <GripVertical size={18} />
      </span>
      <button aria-label="이전 페이지" disabled={!hasPrev} onClick={() => onNavigate(-1)}>
        <ChevronLeft size={22} />
      </button>
      <span className="page-nav-count">{label}</span>
      <button aria-label="다음 페이지" disabled={!hasNext} onClick={() => onNavigate(1)}>
        <ChevronRight size={22} />
      </button>
      {extra}
    </div>
  );
}
