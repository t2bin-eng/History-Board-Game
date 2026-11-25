import { getTheme, type ThemeId } from "../lib/theme";

// 레슨덱 그림 (v0.47 디자인, v0.49 테마별 — src/assets/themes/<테마>/ui, 투명 배경 WebP):
// 홈 바로가기 · 과목 폴더 · 판서 도구 · 빈 화면 · 안내 · 문서 표지 · (수련 정원) 홈 머리 그림

const URLS = import.meta.glob("../assets/themes/*/ui/*/*.webp", { query: "?url", import: "default", eager: true }) as Record<string, string>;

function url(theme: ThemeId, name: string): string | undefined {
  return URLS[`../assets/themes/${theme}/ui/${name}.webp`];
}

/**
 * "home-actions/pdf-new" 같은 이름 → 그 테마의 그림 주소. 여러 이름이면 앞에서부터 그 테마에 있는 것
 * (예: 캘리그래피 펜 그림이 없는 테마는 다음 이름), 그 테마에 없으면 살구빛 공책 그림, 그것도 없으면 빈 문자열.
 * 테마가 바뀌면 다시 그리도록 부르는 쪽에서 useTheme()으로 theme을 넘긴다
 */
export function art(name: string | readonly string[], theme: ThemeId = getTheme()): string {
  const names = typeof name === "string" ? [name] : name;
  for (const n of names) {
    const u = url(theme, n);
    if (u) return u;
  }
  for (const n of names) {
    const u = url("apricot", n);
    if (u) return u;
  }
  return "";
}

/** 문서 표지 그림 (3:4, 위쪽 10~12%에 제목) — 테마마다 여섯 가지, 같은 자리끼리 비슷한 빛깔 (doc/cover.ts COVER_ART_SETS 순서) */
export const COVER_ART_LABELS: Record<string, string> = {
  "apricot-sunrise": "살구빛 언덕",
  "sage-contours": "세이지 곡선",
  "mist-blue-waves": "물빛 물결",
  "lavender-arcs": "라벤더 아치",
  "sand-stitch": "모래색 스티치",
  "rose-paper": "장밋빛 종이",
  "water-lilies": "분홍 수련",
  "garden-bridge": "연못 위 다리",
  "blue-reflections": "푸른 물빛",
  "willow-curtain": "버드나무",
  "golden-pond": "물 위의 햇살",
  "rose-irises": "장밋빛 붓꽃",
};

/** 표지 그림이 어느 테마의 것인지 (그 테마 폴더에서 찾는다) */
export function coverArtUrl(id: string): string {
  for (const t of ["apricot", "water-lily"] as const) {
    const u = url(t, `covers/${id}`);
    if (u) return u;
  }
  return "";
}

/** 폴더 이름에 맞는 과목 그림 (없으면 null → 기본 폴더 그림). 앞 이름이 없는 테마는 뒤 이름 */
const SUBJECTS: [RegExp, string[]][] = [
  [/동아시아|중국|일본|동양/, ["subjects/east-asian-history"]],
  [/세계사|서양|유럽|세계\s*역사/, ["subjects/world-history"]],
  [/한국사|국사|조선|고려|삼국|역사/, ["subjects/korean-history"]],
  [/지리|지도|사회|세계\s*지리|여행/, ["subjects/geography"]],
  [/과학|물리|화학|생명|생물|지구/, ["subjects/science"]],
  [/수학|산수|기하|통계/, ["subjects/math"]],
  [/영어\s*회화|회화\s*영어|듣기|말하기|speaking|conversation/i, ["subjects/english-conversation", "subjects/english", "subjects/language-arts"]],
  [/영어|english/i, ["subjects/english", "subjects/language-arts"]],
  [/국어|문학|언어|글쓰기|독서/, ["subjects/language-arts"]],
  [/미술|그림|디자인|음악|예술/, ["subjects/art"]],
];

export function subjectArt(folderName: string): string[] | null {
  for (const [re, names] of SUBJECTS) if (re.test(folderName)) return names;
  return null;
}
