import type { CSSProperties } from "react";

// 레슨덱 아이콘 (v0.47 디자인, src/assets/icons — 24×24 두 가지 색: 먹색 윤곽선은 글자색(currentColor)을 따르고 살구색 포인트는 그대로).
// 앱에 들어 있는 SVG만 쓴다(밖에서 받은 글이 아님).

const RAW = import.meta.glob("../assets/icons/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const SVGS: Record<string, string> = {};
for (const [path, svg] of Object.entries(RAW)) {
  const name = path.slice(path.lastIndexOf("/") + 1, -4);
  // 윤곽선은 글자색을 따르게 (단독 파일의 기본 먹색을 뺀다)
  SVGS[name] = svg.replace(/\scolor="#28231F"/i, "").replace(/\swidth="24"\s+height="24"/, ' width="100%" height="100%"');
}

export type IconName =
  | "ai" | "archive" | "aspect-ratio" | "check" | "close" | "cloud-sync" | "cursor" | "decks" | "download" | "drag-handle"
  | "duplicate" | "eraser" | "export" | "eye-off" | "eye" | "file-import" | "fit-page" | "folder-add" | "folder" | "fullscreen"
  | "grid" | "hand" | "highlighter" | "home" | "image-add" | "laser" | "lecture" | "link" | "list" | "minus" | "more"
  | "move-down" | "move-up" | "move" | "next" | "note-blank" | "page-add" | "page-panel" | "palette" | "pdf-new"
  | "pen-practice" | "pen-width" | "pen" | "plus" | "previous" | "redo" | "rotate" | "ruler" | "search" | "select"
  | "settings" | "shapes" | "sort" | "split-view" | "text" | "trash" | "undo";

export function hasIcon(name: string): boolean {
  return name in SVGS;
}

export function Icon({ name, size = 24, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`ld-icon${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
      // 앱에 들어 있는 아이콘 파일 (위 RAW)
      dangerouslySetInnerHTML={{ __html: SVGS[name] ?? "" }}
    />
  );
}
