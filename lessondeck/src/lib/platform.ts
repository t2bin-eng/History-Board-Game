import { Capacitor } from "@capacitor/core";

/** APK(안드로이드 WebView 셸) 안에서 실행 중인지. 브라우저·PWA면 false */
export const isNativeApp = Capacitor.isNativePlatform();

/** 화면 아래 알림 띄우기 (App.tsx가 받아서 표시) */
export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent<string>("lessondeck:toast", { detail: message }));
}
