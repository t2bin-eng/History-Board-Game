import type { CapacitorConfig } from "@capacitor/cli";

// 안드로이드 앱(APK) 셸 설정. 웹 빌드(dist)를 APK 안에 그대로 넣어 오프라인으로 동작한다.
const config: CapacitorConfig = {
  appId: "kr.lessondeck.app",
  appName: "레슨덱",
  webDir: "dist",
  backgroundColor: "#262626",
  android: {
    allowMixedContent: false,
  },
};

export default config;
