import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./platform";

// 다른 앱에서 복사한 것(기기 클립보드) 읽기 (SPEC 5장 "다른 앱에서 복사한 것 붙여넣기").
// 안드로이드 앱은 네이티브(SystemClipboardPlugin.java), 웹 버전은 navigator.clipboard.read().

export type SystemClip = { kind: "image"; file: File } | { kind: "text"; text: string } | { kind: "empty" } | { kind: "denied"; message: string };

interface SystemClipboardPlugin {
  read(): Promise<{ type: "image"; mime: string; data: string } | { type: "text"; text: string } | { type: "empty" }>;
}

const Native = registerPlugin<SystemClipboardPlugin>("SystemClipboard");

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function imageFile(blob: Blob, mime: string): File {
  return new File([blob], `붙여넣은 그림.${EXT[mime] ?? "png"}`, { type: mime });
}

export async function readSystemClipboard(): Promise<SystemClip> {
  if (isNativeApp) {
    try {
      const r = await Native.read();
      if (r.type === "image") {
        const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
        return { kind: "image", file: imageFile(new Blob([bytes], { type: r.mime }), r.mime) };
      }
      if (r.type === "text") return r.text.trim() ? { kind: "text", text: r.text } : { kind: "empty" };
      return { kind: "empty" };
    } catch (err) {
      return { kind: "denied", message: err instanceof Error ? err.message : "클립보드를 읽지 못했습니다" };
    }
  }
  const clipboard = navigator.clipboard;
  if (!clipboard) return { kind: "denied", message: "이 브라우저는 클립보드를 읽을 수 없습니다. Ctrl+V로 붙여넣으세요" };
  try {
    if (clipboard.read) {
      const items = await clipboard.read();
      for (const item of items) {
        const image = item.types.find((t) => t.startsWith("image/"));
        if (image) return { kind: "image", file: imageFile(await item.getType(image), image) };
      }
      for (const item of items) {
        if (item.types.includes("text/plain")) {
          const text = await (await item.getType("text/plain")).text();
          if (text.trim()) return { kind: "text", text };
        }
      }
      return { kind: "empty" };
    }
    const text = await clipboard.readText();
    return text.trim() ? { kind: "text", text } : { kind: "empty" };
  } catch {
    return { kind: "denied", message: "브라우저가 클립보드 읽기를 막았습니다. Ctrl+V로 붙여넣으세요" };
  }
}
