"use client";

import { useEffect, useMemo, useState } from "react";
import { answer, createGame, defaultTeamSetups, roll } from "@/lib/game-engine/engine";
import { getCellKind, getEra, TOTAL_CELLS } from "@/lib/game-engine/board";
import type { GameState, Quiz, Team, TeamSetup } from "@/lib/game-engine/types";

const quizzes: Quiz[] = [
  { era: "고대", question: "고조선을 건국한 인물로 전해지는 사람은 누구일까요?", choices: ["주몽", "단군왕검", "박혁거세", "온조"], answer: 1 },
  { era: "고려·조선", question: "훈민정음을 창제한 조선의 왕은 누구일까요?", choices: ["세종", "태조", "정조", "광해군"], answer: 0 },
  { era: "개항기·일제강점기", question: "3·1 운동이 일어난 해는 언제일까요?", choices: ["1894년", "1910년", "1919년", "1945년"], answer: 2 },
  { era: "현대", question: "대한민국 정부가 수립된 해는 언제일까요?", choices: ["1945년", "1948년", "1950년", "1960년"], answer: 1 },
];

const icons: Record<string, string> = { normal: "·", bonus: "✦", trap: "⚠", shortcut: "↗", gate: "⌁", artifact: "◈", comeback: "↺", final: "★" };
const tokenChoices = ["🐉", "🦁", "🦉", "🐯", "🦊", "🐼", "🐸", "🐙", "🦄", "🦅", "🐺", "🦋"];
const colorChoices = ["#3b82f6", "#f59e0b", "#a855f7", "#ef476f", "#14b8a6", "#f97316", "#ec4899", "#06b6d4", "#84cc16", "#eab308", "#8b5cf6", "#fb7185"];

function cellClass(cell: number, trail: { from: number; to: number } | null) {
  const kind = getCellKind(cell);
  const isTrail = trail !== null && cell > trail.from && cell <= trail.to;
  return `cell cell-${kind}${isTrail ? " cell--trail" : ""}${trail?.from === cell ? " cell--trail-start" : ""}${trail?.to === cell ? " cell--trail-destination" : ""}`;
}

function setupFor(index: number): TeamSetup {
  return { id: `team-${index + 1}`, name: `${index + 1}팀`, color: colorChoices[index % colorChoices.length], token: tokenChoices[index % tokenChoices.length] };
}

