import type { Attachment, QueueEntry, ThinkingLevel } from "./types";
import { cloneAttachment, normalizeAttachment } from "./attachments";

export type NormalizeThinkingFn = (value: unknown) => ThinkingLevel | null;

export interface QueueHelpers {
  normalizeEntry(entry: unknown): QueueEntry;
  cloneEntry(entry: QueueEntry): QueueEntry;
}

const coerceText = (value: unknown): string =>
  typeof value === "string" ? value : String(value ?? "");

const coerceModel = (value: unknown): string | null =>
  (typeof value === "string" && value.length > 0 ? value : null);

export const createQueueHelpers = (
  normalizeThinking: NormalizeThinkingFn,
): QueueHelpers => {
  const normalizeEntry = (entry: unknown): QueueEntry => {
    if (typeof entry === "string") {
      return {
        text: entry,
        attachments: [],
        model: null,
        modelLabel: null,
        thinking: null,
      };
    }

    if (!entry || typeof entry !== "object") {
      return {
        text: coerceText(entry),
        attachments: [],
        model: null,
        modelLabel: null,
        thinking: null,
      };
    }

    const payload = entry as Partial<QueueEntry> & { attachments?: unknown[] };

    const attachments = Array.isArray(payload.attachments)
      ? payload.attachments
          .map((item) => normalizeAttachment(item))
          .filter((value): value is Attachment => Boolean(value))
      : [];

    const model = coerceModel(payload.model);
    const modelLabel = coerceModel(payload.modelLabel);
    const thinking = normalizeThinking(payload.thinking as ThinkingLevel | null);

    return {
      text: coerceText(payload.text),
      attachments,
      model,
      modelLabel,
      thinking,
    };
  };

  const cloneEntry = (entry: QueueEntry): QueueEntry => ({
    text: entry.text,
    attachments: Array.isArray(entry.attachments)
      ? entry.attachments.map((attachment) => cloneAttachment(attachment))
      : [],
    model: entry.model || null,
    modelLabel: entry.modelLabel || null,
    thinking: normalizeThinking(entry.thinking) || null,
  });

  return { normalizeEntry, cloneEntry };
};
