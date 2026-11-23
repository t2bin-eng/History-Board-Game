import { Capacitor } from "@capacitor/core";

/** APK(안드로이드 WebView 셸) 안에서 실행 중인지. 브라우저·PWA면 false */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * 웹 페이지 판서 모드에서 "펜은 판서, 손가락은 조작"을 하는지 (v0.35, SPEC 6장).
 * 안드로이드 앱만: S펜이 가까운지 안드로이드가 알려 준다(lessondeckpen). 브라우저는 알 수 없어 예전처럼 모드를 바꿔 쓴다
 */
export const fingerOperatesWeb = isNativeApp;

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
