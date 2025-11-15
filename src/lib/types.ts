export type ThinkingLevel = "light" | "standard" | "extended" | "heavy";

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
