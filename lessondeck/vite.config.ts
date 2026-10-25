/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
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
      },
    }),
  ],
  build: {
    target: "es2022",
    // pdf.js 본체가 커서 기본 경고 기준(500kB)을 넘는다. 오프라인 앱이라 한 번 캐시되면 다시 받지 않는다.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
