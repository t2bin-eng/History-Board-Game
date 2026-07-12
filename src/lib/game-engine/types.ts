export type CellKind = "normal" | "bonus" | "trap" | "shortcut" | "gate" | "artifact" | "comeback" | "final";

export type Team = {
  id: string;
  name: string;
  color: string;
  currentCell: number;
  previousConfirmedCell: number;
  turnStartCell: number;
  cards: string[];
  correctCount: number;
  wrongCount: number;
  comboCount: number;
  shieldCount: number;
};

export type GameLog = { id: string; text: string; tone?: "good" | "bad" | "info" };

export type GameState = {
  teams: Team[];
  currentTurnIndex: number;
  phase: "roll" | "quiz" | "result" | "finished";
  diceValue: number | null;
  targetCell: number | null;
  message: string;
  logs: GameLog[];
  winnerTeamId?: string;
};

export type Quiz = { question: string; choices: string[]; answer: number; era: string };
