// 레슨덱 그림 (v0.47 디자인, src/assets/ui — 투명 배경 WebP): 홈 바로가기 · 과목 폴더 · 판서 도구 · 빈 화면 · 안내 · 문서 표지

const URLS = import.meta.glob("../assets/ui/*/*.webp", { query: "?url", import: "default", eager: true }) as Record<string, string>;

/** "home-actions/pdf-new" 같은 이름 → 주소 (없으면 빈 문자열) */
export function art(name: string): string {
  return URLS[`../assets/ui/${name}.webp`] ?? "";
}

/** 문서 표지 그림 (3:4, 위쪽 10~12%에 제목) */
export const COVER_ARTS = [
  { id: "apricot-sunrise", label: "살구빛 언덕" },
  { id: "sage-contours", label: "세이지 곡선" },
  { id: "mist-blue-waves", label: "물빛 물결" },
  { id: "lavender-arcs", label: "라벤더 아치" },
  { id: "sand-stitch", label: "모래색 스티치" },
  { id: "rose-paper", label: "장밋빛 종이" },
] as const;

export type CoverArtId = (typeof COVER_ARTS)[number]["id"];

/** 폴더 이름에 맞는 과목 그림 (없으면 null → 기본 폴더 그림) */
const SUBJECTS: [RegExp, string][] = [
  [/동아시아|중국|일본|동양/, "east-asian-history"],
  [/세계사|서양|유럽|세계\s*역사/, "world-history"],
  [/한국사|국사|조선|고려|삼국|역사/, "korean-history"],
  [/지리|지도|사회|세계\s*지리|여행/, "geography"],
  [/과학|물리|화학|생명|생물|지구/, "science"],
  [/수학|산수|기하|통계/, "math"],
  [/국어|문학|언어|글쓰기|독서|영어/, "language-arts"],
  [/미술|그림|디자인|음악|예술/, "art"],
];

export function subjectArt(folderName: string): string | null {
  for (const [re, id] of SUBJECTS) if (re.test(folderName)) return `subjects/${id}`;
  return null;
}
