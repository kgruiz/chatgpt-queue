import type { QueueEntry } from "./types";

export interface QueueState {
  running: boolean;
  queue: QueueEntry[];
  busy: boolean;
  cooldownMs: number;
  collapsed: boolean;
  phase: string;
  models: unknown[];
  paused: boolean;
  pauseReason: string;
  pausedAt: number | null;
  modelSections: unknown[];
  modelGroups: Record<string, unknown>;
}

export const createInitialState = (): QueueState => ({
  running: false,
  queue: [],
  busy: false,
  cooldownMs: 900,
  collapsed: false,
  phase: "idle",
  models: [],
  paused: false,
  pauseReason: "",
  pausedAt: null,
  modelSections: [],
  modelGroups: {},
});
