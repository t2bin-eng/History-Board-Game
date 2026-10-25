import { App } from "@capacitor/app";
import { showToast } from "./platform";

const EXIT_WINDOW_MS = 2000;

// 안드로이드 뒤로 가기(버튼·제스처)를 실수로 눌러 수업 중 앱이 닫히지 않도록
// 2초 안에 한 번 더 눌러야 종료한다.
export function setupNativeShell() {
  let lastBack = 0;
  App.addListener("backButton", () => {
    const now = Date.now();
    if (now - lastBack < EXIT_WINDOW_MS) {
      App.exitApp();
      return;
    }
    lastBack = now;
    showToast("한 번 더 누르면 레슨덱을 닫습니다");
  });
}
