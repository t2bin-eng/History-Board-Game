import type { CapacitorConfig } from "@capacitor/cli";

// 안드로이드 앱(APK) 셸 설정. 웹 빌드(dist)를 APK 안에 그대로 넣어 오프라인으로 동작한다.
const config: CapacitorConfig = {
  appId: "kr.lessondeck.app",
  appName: "레슨덱",
  webDir: "dist",
  backgroundColor: "#262626",
  android: {
    // http:// 주소로만 열리는 학교·기관 사이트, https 사이트 안의 http 그림·영상도 웹 주소 페이지에서 보이게 한다
    allowMixedContent: true,
  },
};

export default config;
