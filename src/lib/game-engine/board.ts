import type { CellKind } from "./types";

export const TOTAL_CELLS = 80;

const kinds: Record<number, CellKind> = {
  5: "bonus", 9: "trap", 10: "bonus", 14: "artifact", 18: "shortcut", 20: "gate",
  24: "bonus", 29: "trap", 30: "artifact", 35: "artifact", 39: "shortcut", 40: "gate",
  44: "comeback", 49: "trap", 50: "comeback", 55: "bonus", 59: "shortcut", 60: "gate",
  64: "artifact", 69: "trap", 70: "bonus", 74: "bonus", 77: "gate", 80: "final",
};

export const shortcuts: Record<number, number> = { 18: 27, 39: 48, 59: 68 };

export function getCellKind(cell: number): CellKind {
  return kinds[cell] ?? "normal";
}

export function getEra(cell: number): string {
  if (cell <= 19) return "고대";
  if (cell <= 39) return "고려·조선";
  if (cell <= 59) return "개항기·일제강점기";
  return "현대";
}
