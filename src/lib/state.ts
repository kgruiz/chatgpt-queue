import type {
  QueueEntry,
  QueueModelDefinition,
  QueueModelGroupMeta,
  QueuePhase,
  ShortcutConfig,
} from "./types";

export interface QueueState {
  running: boolean;
  queue: QueueEntry[];
  busy: boolean;
  cooldownMs: number;
  collapsed: boolean;
  phase: QueuePhase;
  models: QueueModelDefinition[];
  paused: boolean;
  pauseReason: string;
  pausedAt: number | null;
  modelSections: string[];
  modelGroups: Record<string, QueueModelGroupMeta>;
  shortcuts: ShortcutConfig;
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
  shortcuts: {},
});
