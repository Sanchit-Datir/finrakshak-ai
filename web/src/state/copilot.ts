import type { AssistFact, AssistResult, AssistTask } from '@finrakshak-ai/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { targetKey, type CopilotTarget } from '../lib/assist/context.js';

/**
 * Copilot panel state for this tab: whether it is open, which record the current page shows, and the
 * answers so far per record (kept in memory only; nothing is saved).
 */

export type TurnSource = 'gemini' | 'mock' | 'simulated';

export interface CopilotTurn {
  id: string;
  task: AssistTask;
  question: string;
  status: 'running' | 'done' | 'error';
  result: AssistResult | null;
  source: TurnSource;
  error: string | null;
  /** The facts that were sent, and where each opens in the app. */
  facts: AssistFact[];
  links: Record<string, string>;
}

interface CopilotState {
  open: boolean;
  /** Record of the current page; null means the portfolio. */
  target: CopilotTarget | null;
  threads: Readonly<Record<string, readonly CopilotTurn[]>>;
}

let state: CopilotState = { open: false, target: null, threads: {} };
const listeners = new Set<() => void>();

function update(next: Partial<CopilotState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useCopilot(): CopilotState {
  return useSyncExternalStore(subscribe, () => state);
}

export function openCopilot(): void {
  update({ open: true });
}

export function closeCopilot(): void {
  update({ open: false });
}

export function currentTarget(): CopilotTarget {
  return state.target ?? { kind: 'portfolio' };
}

export function putTurn(key: string, turn: CopilotTurn): void {
  const thread = state.threads[key] ?? [];
  const at = thread.findIndex((t) => t.id === turn.id);
  const next = at === -1 ? [...thread, turn] : thread.map((t, i) => (i === at ? turn : t));
  update({ threads: { ...state.threads, [key]: next } });
}

export function clearThread(key: string): void {
  update({ threads: { ...state.threads, [key]: [] } });
}

/** Tells the copilot which record this page shows, for as long as the page is open. */
export function useCopilotTarget(target: CopilotTarget | null): void {
  const key = target === null ? null : targetKey(target);
  const kind = target?.kind;
  const id = target !== null && target.kind !== 'portfolio' ? target.id : null;
  useEffect(() => {
    if (key === null || kind === undefined) return;
    update({ target: kind === 'portfolio' || id === null ? { kind: 'portfolio' } : { kind, id } });
    return () => {
      if (state.target !== null && targetKey(state.target) === key) update({ target: null });
    };
  }, [key, kind, id]);
}
