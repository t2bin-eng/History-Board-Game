import { App } from "@capacitor/app";
import { showToast } from "./platform";

const EXIT_WINDOW_MS = 2000;

/** 뒤로 가기를 먼저 받아 처리할 것들 (예: 강의 모드 끝내기). 마지막에 등록한 것부터 */
const backHandlers: (() => void)[] = [];

/** 뒤로 가기를 가로챈다. 돌려준 함수를 부르면 해제 */
export function onBackPress(fn: () => void): () => void {
  backHandlers.push(fn);
  return () => {
    const i = backHandlers.lastIndexOf(fn);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

// 안드로이드 뒤로 가기(버튼·제스처)를 실수로 눌러 수업 중 앱이 닫히지 않도록
// 2초 안에 한 번 더 눌러야 종료한다.
export function setupNativeShell() {
  let lastBack = 0;
  App.addListener("backButton", () => {
    const handler = backHandlers.at(-1);
    if (handler) {
      handler();
      return;
    }
    const now = Date.now();
    if (now - lastBack < EXIT_WINDOW_MS) {
      App.exitApp();
      return;
    }
    lastBack = now;
    showToast("한 번 더 누르면 레슨덱을 닫습니다");
  });
}
