import { Check } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** 켜짐/꺼짐 표시 (체크) */
  checked?: boolean;
  /** PC 단축키 안내 */
  hint?: string;
}

/** 줄 묶음 (묶음 사이에 구분선) */
export type MenuGroups = (MenuItem | false | null | undefined)[][];

interface Props {
  /** 화면 좌표: 이 점의 오른쪽 아래에 연다 (화면 밖으로 나가면 안쪽으로) */
  x: number;
  y: number;
  title?: string;
  groups: MenuGroups;
  onClose: () => void;
}

// 길게 누르기·더보기 버튼으로 여는 메뉴
export function ContextMenu({ x, y, title, groups, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  // 메뉴를 연 손가락을 떼는 순간 생기는 click은 버린다. 메뉴 안을 새로 눌러야 항목이 동작한다
  const armed = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current!;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - w - margin));
    // 아래 공간이 모자라면 누른 점 위로
    const top = y + h + margin > window.innerHeight ? Math.max(margin, y - h) : y;
    setPos({ left, top, ready: true });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = groups.map((g) => g.filter((i): i is MenuItem => !!i)).filter((g) => g.length);

  return (
    <div
      className="ctx-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // 손가락·펜으로 길게 누르면 브라우저가 메뉴가 열린 뒤에 contextmenu를 한 번 더 보낸다 → 무시.
        // 마우스로 바깥을 오른쪽 클릭했을 때만 닫는다
        const type = (e.nativeEvent as PointerEvent).pointerType || "mouse";
        if (type === "mouse" && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`ctx-menu${pos.ready ? " ready" : ""}`}
        role="menu"
        aria-label={title ?? "메뉴"}
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={() => (armed.current = true)}
      >
        {title && <div className="ctx-title">{title}</div>}
        {visible.map((group, gi) => (
          <div key={gi} className="ctx-group">
            {group.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                className={item.danger ? "danger" : undefined}
                disabled={item.disabled}
                onClick={(e) => {
                  // 키보드(Enter)로 고른 경우는 detail이 0
                  if (!armed.current && e.detail !== 0) return;
                  onClose();
                  item.onSelect();
                }}
              >
                <span className="ctx-icon">{item.icon}</span>
                <span className="ctx-label">{item.label}</span>
                {item.checked != null && <span className="ctx-check">{item.checked && <Check size={16} />}</span>}
                {item.hint && <kbd>{item.hint}</kbd>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
