import { File, FileText, Grid3x3 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BlankBackground } from "../doc/types";

interface Props {
  left: number;
  top: number;
  onBlank: (background: BlankBackground) => void;
  onPdf: () => void;
  onClose: () => void;
}

// 페이지 추가 메뉴: 빈 페이지·모눈 페이지·PDF 파일
export function AddPageMenu({ left, top, onBlank, onPdf, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // 메뉴를 연 바로 그 탭이 닫기로 처리되지 않도록 다음 틱에 등록한다
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown, true));
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // 화면 밖으로 넘치지 않게 (상단 오른쪽 버튼에서 열 때 등)
  const maxTop = window.innerHeight - 200;
  const maxLeft = window.innerWidth - 236;
  return (
    <div
      ref={ref}
      className="add-menu"
      role="menu"
      style={{ left: Math.max(8, Math.min(left, maxLeft)), top: Math.max(8, Math.min(top, maxTop)) }}
      data-no-gesture
    >
      <div className="ts-title">페이지 추가</div>
      <button role="menuitem" onClick={() => onBlank("plain")}>
        <File size={20} /> 빈 페이지
      </button>
      <button role="menuitem" onClick={() => onBlank("grid")}>
        <Grid3x3 size={20} /> 모눈 페이지
      </button>
      <button role="menuitem" onClick={onPdf}>
        <FileText size={20} /> PDF 파일에서 추가…
      </button>
    </div>
  );
}
