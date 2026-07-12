import { describe, expect, it } from "vitest";
import { answer, createGame, roll } from "./engine";

describe("history board game engine", () => {
  it("moves a team temporarily after a roll", () => {
    const state = roll(createGame(), 4);
    expect(state.teams[0].currentCell).toBe(4);
    expect(state.phase).toBe("quiz");
  });
  it("returns a team to the turn start position on a wrong answer", () => {
    const state = answer(roll(createGame(), 4), false);
    expect(state.teams[0].currentCell).toBe(0);
    expect(state.teams[0].wrongCount).toBe(1);
  });
  it("confirms movement and grants a bonus card", () => {
    const state = answer(roll(createGame(), 5), true);
    expect(state.teams[0].currentCell).toBe(5);
    expect(state.teams[0].cards).toContain("시간 +5초");
  });
  it("captures an opponent on a correct answer", () => {
    const game = createGame();
    game.teams[1] = { ...game.teams[1], currentCell: 4, previousConfirmedCell: 1, shieldCount: 0 };
    const state = answer(roll(game, 4), true);
    expect(state.teams[0].currentCell).toBe(4);
    expect(state.teams[1].currentCell).toBe(1);
  });
  it("consumes a shield and returns the attacker", () => {
    const game = createGame();
    game.teams[1] = { ...game.teams[1], currentCell: 4, previousConfirmedCell: 1, shieldCount: 1 };
    const state = answer(roll(game, 4), true);
    expect(state.teams[0].currentCell).toBe(0);
    expect(state.teams[1].currentCell).toBe(4);
    expect(state.teams[1].shieldCount).toBe(0);
  });
  it("takes a shortcut after a correct answer", () => {
    const state = answer(roll(createGame(), 6), true);
    const next = answer(roll({ ...state, currentTurnIndex: 0 }, 6), true);
    const shortcut = answer(roll({ ...next, currentTurnIndex: 0 }, 6), true);
    expect(shortcut.teams[0].currentCell).toBe(27);
  });
});
