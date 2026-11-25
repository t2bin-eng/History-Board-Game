import type { CSSProperties } from "react";
import { useTheme, type ThemeId } from "../lib/theme";

// 레슨덱 아이콘 (v0.47 디자인, v0.49 테마별 src/assets/themes/<테마>/icons — 24×24 두 가지 색: 먹색 윤곽선은 글자색(currentColor)을 따르고 살구색 포인트는 그대로).
// 앱에 들어 있는 SVG만 쓴다(밖에서 받은 글이 아님).

const RAW = import.meta.glob("../assets/themes/*/icons/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** 테마 → 이름 → SVG (v0.49: 테마마다 같은 이름, 윤곽선·포인트 색만 다름) */
const SVGS: Record<string, Record<string, string>> = {};
for (const [path, svg] of Object.entries(RAW)) {
  const m = /themes\/([^/]+)\/icons\/([^/]+)\.svg$/.exec(path);
  if (!m) continue;
  // 윤곽선은 글자색을 따르게 (단독 파일의 기본 윤곽 색을 뺀다)
  (SVGS[m[1]] ??= {})[m[2]] = svg.replace(/\scolor="#[0-9a-f]{6}"/i, "").replace(/\swidth="24"\s+height="24"/, ' width="100%" height="100%"');
}

function svgOf(theme: ThemeId, name: string): string {
  return SVGS[theme]?.[name] ?? SVGS.apricot?.[name] ?? "";
}

export type IconName =
  | "ai" | "archive" | "aspect-ratio" | "check" | "close" | "cloud-sync" | "cursor" | "decks" | "download" | "drag-handle"
  | "duplicate" | "eraser" | "export" | "eye-off" | "eye" | "file-import" | "fit-page" | "folder-add" | "folder" | "fullscreen"
  | "grid" | "hand" | "highlighter" | "home" | "image-add" | "laser" | "lecture" | "link" | "list" | "minus" | "more"
  | "move-down" | "move-up" | "move" | "next" | "note-blank" | "page-add" | "page-panel" | "palette" | "pdf-new"
  | "pen-practice" | "pen-width" | "pen" | "plus" | "previous" | "redo" | "rotate" | "ruler" | "search" | "select"
  | "settings" | "shapes" | "sort" | "split-view" | "text" | "trash" | "undo";

export function hasIcon(name: string): boolean {
  return !!svgOf("apricot", name);
}

export function Icon({ name, size = 24, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  const theme = useTheme();
  return (
    <span
      className={`ld-icon${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
      // 앱에 들어 있는 아이콘 파일 (위 RAW)
      dangerouslySetInnerHTML={{ __html: svgOf(theme, name) }}
    />
  );
}
