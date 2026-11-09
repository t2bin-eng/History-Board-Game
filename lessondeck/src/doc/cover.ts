import type { Page } from "./types";

// 홈 문서 카드의 표지 (v0.21): 제목·차시 번호로 그리는 책 표지 모양. SPEC 5장 library.covers

/** 표지 색: 흰 글자가 잘 보이는(대비 4.5 이상) 차분하고 진한 색 */
export const COVER_COLORS = [
  "#24497a", // 남색
  "#1f6f9e", // 바다
  "#0d6b6e", // 청록
  "#2e6b45", // 숲
  "#5b6420", // 올리브
  "#8a5a12", // 황토
  "#9a3b26", // 벽돌
  "#7a2e4a", // 자주
  "#4f3d8f", // 보라
  "#3a3f4a", // 먹
] as const;

/** 문서 id로 정하는 자동 표지 색 (이름을 바꿔도 그대로) */
export function autoCoverColor(docId: string): string {
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < docId.length; i++) {
    h ^= docId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return COVER_COLORS[(h >>> 0) % COVER_COLORS.length];
}

export type CoverLook = { type: "color"; color: string } | { type: "page" };

/** 고른 표지("auto" · "#rrggbb" · "page")를 그릴 모양으로. 첫 페이지 그림이 없으면 자동 색 */
export function coverLook(docId: string, choice: string | undefined, hasThumb: boolean): CoverLook {
  if (choice === "page" && hasThumb) return { type: "page" };
  if (choice && /^#[0-9a-f]{6}$/i.test(choice)) return { type: "color", color: choice };
  return { type: "color", color: autoCoverColor(docId) };
}

export interface CoverTitle {
  /** 앞의 차시·단원 번호 ("33", "3-1") */
  num?: string;
  /** 번호 뒤 말 ("차시", "강") */
  unit?: string;
  title: string;
}

const NUMBERED = /^\s*(\d{1,3}(?:-\d{1,2})?)(?:\s*(?:[.)](?!\d)|:)\s*|\s*(차시|강|과|단원|장|회)\s*|\s+)(\S.*)$/;

/**
 * "33. 동아시아의 기후" → 번호 33 + 제목. "3차시 고려" → 3·차시. "3-1 고려" → 3-1.
 * "6.25 전쟁"·"1592 임진왜란"·"19세기 조선"은 번호로 보지 않는다.
 */
export function splitCoverTitle(title: string): CoverTitle {
  const m = NUMBERED.exec(title);
  if (!m) return { title: title.trim() };
  return { num: m[1], ...(m[2] ? { unit: m[2] } : {}), title: m[3].trim() };
}

/** 표지 아래쪽에 적을 첫 페이지 종류 */
export function coverKindLabel(first: Page | undefined): string {
  switch (first?.kind) {
    case "pdf":
      return "PDF";
    case "html":
      return "HTML";
    case "url":
      return "웹";
    case "youtube":
      return "유튜브";
    case "image":
      return "그림";
    case "video":
      return "동영상";
    default:
      return "노트";
  }
}
