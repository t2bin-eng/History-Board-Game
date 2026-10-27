import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { installInputTracking } from "./lib/inputState";
import { setupNativeShell } from "./lib/nativeShell";
import { isNativeApp, showToast } from "./lib/platform";
import { routeExternalLinks } from "./lib/webFrames";
import { requestPersistentStorage } from "./store/db";
import "./styles.css";

installInputTracking();
requestPersistentStorage();

if (isNativeApp) {
  // APK는 앱 파일을 기기 안에 들고 있으므로 서비스 워커가 필요 없다
  setupNativeShell();
  routeExternalLinks();
} else {
  registerSW({
    immediate: true,
    onOfflineReady() {
      showToast("오프라인 사용 준비 완료");
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
