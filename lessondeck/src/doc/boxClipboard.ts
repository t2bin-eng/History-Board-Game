import type { BoxClip } from "./boxes";

// 상자 복사·잘라내기 클립보드. 문서를 바꿔도 남도록 화면 밖(모듈)에 둔다 (앱을 끄면 사라짐)
let clip: BoxClip | null = null;

export function getBoxClip(): BoxClip | null {
  return clip;
}

export function setBoxClip(next: BoxClip | null) {
  clip = next;
}
