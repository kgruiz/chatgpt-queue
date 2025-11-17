import { Window } from "happy-dom";
import type { QueueModelDefinition, QueueModelGroupMeta } from "../src/lib/types";

export interface ComposerFixture {
  root: HTMLElement;
  editor: HTMLElement;
  sendButton: HTMLButtonElement;
  voiceButton: HTMLButtonElement;
  uploadButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
}

export const setupHappyDom = () => {
  const windowInstance = new Window({ url: "https://chat.openai.com/" });
  const { document } = windowInstance;

  globalThis.window = windowInstance as unknown as typeof window;
  globalThis.document = document as unknown as Document;
  globalThis.HTMLElement = windowInstance.HTMLElement as unknown as typeof HTMLElement;
  globalThis.HTMLButtonElement = windowInstance.HTMLButtonElement as unknown as typeof HTMLButtonElement;
  globalThis.HTMLInputElement = windowInstance.HTMLInputElement as unknown as typeof HTMLInputElement;
  globalThis.Node = windowInstance.Node as unknown as typeof Node;
  globalThis.MutationObserver = windowInstance.MutationObserver as unknown as typeof MutationObserver;
  globalThis.navigator = windowInstance.navigator as Navigator;
  globalThis.requestAnimationFrame = windowInstance.requestAnimationFrame.bind(
    windowInstance,
  ) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowInstance.cancelAnimationFrame.bind(
    windowInstance,
  ) as unknown as typeof cancelAnimationFrame;

  return {
    window: windowInstance,
    cleanup: () => {
      document.body.innerHTML = "";
    },
  };
};

export const buildComposerDom = (doc: Document): ComposerFixture => {
  const root = doc.createElement("form");
  root.setAttribute("data-testid", "composer");

  const editor = doc.createElement("div");
  editor.id = "prompt-textarea";
  editor.className = "ProseMirror";
  editor.setAttribute("contenteditable", "true");
  root.appendChild(editor);

  const sendButton = doc.createElement("button");
  sendButton.type = "button";
  sendButton.setAttribute("data-testid", "send-button");
  sendButton.setAttribute("aria-label", "Send prompt");
  root.appendChild(sendButton);

  const voiceButton = doc.createElement("button");
  voiceButton.type = "button";
  voiceButton.setAttribute("aria-label", "Start voice mode");
  root.appendChild(voiceButton);

  const uploadButton = doc.createElement("button");
  uploadButton.type = "button";
  uploadButton.setAttribute("aria-label", "Upload files");
  uploadButton.setAttribute("data-testid", "file-upload-button");
  root.appendChild(uploadButton);

  const fileInput = doc.createElement("input");
  fileInput.type = "file";
  fileInput.setAttribute("accept", "image/png,image/jpeg,image/webp");
  fileInput.multiple = true;
  root.appendChild(fileInput);

  const shortcutAnchor = doc.createElement("button");
  shortcutAnchor.type = "button";
  shortcutAnchor.setAttribute("aria-label", "Open keyboard shortcuts");
  root.appendChild(shortcutAnchor);

  doc.body.appendChild(root);

  return {
    root,
    editor,
    sendButton,
    voiceButton,
    uploadButton,
    fileInput,
  };
};

export const ensureModelSwitcherButton = (doc: Document): HTMLButtonElement => {
  const button = doc.createElement("button");
  button.type = "button";
  button.setAttribute("data-testid", "model-switcher-dropdown-button");
  button.textContent = "Model Switcher";
  doc.body.appendChild(button);
  return button;
};

export const sampleGroupMeta: Record<string, QueueModelGroupMeta> = {
  advanced: { label: "Advanced", order: 50 },
};

export const sampleModels: QueueModelDefinition[] = [
  {
    id: "gpt-5-1",
    label: "Auto",
    description: "Decides how long to think",
    section: "GPT-5.1",
    order: 0,
    selected: true,
  },
  {
    id: "gpt-5-1-instant",
    label: "Instant",
    description: "Answers right away",
    section: "GPT-5.1",
    order: 1,
  },
  {
    id: "gpt-5-1-thinking",
    label: "Thinking",
    description: "Thinks longer",
    section: "GPT-5.1",
    order: 2,
  },
  { id: "gpt-4o", label: "GPT-4o", section: "GPT-4", order: 10 },
  { id: "gpt-4o-mini", label: "GPT-4o mini", section: "GPT-4", order: 11 },
  { id: "canvas", label: "Canvas", group: "advanced", groupLabel: "Advanced tools", order: 100 },
  { id: "realtime", label: "Realtime", group: "advanced", order: 110 },
];

