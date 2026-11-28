/**
 * `from`: the slide on its way out while the next one comes in (null once it has gone), `dir`: 1 forward, -1 back.
 * `run` goes up by one on every step, so the slide shown at `run - 1` is always the one leaving.
 */
export type SlideState = { index: number; done: boolean; run: number; from: number | null; dir: 1 | -1 };
export type SlideAction = { type: "go"; to: number; count: number } | { type: "finish" } | { type: "settle"; run: number };

export function slideStep(state: SlideState, action: SlideAction): SlideState {
  if (action.type === "finish") return { ...state, done: true };
  if (action.type === "settle") return action.run === state.run ? { ...state, from: null } : state;
  const index = Math.max(0, Math.min(action.count - 1, action.to));
  return { index, done: false, run: state.run + 1, from: state.index, dir: index < state.index ? -1 : 1 };
}