export default function Home() {
  const [teamDrafts, setTeamDrafts] = useState<TeamSetup[]>(defaultTeamSetups);
  const [gameStarted, setGameStarted] = useState(false);
  const [game, setGame] = useState<GameState>(createGame);
  const [seconds, setSeconds] = useState(30);
  const [dicePhase, setDicePhase] = useState<"idle" | "rolling" | "revealed" | "moving">("idle");
  const [rollingFace, setRollingFace] = useState<number | null>(null);
  const [movingCell, setMovingCell] = useState<number | null>(null);
  const [trail, setTrail] = useState<{ from: number; to: number } | null>(null);
  const current = game.teams[game.currentTurnIndex];
  const rankedTeams = useMemo(() => [...game.teams].sort((a, b) => b.currentCell - a.currentCell), [game.teams]);
  const question = quizzes.find((quiz) => quiz.era === getEra(game.targetCell ?? 1)) ?? quizzes[0];

  useEffect(() => {
    if (game.phase !== "quiz") return;
    const timer = window.setTimeout(() => {
      if (seconds <= 1) {
        setGame((state) => answer(state, false));
        setSeconds(30);
        return;
      }
      setSeconds((value) => value - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [game.phase, seconds]);

  function updateTeam(index: number, patch: Partial<TeamSetup>) {
    setTeamDrafts((teams) => teams.map((team, teamIndex) => teamIndex === index ? { ...team, ...patch } : team));
  }

  function addTeam() {
    setTeamDrafts((teams) => teams.length >= 12 ? teams : [...teams, setupFor(teams.length)]);
  }

  function removeTeam(index: number) {
    setTeamDrafts((teams) => teams.length <= 2 ? teams : teams.filter((_, teamIndex) => teamIndex !== index));
  }

  function startGame() {
    const teams = teamDrafts.map((team, index) => ({ ...team, name: team.name.trim() || `${index + 1}팀` }));
    setGame(createGame(teams));
    setTrail(null);
    setMovingCell(null);
    setDicePhase("idle");
    setGameStarted(true);
  }

  function rollDice() {
    if (dicePhase !== "idle") return;
    const value = Math.floor(Math.random() * 6) + 1;
    const from = current.currentCell;
    const target = Math.min(from + value, TOTAL_CELLS);
    let turns = 0;
    setDicePhase("rolling");
    setRollingFace(Math.floor(Math.random() * 6) + 1);
    const diceInterval = window.setInterval(() => {
      setRollingFace(Math.floor(Math.random() * 6) + 1);
      turns += 1;
      if (turns < 10) return;
      window.clearInterval(diceInterval);
      setRollingFace(value);
      setTrail({ from, to: target });
      setDicePhase("revealed");
      window.setTimeout(() => {
        setDicePhase("moving");
        let next = from;
        const stepForward = () => {
          next += 1;
          setMovingCell(next);
          if (next < target) {
            window.setTimeout(stepForward, 260);
            return;
          }
          window.setTimeout(() => {
            setMovingCell(null);
            setDicePhase("idle");
            setSeconds(30);
            setGame((state) => roll(state, value));
          }, 320);
        };
        stepForward();
      }, 1000);
    }, 85);
  }

  function submit(choice: number) { setGame((state) => answer(state, choice === question.answer)); }

  function displayTeams(): Team[] {
    return game.teams.map((team) => team.id === current.id && movingCell !== null ? { ...team, currentCell: movingCell } : team);
  }

  if (!gameStarted) {
    return <main className="setup-shell"><section className="setup-card"><p className="eyebrow">HISTORY EXPEDITION · CLASSROOM EDITION</p><h1>원정대를 <span>구성하세요</span></h1><p className="setup-copy">학생 팀마다 이름과 말을 선택합니다. 2팀부터 최대 12팀까지 참여할 수 있어요.</p><div className="team-config-list">{teamDrafts.map((team, index) => <article className="team-config" key={team.id}><span className="config-number">{String(index + 1).padStart(2, "0")}</span><input aria-label={`${index + 1}팀 이름`} value={team.name} maxLength={16} onChange={(event) => updateTeam(index, { name: event.target.value })} /><div className="token-picker" aria-label={`${index + 1}팀 말 선택`}>{tokenChoices.map((token) => <button className={team.token === token ? "token-choice selected" : "token-choice"} type="button" key={token} onClick={() => updateTeam(index, { token })}>{token}</button>)}</div><input className="color-input" aria-label={`${index + 1}팀 색상`} type="color" value={team.color} onChange={(event) => updateTeam(index, { color: event.target.value })} />{teamDrafts.length > 2 && <button className="remove-team" type="button" onClick={() => removeTeam(index)} aria-label={`${team.name} 삭제`}>×</button>}</article>)}</div><div className="setup-actions"><button className="add-team" type="button" onClick={addTeam} disabled={teamDrafts.length >= 12}>+ 팀 추가 ({teamDrafts.length}/12)</button><button className="start-game" type="button" onClick={startGame}>게임 시작 <span>→</span></button></div></section></main>;
  }

  const teamsOnBoard = displayTeams();
  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">HISTORY EXPEDITION · CLASSROOM EDITION</p><h1>역사 원정대 <span>퀴즈 보드 레이스</span></h1></div><div className="turn-pill"><b>{game.phase === "finished" ? "GAME OVER" : `${game.currentTurnIndex + 1}번째 원정`}</b><span>{game.phase === "finished" ? "최종 관문 돌파" : `${current.name}의 차례`}</span></div></header>
    <section className="game-grid">
      <aside className="panel ranking"><div className="panel-label">원정 현황</div><h2>팀 순위</h2>{rankedTeams.map((team, index) => <div className="team-row" key={team.id}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="rank-token">{team.token}</span><div><b>{team.name}</b><small>{team.currentCell}번 칸 · 정답 {team.correctCount}</small></div><strong>{team.comboCount}×</strong></div>)}<div className="legend"><span><i className="bonus-dot" /> 보너스</span><span><i className="trap-dot" /> 함정</span><span><i className="gate-dot" /> 관문</span></div></aside>
      <section className="board-wrap" aria-label="80칸 역사 보드"><div className="board-title"><span>01 · 고대</span><span>02 · 고려·조선</span><span>03 · 격변의 시대</span><span>04 · 현대</span></div><div className="board-road"><span>HISTORY ROAD</span></div><div className="board">{Array.from({ length: TOTAL_CELLS }, (_, index) => TOTAL_CELLS - index).map((cell) => { const occupants = teamsOnBoard.filter((team) => team.currentCell === cell); const trailStep = trail && cell > trail.from && cell <= trail.to ? cell - trail.from : null; return <div className={cellClass(cell, trail)} key={cell} data-cell={cell}><span className="cell-number">{cell}</span><span className="cell-icon">{icons[getCellKind(cell)]}</span>{trailStep !== null && <span className="trail-step">{trailStep}</span>}<div className="pieces">{occupants.map((team) => <span className={`piece${team.id === current.id ? " piece--active" : ""}`} key={team.id} title={team.name} aria-label={`${team.name} 말`} style={{ "--team-color": team.color } as React.CSSProperties}>{team.token}</span>)}</div></div>; })}</div><div className="start-line"><span className="start-zone">START <span className="start-pieces">{teamsOnBoard.filter((team) => team.currentCell === 0).map((team) => <i className="start-piece" key={team.id} title={team.name} style={{ "--team-color": team.color } as React.CSSProperties}>{team.token}</i>)}</span></span><b>{trail ? `${trail.from}번 → ${trail.to}번 이동 경로` : "고대 문명의 문을 열어라"}</b><span>FINISH</span></div></section>
      <aside className="panel controls"><div className="panel-label">현재 턴</div><h2 style={{ color: current.color }}>{current.name}</h2><p className="status-message">{dicePhase === "revealed" ? `${rollingFace}이(가) 나왔습니다. 잠시 후 이동합니다.` : dicePhase === "moving" ? "말이 한 칸씩 이동 중입니다…" : game.message}</p><div className={`dice${dicePhase === "rolling" ? " dice--rolling" : ""}${dicePhase === "revealed" ? " dice--revealed" : ""}`} aria-label={dicePhase === "rolling" ? "주사위 굴리는 중" : "주사위 결과"}><span>{dicePhase === "idle" ? game.diceValue ?? "?" : rollingFace}</span></div><button className="roll-button" onClick={rollDice} disabled={game.phase !== "roll" || dicePhase !== "idle"}>{dicePhase === "rolling" ? "주사위 굴리는 중…" : dicePhase === "revealed" ? "숫자 확인 중…" : dicePhase === "moving" ? "말 이동 중…" : "주사위 굴리기"} <span>↻</span></button><div className="card-area"><span>보유 카드</span><div>{current.cards.length ? current.cards.map((card, index) => <button key={`${card}-${index}`} className="card" type="button">{card}</button>) : <em>아직 카드가 없습니다</em>}</div></div><div className="events"><span>최근 원정 기록</span>{game.logs.slice(-3).reverse().map((entry) => <p className={entry.tone} key={entry.id}>{entry.text}</p>)}</div><button className="reset" onClick={() => setGameStarted(false)}>팀 다시 설정</button></aside>
    </section>
    {game.phase === "quiz" && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="역사 퀴즈"><section className="quiz-modal"><div className="quiz-head"><span>{question.era} · 역사 퀴즈</span><b className={seconds <= 10 ? "danger" : ""}>00:{String(seconds).padStart(2, "0")}</b></div><p className="quiz-kicker">이동을 확정하려면 정답을 맞혀야 합니다</p><h2>{question.question}</h2><div className="choices">{question.choices.map((choice, index) => <button onClick={() => submit(index)} key={choice}><b>{String.fromCharCode(65 + index)}</b>{choice}</button>)}</div><p className="quiz-foot">시간이 끝나면 원래 칸으로 돌아갑니다.</p></section></div>}
    {game.phase === "finished" && <div className="modal-backdrop"><section className="quiz-modal victory"><p className="quiz-kicker">FINAL GATE CLEARED</p><h2>{game.teams.find((team) => team.id === game.winnerTeamId)?.name}의 역사 원정 성공!</h2><p>80번 최종 관문을 통과했습니다.</p><button className="roll-button" onClick={() => setGameStarted(false)}>새 원정대 구성하기</button></section></div>}
  </main>;
}
