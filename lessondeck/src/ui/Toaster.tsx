import { useEffect, useState } from "react";
import type { ToastDetail } from "../lib/platform";

// 화면 아래 알림 (lib/platform의 showToast로 띄운다)
export function Toaster() {
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      clearTimeout(timer);
      setToast(detail);
      timer = setTimeout(() => setToast(null), detail.action ? 5000 : 2800);
    };
    window.addEventListener("lessondeck:toast", onToast);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("lessondeck:toast", onToast);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            setToast(null);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
