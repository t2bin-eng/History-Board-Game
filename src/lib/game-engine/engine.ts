import { getCellKind, shortcuts, TOTAL_CELLS } from "./board";
import type { GameState, Team, TeamSetup } from "./types";

const log = (text: string, tone: "good" | "bad" | "info" = "info") => ({ id: crypto.randomUUID(), text, tone });

export const defaultTeamSetups: TeamSetup[] = [
  { id: "blue", name: "청룡 원정대", color: "#3b82f6", token: "🐉" },
  { id: "amber", name: "황금 원정대", color: "#f59e0b", token: "🦁" },
  { id: "violet", name: "자주 원정대", color: "#a855f7", token: "🦉" },
];

export function createGame(setups: TeamSetup[] = defaultTeamSetups): GameState {
  const teams: Team[] = setups.map((setup, index) => ({
    ...setup,
    currentCell: 0,
    previousConfirmedCell: 0,
    turnStartCell: 0,
    cards: index === 0 ? ["힌트"] : index === 1 ? ["보호막"] : [],
    correctCount: 0,
    wrongCount: 0,
    comboCount: 0,
    shieldCount: index === 1 ? 1 : 0,
  }));
  return {
    teams,
    currentTurnIndex: 0, phase: "roll", diceValue: null, targetCell: null,
    message: "주사위를 굴려 역사 원정을 시작하세요.",
    logs: [log("게임이 시작되었습니다. 청룡 원정대의 차례입니다.")],
  };
}

export function roll(state: GameState, value: number): GameState {
  const team = state.teams[state.currentTurnIndex];
  const target = Math.min(team.currentCell + value, TOTAL_CELLS);
  const teams = state.teams.map((item, index) => index === state.currentTurnIndex ? { ...item, turnStartCell: item.currentCell, currentCell: target } : item);
  return { ...state, teams, phase: "quiz", diceValue: value, targetCell: target, message: `${team.name}이(가) ${value}칸 이동했습니다. 퀴즈에 정답을 맞혀 이동을 확정하세요.` };
}

function nextTurn(state: GameState, message: string, extraLogs: GameState["logs"]): GameState {
  const next = (state.currentTurnIndex + 1) % state.teams.length;
  return { ...state, currentTurnIndex: next, phase: "roll", diceValue: null, targetCell: null, message, logs: [...extraLogs, log(`${state.teams[next].name}의 차례입니다.`)] };
}

function resolveOccupiedCell(teams: Team[], attackerIndex: number, target: number): { teams: Team[]; note?: string; defended?: boolean } {
  const defenderIndex = teams.findIndex((team, index) => index !== attackerIndex && team.currentCell === target && target !== 0);
  if (defenderIndex < 0) return { teams };
  const defender = teams[defenderIndex];
  if (defender.shieldCount > 0) {
    const result = teams.map((team, index) => index === defenderIndex ? { ...team, shieldCount: team.shieldCount - 1, cards: team.cards.filter(card => card !== "보호막") } : index === attackerIndex ? { ...team, currentCell: team.turnStartCell } : team);
    return { teams: result, note: `${defender.name}이(가) 보호막으로 점령을 막았습니다.`, defended: true };
  }
  let returnCell = defender.previousConfirmedCell;
  const occupied = teams.some((team, index) => index !== defenderIndex && team.currentCell === returnCell && returnCell !== 0);
  if (occupied) returnCell = Math.max(0, returnCell - 2);
  const result = teams.map((team, index) => index === defenderIndex ? { ...team, currentCell: returnCell } : team);
  return { teams: result, note: `${teams[attackerIndex].name}이(가) ${defender.name}을(를) 점령했습니다.` };
}

export function answer(state: GameState, correct: boolean): GameState {
  const index = state.currentTurnIndex;
  const team = state.teams[index];
  if (!correct) {
    const teams = state.teams.map((item, itemIndex) => itemIndex === index ? { ...item, currentCell: item.turnStartCell, wrongCount: item.wrongCount + 1, comboCount: 0 } : item);
    return nextTurn({ ...state, teams }, `${team.name}의 오답. 원래 위치로 돌아갑니다.`, [...state.logs, log(`${team.name}: 퀴즈 오답 → ${team.turnStartCell}번 칸 복귀`, "bad")]);
  }
  const target = state.targetCell ?? team.currentCell;
  let teams = state.teams.map((item, itemIndex) => itemIndex === index ? { ...item, previousConfirmedCell: target, correctCount: item.correctCount + 1, comboCount: item.comboCount + 1 } : item);
  const capture = resolveOccupiedCell(teams, index, target);
  teams = capture.teams;
  const kind = getCellKind(target);
  let event = "이동이 확정되었습니다.";
  if (!capture.defended) {
    if (kind === "bonus") { teams = teams.map((item, i) => i === index ? { ...item, cards: [...item.cards, "시간 +5초"] } : item); event = "보너스 카드 ‘시간 +5초’를 획득했습니다."; }
    if (kind === "trap") { teams = teams.map((item, i) => i === index ? { ...item, currentCell: Math.max(0, item.currentCell - 2), previousConfirmedCell: Math.max(0, item.currentCell - 2) } : item); event = "함정 발동! 2칸 후퇴합니다."; }
    if (kind === "shortcut") { const exit = shortcuts[target]; if (exit) { teams = teams.map((item, i) => i === index ? { ...item, currentCell: exit, previousConfirmedCell: exit } : item); event = `지름길 성공! ${exit}번 칸으로 이동합니다.`; } }
    if (kind === "artifact") event = "역사 유물 조각을 획득했습니다.";
    if (kind === "gate") event = "시대 관문을 통과했습니다.";
  }
  if (target === TOTAL_CELLS) return { ...state, teams, phase: "finished", winnerTeamId: team.id, message: `${team.name}의 역사 원정 성공!`, logs: [...state.logs, log(`${team.name}이(가) 최종 관문을 통과했습니다!`, "good")] };
  const note = capture.note ? `${capture.note} ${event}` : event;
  return nextTurn({ ...state, teams }, note, [...state.logs, log(`${team.name}: 정답 → ${target}번 칸 확정. ${note}`, "good")]);
}
