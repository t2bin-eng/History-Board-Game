/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    // 글상자 글꼴(@fontsource)의 옛 형식 woff 대체 파일은 빼고 woff2만 앱에 넣는다 (안드로이드 웹뷰·요즘 브라우저는 모두 woff2)
    {
      name: "lessondeck-woff2-only",
      enforce: "pre",
      transform(code, id) {
        if (!/@fontsource[\\/].+\.css$/.test(id)) return;
        return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, "");
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icons/*.png", "icons/*.svg", "sample.pdf"],
      manifest: {
        name: "레슨덱 LessonDeck",
        short_name: "레슨덱",
        description: "PDF와 HTML 웹앱을 한 문서로 넘기며 판서하는 수업 리더",
        lang: "ko",
        start_url: "/",
        scope: "/",
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        orientation: "any",
        background_color: "#1f1f1f",
        theme_color: "#262626",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // 교실 와이파이가 끊겨도 동작하도록 pdf.js 워커·cmaps·글꼴·샘플 PDF까지 모두 미리 캐시한다.
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,ico,pdf,wasm,bcmap,pfb,ttf,icc,webmanifest}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        // 글상자 글꼴(v0.25)은 글자 묶음 파일이 많아(약 10MB) 미리 받지 않고, 한 번 쓴 묶음을 남겨 둔다.
        // (안드로이드 앱은 앱 파일 안에 모두 들어 있다)
        runtimeCaching: [
          {
            urlPattern: /\.woff2$/,
            handler: "CacheFirst",
            options: { cacheName: "lessondeck-fonts", expiration: { maxEntries: 1000 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: "es2022",
    // pdf.js 본체와 HEIC 변환기(HEIC 사진을 넣을 때만 불러옴)가 커서 기본 경고 기준을 넘는다.
    // 오프라인 앱이라 한 번 캐시되면 다시 받지 않는다.
    chunkSizeWarningLimit: 3500,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
