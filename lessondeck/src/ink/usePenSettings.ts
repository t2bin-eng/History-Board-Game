import { useCallback, useEffect, useRef, useState } from "react";
import { ERASER_MODES, ERASER_TARGETS, loadEraserMode, loadEraserTarget, saveEraserMode, saveEraserTarget, type EraserMode, type EraserTarget } from "./eraser";
import { ERASER_LEVELS } from "./palette";
import { loadPenButton, savePenButton, type PenButtonAction } from "./penButton";
import { loadPresets, savePresets } from "./presets";
import { loadRecentColors, pushRecentColor, saveRecentColors, type RecentColors } from "./recentColors";
import { loadStabilize, saveStabilize, type StabilizeLevel } from "./smoothing";
import type { InkTool, PenPreset } from "./types";

/** 색을 바꾸고 이만큼 더 바꾸지 않으면 최근 색에 남긴다 (ms) */
const RECENT_SETTLE_MS = 1200;

/**
 * 펜 바·지우개 설정 (v0.40에 편집 화면에서 떼어 냄, SPEC 7장 "노트앱 확장" 1단계 기반 정리).
 * 펜 바의 펜들(기기에 기억), 고른 펜, 도구별 마지막 펜, S펜 버튼 동작, 지우개 크기·지울 것·지우는 방법.
 * 도구 고르기처럼 다른 모드(글상자·도형·웹 페이지)와 엮인 동작은 편집 화면에 남긴다.
 */
export function usePenSettings() {
  /** 펜 바의 펜들 (v0.33부터 기기에 기억) */
  const [presets, setPresets] = useState<PenPreset[]>(loadPresets);
  const firstOf = (t: InkTool) => (presets.find((p) => p.tool === t) ?? presets[0]).id;
  const [activePresetId, setActivePresetId] = useState(() => firstOf("pen"));
  const [lastByTool, setLastByTool] = useState<Record<InkTool, string>>(() => ({
    pen: firstOf("pen"),
    highlighter: firstOf("highlighter"),
  }));
  useEffect(() => savePresets(presets), [presets]);
  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];

  /** S펜 버튼을 누른 채 쓸 때 할 일 (v0.33): 지우개 · 레이저 펜 · 형광펜 — 기기에 기억 */
  const [penButton, setPenButtonState] = useState<PenButtonAction>(loadPenButton);
  const setPenButton = useCallback((a: PenButtonAction) => {
    setPenButtonState(a);
    savePenButton(a);
  }, []);

  const [eraserSize, setEraserSize] = useState(ERASER_LEVELS[1]);
  /** 지우개가 지울 것 (v0.32): 전부 · 펜만 · 형광펜만 — 기기에 기억 */
  const [eraserTarget, setEraserTargetState] = useState<EraserTarget>(loadEraserTarget);
  const setEraserTarget = useCallback((t: EraserTarget) => {
    setEraserTargetState(t);
    saveEraserTarget(t);
  }, []);
  /** 지우는 방법 (v0.40): 획 통째로 · 문지른 부분만 — 기기에 기억 */
  const [eraserMode, setEraserModeState] = useState<EraserMode>(loadEraserMode);
  const setEraserMode = useCallback((m: EraserMode) => {
    setEraserModeState(m);
    saveEraserMode(m);
  }, []);
  /** 손떨림 보정 세기 (v0.42): 기기에 기억 */
  const [stabilize, setStabilizeState] = useState<StabilizeLevel>(loadStabilize);
  const setStabilize = useCallback((level: StabilizeLevel) => {
    setStabilizeState(level);
    saveStabilize(level);
  }, []);

  /**
   * 최근 색 (v0.42): 펜·형광펜마다 고른 색, 기기에 기억. 잇달아 바꾸면(색 고르기 창을 끌거나 여러 칸을 누름)
   * 잠깐 멈춘 뒤의 마지막 색만 남긴다
   */
  const [recentColors, setRecentColors] = useState<RecentColors>(loadRecentColors);
  const recentTimer = useRef<Partial<Record<InkTool, ReturnType<typeof setTimeout>>>>({});
  const rememberColor = useCallback((tool: InkTool, color: string, now = false) => {
    const push = () =>
      setRecentColors((r) => {
        const next = pushRecentColor(r, tool, color);
        if (next !== r) saveRecentColors(next);
        return next;
      });
    clearTimeout(recentTimer.current[tool]);
    if (now) push();
    else recentTimer.current[tool] = setTimeout(push, RECENT_SETTLE_MS);
  }, []);
  useEffect(() => {
    const timers = recentTimer.current;
    return () => Object.values(timers).forEach((t) => clearTimeout(t));
  }, []);

  /** 도구 막대 지우개 이름에 붙는 말 ("· 형광펜만", "· 부분") */
  const eraserTargetLabel = ERASER_TARGETS.find((t) => t.id === eraserTarget)?.label ?? "전부";
  const eraserModeLabel = ERASER_MODES.find((m) => m.id === eraserMode)?.label ?? "획 통째로";

  return {
    presets,
    setPresets,
    activePresetId,
    setActivePresetId,
    activePreset,
    lastByTool,
    setLastByTool,
    penButton,
    setPenButton,
    eraserSize,
    setEraserSize,
    eraserTarget,
    setEraserTarget,
    eraserTargetLabel,
    eraserMode,
    setEraserMode,
    eraserModeLabel,
    stabilize,
    setStabilize,
    recentColors,
    rememberColor,
  };
}
