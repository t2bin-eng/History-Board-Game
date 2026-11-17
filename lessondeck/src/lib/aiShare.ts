import { registerPlugin } from "@capacitor/core";
import type { PageImage } from "../view/pageSnapshot";
import { isNativeApp } from "./platform";
import { snapshotRegion } from "./webFrames";

// AI로 보내기 (v0.31, SPEC 5장): 판서한 페이지 그림을 고른 AI 앱으로.
// 안드로이드 앱은 네이티브(AiSharePlugin.java)가 그 앱에 바로 공유, 웹 버전은 공유 창이나 내려받기 + 웹사이트.

export type AiAppId = "claude" | "chatgpt" | "gemini";

export interface AiApp {
  id: AiAppId;
  label: string;
  /** 안드로이드 앱 패키지 */
  pkg: string;
  /** 웹 버전에서 공유 창을 쓸 수 없을 때 여는 곳 */
  web: string;
}

export const AI_APPS: AiApp[] = [
  { id: "claude", label: "Claude", pkg: "com.anthropic.claude", web: "https://claude.ai/new" },
  { id: "chatgpt", label: "ChatGPT", pkg: "com.openai.chatgpt", web: "https://chatgpt.com/" },
  { id: "gemini", label: "Gemini", pkg: "com.google.android.apps.bard", web: "https://gemini.google.com/app" },
];

const LAST_APP_KEY = "lessondeck.aiApp";

export function lastAiApp(): AiAppId {
  try {
    const v = localStorage.getItem(LAST_APP_KEY);
    if (AI_APPS.some((a) => a.id === v)) return v as AiAppId;
  } catch {
    // 기억을 못 읽으면 처음 것
  }
  return "claude";
}

export function rememberAiApp(id: AiAppId) {
  try {
    localStorage.setItem(LAST_APP_KEY, id);
  } catch {
    // 기억하지 못해도 보내기는 된다
  }
}

interface AiSharePlugin {
  share(options: { package: string; data: string; mime: string; name: string; text: string }): Promise<{ via: "app" | "chooser" }>;
}

const Native = registerPlugin<AiSharePlugin>("AiShare");

/** app: 고른 앱이 바로 열림 · chooser: 공유 창(그 앱이 없거나 그림을 받지 않음) · web: 내려받고 웹사이트를 염 · cancelled: 공유 창을 닫음 */
export type AiShareResult = "app" | "chooser" | "web" | "cancelled";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error ?? new Error("그림을 읽지 못했습니다"));
    r.readAsDataURL(blob);
  });
}

function fileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `lessondeck-ai-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}

/** 그림(과 적은 말)을 AI 앱으로 보낸다 */
export async function shareToAi(appId: AiAppId, image: Blob, text: string): Promise<AiShareResult> {
  const app = AI_APPS.find((a) => a.id === appId) ?? AI_APPS[0];
  const name = fileName();
  if (isNativeApp) {
    const { via } = await Native.share({ package: app.pkg, data: await blobToBase64(image), mime: image.type || "image/jpeg", name, text });
    return via;
  }
  const file = new File([image], name, { type: image.type || "image/jpeg" });
  const data: ShareData = text ? { files: [file], text } : { files: [file] };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return "chooser";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled";
      // 공유가 막혔으면 아래 방법으로
    }
  }
  // PC 브라우저: 그림을 클립보드(되면)와 내려받기로, 말은 클립보드로 — 열린 AI 사이트에 붙여넣기
  try {
    if (!text && "ClipboardItem" in window) await navigator.clipboard.write([new ClipboardItem({ "image/png": toPng(image) })]);
    else if (text) await navigator.clipboard.writeText(text);
  } catch {
    // 클립보드를 못 써도 내려받기는 된다
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  window.open(app.web, "_blank", "noopener");
  return "web";
}

/** 클립보드(브라우저)는 PNG만 받는다 */
async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  const png = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  c.width = 0;
  c.height = 0;
  if (!png) throw new Error("그림을 바꾸지 못했습니다");
  return png;
}

const nextFrames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))));

/**
 * 안드로이드 앱: 지금 화면의 페이지(웹·동영상)를 보이는 그대로 찍는다. 필기·글상자·스티커와 떠 있는 막대는
 * 찍는 순간 감추고(따로 옮겨 가 고칠 수 있게), 확대했으면 잠깐 풀어 페이지 전체를 찍는다. 못 찍으면 null
 */
export async function captureShownPage(): Promise<PageImage | null> {
  if (!isNativeApp) return null;
  const page = document.querySelector<HTMLElement>(".page-area > .page");
  if (!page) return null;
  const root = document.documentElement;
  const transform = page.style.transform;
  const transition = page.style.transition;
  root.classList.add("snapshotting");
  page.style.transition = "none";
  page.style.transform = "";
  try {
    await nextFrames();
    const r = page.getBoundingClientRect();
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    const w = Math.min(window.innerWidth, r.right) - x;
    const h = Math.min(window.innerHeight, r.bottom) - y;
    if (w < 40 || h < 40) return null;
    const outWidth = Math.round(Math.min(2560, w * (window.devicePixelRatio || 1)));
    const url = await snapshotRegion({ x, y, width: w, height: h }, outWidth, 90);
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    return { blob, width: outWidth, height: Math.round((outWidth * h) / w) };
  } catch {
    return null;
  } finally {
    page.style.transform = transform;
    page.style.transition = transition;
    root.classList.remove("snapshotting");
  }
}
