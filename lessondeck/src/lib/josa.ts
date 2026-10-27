// 받침에 맞는 조사: josa("‘3단원’", "을", "를") → "‘3단원’을", josa("2단원 고려", "으로", "로") → "2단원 고려로"
// 끝의 따옴표·괄호는 건너뛰고 본다. 한글로 끝나지 않으면 "을(를)"처럼 둘 다 적는다.

export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const core = word.replace(/[\s'"’”)\]」』]+$/u, "");
  const code = core.charCodeAt(core.length - 1) - 0xac00;
  if (!(code >= 0 && code < 11172)) return `${word}${withFinal}(${withoutFinal})`;
  const final = code % 28;
  // "으로"는 ㄹ 받침 뒤에서도 "로"
  const none = final === 0 || (withFinal === "으로" && final === 8);
  return word + (none ? withoutFinal : withFinal);
}
