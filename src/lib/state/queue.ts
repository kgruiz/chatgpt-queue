import type { QueueEntry } from "../types";
import type { QueueState } from "../state";

export interface EnqueueQueueEntryOptions {
  index?: number;
}

export const enqueueQueueEntry = (
  state: QueueState,
  entry: QueueEntry,
  options: EnqueueQueueEntryOptions = {},
): number => {
  const { index } = options;
  if (typeof index === "number" && Number.isFinite(index)) {
    const targetIndex = clampInsertIndex(state.queue.length, index);
    state.queue.splice(targetIndex, 0, entry);
    return targetIndex;
  }

  state.queue.push(entry);
  return state.queue.length - 1;
};

export const removeQueueEntry = (
  state: QueueState,
  index: number,
): QueueEntry | null => {
  if (!Number.isInteger(index)) return null;
  if (index < 0 || index >= state.queue.length) return null;
  const [removed] = state.queue.splice(index, 1);
  return removed ?? null;
};

export const reorderQueueEntry = (
  state: QueueState,
  from: number,
  to: number,
): boolean => {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
  const length = state.queue.length;
  if (from < 0 || from >= length) return false;
  if (to < 0 || to >= length) return false;
  if (from === to) return false;
  const [entry] = state.queue.splice(from, 1);
  state.queue.splice(to, 0, entry);
  return true;
};

export interface PauseStateOptions {
  reason?: string;
  timestamp?: number;
}

export interface PauseStateResult {
  changed: boolean;
  paused: boolean;
  reason: string;
  pausedAt: number | null;
}

export const setQueuePauseState = (
  state: QueueState,
  next: boolean,
  options: PauseStateOptions = {},
): PauseStateResult => {
  const normalizedReason = next ? normalizePauseReason(options.reason) : "";
  const alreadyMatched =
    state.paused === next &&
    (next ? state.pauseReason === normalizedReason : true);
  if (alreadyMatched) {
    return {
      changed: false,
      paused: state.paused,
      reason: state.pauseReason,
      pausedAt: state.pausedAt,
    };
  }

  state.paused = next;
  if (state.paused) {
    state.pauseReason = normalizedReason;
    state.pausedAt = resolveTimestamp(options.timestamp);
  } else {
    state.pauseReason = "";
    state.pausedAt = null;
  }

  return {
    changed: true,
    paused: state.paused,
    reason: state.pauseReason,
    pausedAt: state.pausedAt,
  };
};

const clampInsertIndex = (length: number, value: number): number => {
  if (!Number.isFinite(value)) return length;
  const normalized = Math.trunc(value);
  if (normalized < 0) return 0;
  if (normalized > length) return length;
  return normalized;
};

const normalizePauseReason = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const resolveTimestamp = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : Date.now();
