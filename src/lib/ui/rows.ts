import type { Attachment } from "../types";
import { UI_CLASS } from "./classes";
import { h, svg } from "./template";

export interface QueueRowSkeletonOptions {
  index: number;
  isNext: boolean;
}

export interface QueueRowSkeletonElements {
  row: HTMLDivElement;
  indicator: HTMLInputElement;
  body: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  actions: HTMLDivElement;
}

export const createQueueRowSkeleton = (
  { index, isNext }: QueueRowSkeletonOptions,
): QueueRowSkeletonElements => {
  const row = h("div", {
    classes: [UI_CLASS.row, UI_CLASS.rowShadow],
    dataset: { index: String(index) },
  }) as HTMLDivElement;
  if (isNext) {
    row.classList.add(UI_CLASS.rowNext);
  }
  row.draggable = true;

  const indicator = h("input", {
    classes: [UI_CLASS.rowIndicator],
    attrs: {
      type: "text",
      inputmode: "numeric",
      autocomplete: "off",
      spellcheck: "false",
      title: "Reorder follow-up",
      "aria-label": "Move follow-up to new position",
    },
  }) as HTMLInputElement;
  indicator.inputMode = "numeric";
  indicator.enterKeyHint = "done";
  indicator.autocomplete = "off";
  indicator.spellcheck = false;
  indicator.draggable = false;

  const body = h("div", { classes: [UI_CLASS.rowBody] }) as HTMLDivElement;
  const textarea = h("textarea", {
    classes: [UI_CLASS.rowTextarea],
    attrs: {
      placeholder: "Empty follow-up",
      rows: 1,
    },
  }) as HTMLTextAreaElement;
  textarea.spellcheck = true;
  textarea.draggable = false;
  textarea.rows = 1;
  body.appendChild(textarea);

  const actions = h("div", { classes: [UI_CLASS.rowActions] }) as HTMLDivElement;

  row.append(indicator, body, actions);

  return { row, indicator, body, textarea, actions };
};

export interface AttachmentPreviewOptions {
  entryIndex?: number;
  onLoad?: () => void;
}

export const createAttachmentPreview = (
  attachment: Attachment,
  options: AttachmentPreviewOptions = {},
): HTMLDivElement => {
  const wrapper = h("div", {
    classes: [UI_CLASS.mediaWrapper],
  }) as HTMLDivElement;
  if (attachment?.id) {
    wrapper.dataset.attachmentId = attachment.id;
  }
  if (typeof options.entryIndex === "number") {
    wrapper.dataset.entryIndex = String(options.entryIndex);
  }

  const thumb = h("img", {
    classes: [UI_CLASS.mediaThumb],
    attrs: {
      src: attachment.dataUrl,
      alt: attachment.name || "Image attachment",
      loading: "lazy",
    },
  }) as HTMLImageElement;
  const notify = () => options.onLoad?.();
  thumb.addEventListener("load", notify);
  thumb.addEventListener("error", notify);
  wrapper.appendChild(thumb);

  const meta = h("div", { classes: [UI_CLASS.mediaMeta] }) as HTMLDivElement;
  meta.textContent = attachment.name || "Image";
  if (attachment.name) {
    meta.title = attachment.name;
  }
  wrapper.appendChild(meta);

  const removeButton = h("button", {
    classes: [UI_CLASS.mediaRemove],
    attrs: { type: "button" },
  }) as HTMLButtonElement;
  removeButton.textContent = "Remove";
  if (attachment?.id) {
    removeButton.dataset.attachmentRemove = attachment.id;
  }
  if (typeof options.entryIndex === "number") {
    removeButton.dataset.entryIndex = String(options.entryIndex);
  }
  wrapper.appendChild(removeButton);

  return wrapper;
};

export const createAttachmentList = (entryIndex: number): HTMLDivElement => {
  const list = h("div", {
    classes: [UI_CLASS.rowMedia],
    dataset: { entryIndex: String(entryIndex) },
  }) as HTMLDivElement;
  return list;
};

export type QueueIconAction = "send" | "delete";

const ICON_PATHS: Record<QueueIconAction, string> = {
  send: "M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z",
  delete: "M10.6299 1.33496C12.0335 1.33496 13.2695 2.25996 13.666 3.60645L13.8809 4.33496H17L17.1338 4.34863C17.4369 4.41057 17.665 4.67858 17.665 5C17.665 5.32142 17.4369 5.58943 17.1338 5.65137L17 5.66504H16.6543L15.8574 14.9912C15.7177 16.629 14.3478 17.8877 12.7041 17.8877H7.2959C5.75502 17.8877 4.45439 16.7815 4.18262 15.2939L4.14258 14.9912L3.34668 5.66504H3C2.63273 5.66504 2.33496 5.36727 2.33496 5C2.33496 4.63273 2.63273 4.33496 3 4.33496H6.11914L6.33398 3.60645L6.41797 3.3584C6.88565 2.14747 8.05427 1.33496 9.37012 1.33496H10.6299ZM5.46777 14.8779L5.49121 15.0537C5.64881 15.9161 6.40256 16.5576 7.2959 16.5576H12.7041C13.6571 16.5576 14.4512 15.8275 14.5322 14.8779L15.3193 5.66504H4.68164L5.46777 14.8779ZM7.66797 12.8271V8.66016C7.66797 8.29299 7.96588 7.99528 8.33301 7.99512C8.70028 7.99512 8.99805 8.29289 8.99805 8.66016V12.8271C8.99779 13.1942 8.70012 13.4912 8.33301 13.4912C7.96604 13.491 7.66823 13.1941 7.66797 12.8271ZM11.002 12.8271V8.66016C11.002 8.29289 11.2997 7.99512 11.667 7.99512C12.0341 7.9953 12.332 8.293 12.332 8.66016V12.8271C12.3318 13.1941 12.0339 13.491 11.667 13.4912C11.2999 13.4912 11.0022 13.1942 11.002 12.8271ZM9.37012 2.66504C8.60726 2.66504 7.92938 3.13589 7.6582 3.83789L7.60938 3.98145L7.50586 4.33496H12.4941L12.3906 3.98145C12.1607 3.20084 11.4437 2.66504 10.6299 2.66504H9.37012Z",
};

export const createQueueIconButton = (
  type: QueueIconAction,
): HTMLButtonElement => {
  const classes: string[] = [UI_CLASS.iconButton];
  if (type === "send") {
    classes.push(UI_CLASS.iconButtonSend);
  } else {
    classes.push(UI_CLASS.iconButtonDelete);
  }
  const button = h("button", {
    classes,
    attrs: { type: "button" },
  }) as HTMLButtonElement;

  const icon = svg("svg", {
    attrs: {
      width: 20,
      height: 20,
      viewBox: "0 0 20 20",
      fill: "currentColor",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": "true",
      focusable: "false",
    },
  },
  svg("path", { attrs: { d: ICON_PATHS[type] } }));

  button.appendChild(icon);
  return button;
};

export interface QueueModelButtonElements {
  button: HTMLButtonElement;
  value: HTMLSpanElement;
}

export const createModelButton = (): QueueModelButtonElements => {
  const value = h("span", {
    classes: [UI_CLASS.modelButtonValue],
  }) as HTMLSpanElement;
  const button = h("button", {
    classes: [UI_CLASS.modelButton],
    attrs: { type: "button" },
  }) as HTMLButtonElement;
  button.appendChild(value);
  return { button, value };
};
