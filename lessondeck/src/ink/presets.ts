import { DEFAULT_PRESETS } from "./palette";
import { PEN_NIBS, type PenPreset } from "./types";

// 펜 바의 펜들을 기기에 기억 (v0.33, SPEC 5장 기기 설정 lessondeck.presets).
// 0.32까지는 앱을 다시 켜면 처음 펜으로 돌아갔다. 곧게 긋기·필압 같은 펜 설정도 함께 남는다.

export const PRESETS_KEY = "lessondeck.presets";

const isPreset = (v: unknown): v is PenPreset => {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    (p.tool === "pen" || p.tool === "highlighter") &&
    typeof p.color === "string" &&
    typeof p.width === "number" &&
    Number.isFinite(p.width) &&
    p.width > 0
  );
};

/** 기억한 펜들 (없거나 모양이 틀리면 처음 펜) */
export function loadPresets(): PenPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list) || !list.length || !list.every(isPreset)) return DEFAULT_PRESETS;
    return list.map((p) => {
      const out: PenPreset = { id: p.id, tool: p.tool, color: p.color, width: p.width };
      if (p.tool === "highlighter" && p.straight) out.straight = true;
      if (p.tool === "pen" && p.fixedWidth) out.fixedWidth = true;
      // 펜 종류·불투명도 (v0.41)
      if (p.tool === "pen" && p.nib && PEN_NIBS.includes(p.nib)) out.nib = p.nib;
      if (p.tool === "pen" && typeof p.opacity === "number" && p.opacity >= 0.2 && p.opacity < 1) out.opacity = p.opacity;
      return out;
    });
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresets(list: PenPreset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch {
    // 기억하지 못해도 이번 실행 동안은 된다
  }
}
