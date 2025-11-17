export type ThinkingLevel = "light" | "standard" | "extended" | "heavy";

export interface ThinkingOption {
  id: ThinkingLevel;
  label: string;
  digit?: string;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
}

export interface QueueEntry {
  text: string;
  attachments: Attachment[];
  model: string | null;
  modelLabel: string | null;
  thinking: ThinkingLevel | null;
}

export type QueuePhase = "idle" | "sending" | "waiting";

export interface QueueModelDefinition {
  id: string;
  label: string;
  description?: string;
  section?: string;
  group?: string;
  groupLabel?: string;
  order?: number;
  selected?: boolean;
  modelLabel?: string;
}

export interface QueueModelGroupMeta {
  label: string;
  order: number;
}

export type ShortcutKeyToken =
  | "option"
  | "command"
  | "meta"
  | "shift"
  | "control"
  | "ctrl"
  | "alt"
  | "enter"
  | "return"
  | "delete"
  | "p"
  | "period"
  | "arrowup"
  | "arrowdown"
  | string;

export interface KeyboardShortcutEntry {
  id: string;
  label: string;
  macKeys: ShortcutKeyToken[];
  otherKeys: ShortcutKeyToken[];
}
