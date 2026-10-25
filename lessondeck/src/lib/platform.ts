import { Capacitor } from "@capacitor/core";

/** APK(안드로이드 WebView 셸) 안에서 실행 중인지. 브라우저·PWA면 false */
export const isNativeApp = Capacitor.isNativePlatform();

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastDetail {
  message: string;
  action?: ToastAction;
}

/** 화면 아래 알림 띄우기 (ui/Toaster가 받아서 표시). action이 있으면 버튼과 함께 조금 더 오래 보인다 */
export function showToast(message: string, action?: ToastAction) {
  window.dispatchEvent(new CustomEvent<ToastDetail>("lessondeck:toast", { detail: { message, action } }));
}
