import type { Stroke } from "./types";

// 실행 취소/다시 실행 (SPEC F14). 획 배열 스냅숏을 쌓는다.
// 배열 원소는 참조만 공유하므로 스냅숏이 많아도 메모리 부담이 작다.

export interface InkHistory {
  past: Stroke[][];
  present: Stroke[];
  future: Stroke[][];
}

export type InkAction =
  | { type: "commit"; strokes: Stroke[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "reset" };

const LIMIT = 100;

export const emptyHistory: InkHistory = { past: [], present: [], future: [] };

export function inkReducer(state: InkHistory, action: InkAction): InkHistory {
  switch (action.type) {
    case "commit":
      if (action.strokes === state.present) return state;
      return {
        past: [...state.past, state.present].slice(-LIMIT),
        present: action.strokes,
        future: [],
      };
    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present].slice(-LIMIT), present: next, future: rest };
    }
    case "clear":
      if (state.present.length === 0) return state;
      return { past: [...state.past, state.present].slice(-LIMIT), present: [], future: [] };
    case "reset":
      return emptyHistory;
  }
}

/** 페이지 id별 필기 기록. 실행 취소도 페이지마다 따로 동작한다. */
export type InkBook = Record<string, InkHistory>;

export function applyInk(book: InkBook, pageId: string, action: InkAction): InkBook {
  const prev = book[pageId] ?? emptyHistory;
  const next = inkReducer(prev, action);
  return next === prev ? book : { ...book, [pageId]: next };
}
