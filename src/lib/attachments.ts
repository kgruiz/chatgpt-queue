import { isDebugSendEnabled } from "./env";
import type { Attachment } from "./types";
import { makeId, sleep, throttle } from "./utils";

const DATA_OR_BLOB_URL = /^(data|blob):/i;

const ATTACHMENT_SELECTORS = [
  '[data-testid="attachment-item"]',
  '[data-testid="chat-composer-attachment-item"]',
  '[data-testid="uploaded-file"]',
  '[data-testid="file-preview"]',
  '[data-testid="composer-upload-item"]',
  '[data-testid="attachment-preview"]',
];

const ATTACHMENT_REMOVE_SELECTORS = [
  'button[data-testid="attachment-item-remove"]',
  'button[data-testid="composer-upload-item-remove"]',
  'button[aria-label^="Remove"]',
  'button[aria-label^="Delete"]',
];

const REMOVE_QUERY = ATTACHMENT_REMOVE_SELECTORS.join(",");

const COMPOSER_INPUT_SELECTOR =
  'input[type="file"][accept*="image"], input[type="file"][accept*="png"], input[type="file"][accept*="jpg"], input[type="file"][accept*="jpeg"], input[type="file"][accept*="webp"], input[type="file"]';

const UPLOAD_TRIGGER_SELECTOR =
  'button[data-testid="file-upload-button"], button[aria-label="Upload files"], button[aria-label="Add file"], button[aria-label="Add files"], button[data-testid="upload-button"]';

type ComposerRoot = Document | HTMLElement | null;

const hasHTMLElement = typeof HTMLElement !== "undefined";
const hasHTMLInputElement = typeof HTMLInputElement !== "undefined";
const hasHTMLImageElement = typeof HTMLImageElement !== "undefined";
const hasDocument = typeof Document !== "undefined";
const hasMutationObserver = typeof MutationObserver !== "undefined";

const isHTMLElementNode = (node: unknown): node is HTMLElement =>
  Boolean(
    node &&
      (hasHTMLElement
        ? node instanceof HTMLElement
        : typeof (node as Partial<HTMLElement>).querySelector === "function" ||
            typeof (node as Partial<HTMLElement>).click === "function"),
  );

const isHTMLInputNode = (node: unknown): node is HTMLInputElement =>
  Boolean(
    node &&
      (hasHTMLInputElement
        ? node instanceof HTMLInputElement
        : typeof (node as Partial<HTMLInputElement>).files !== "undefined" &&
            typeof (node as { dispatchEvent?: unknown }).dispatchEvent === "function"),
  );

const isHTMLImageNode = (node: unknown): node is HTMLImageElement =>
  Boolean(
    node &&
      (hasHTMLImageElement
        ? node instanceof HTMLImageElement
        : typeof (node as Partial<HTMLImageElement>).src === "string"),
  );

const bytesToBase64 = (bytes: Uint8Array): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk =
      ((bytes[i] ?? 0) << 16) |
      ((bytes[i + 1] ?? 0) << 8) |
      (bytes[i + 2] ?? 0);
    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? alphabet[chunk & 63] : "=";
  }
  return output;
};

const readFileAsDataUrl = (file: File): Promise<string> => {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
          return;
        }
        reject(new Error("Failed to read file"));
      };
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buffer) => {
      const mime = file.type || "image/png";
      const base64 = bytesToBase64(new Uint8Array(buffer));
      return `data:${mime};base64,${base64}`;
    });
  }

  return Promise.reject(new Error("Failed to read file"));
};

const mimeFromDataUrl = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([^;,]+)/i);
  return match?.[1] || "image/png";
};

const elementHasQuery = (
  root: ComposerRoot,
): root is Document | HTMLElement =>
  Boolean(root && typeof (root as Document | HTMLElement).querySelectorAll === "function");

const ensureHTMLElement = (node: Element | null): HTMLElement | null =>
  (isHTMLElementNode(node) ? (node as HTMLElement) : null);

export const normalizeAttachment = (input: unknown): Attachment | null => {
  if (!input || typeof input !== "object") return null;
  const attachment = input as Partial<Attachment> & { dataUrl?: string };
  const dataUrl = typeof attachment.dataUrl === "string" ? attachment.dataUrl : null;
  if (!dataUrl) return null;

  const id =
    typeof attachment.id === "string" && attachment.id.length > 0 ? attachment.id : makeId();
  const name =
    typeof attachment.name === "string" && attachment.name.length > 0
      ? attachment.name
      : `image-${id}.png`;
  const mime =
    typeof attachment.mime === "string" && attachment.mime.length > 0
      ? attachment.mime
      : "image/png";

  return { id, name, mime, dataUrl };
};

export const cloneAttachment = (attachment: Attachment): Attachment => ({
  id: attachment.id,
  name: attachment.name,
  mime: attachment.mime,
  dataUrl: attachment.dataUrl,
});

export const createAttachmentFromFile = async (
  file: File,
): Promise<Attachment | null> => {
  const dataUrl = await readFileAsDataUrl(file);
  const extension = (file.type.split("/")[1] || "png").split(";")[0];
  return normalizeAttachment({
    id: makeId(),
    name: file.name || `image-${makeId()}.${extension}`,
    mime: file.type || "image/png",
    dataUrl,
  });
};

export const createAttachmentFromDataUrl = (
  dataUrl: string | null | undefined,
): Attachment | null => {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) return null;
  const mime = mimeFromDataUrl(dataUrl);
  const extension = mime.split("/")[1] || "png";
  return normalizeAttachment({
    id: makeId(),
    name: `image-${makeId()}.${extension}`,
    mime,
    dataUrl,
  });
};

export const hasImagesInDataTransfer = (dataTransfer: DataTransfer | null): boolean => {
  if (!dataTransfer) return false;
  const items = Array.from(dataTransfer.items || []);
  if (items.some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
    return true;
  }
  const files = Array.from(dataTransfer.files || []);
  return files.some((file) => file.type.startsWith("image/"));
};

export const collectImagesFromDataTransfer = async (
  dataTransfer: DataTransfer | null,
): Promise<Attachment[]> => {
  if (!dataTransfer) return [];
  const attachments: Attachment[] = [];
  const items = Array.from(dataTransfer.items || []);
  const files = items
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (!files.length && dataTransfer.files?.length) {
    Array.from(dataTransfer.files).forEach((file) => {
      if (file.type.startsWith("image/")) files.push(file);
    });
  }

  for (const file of files) {
    try {
      const attachment = await createAttachmentFromFile(file);
      if (attachment) attachments.push(attachment);
    } catch {
      // ignore file read issues
    }
  }

  return attachments;
};

export const attachmentToFile = async (
  attachment: Attachment | null | undefined,
): Promise<File | null> => {
  try {
    const normalized = normalizeAttachment(attachment);
    if (!normalized) return null;
    const response = await fetch(normalized.dataUrl);
    const blob = await response.blob();
    const mime = normalized.mime || blob.type || "image/png";
    const extension = mime.split("/")[1] || "png";
    const safeName = normalized.name || `image-${makeId()}.${extension}`;
    return new File([blob], safeName, { type: mime });
  } catch {
    return null;
  }
};

export const countFilesInInputs = (root: ComposerRoot): number => {
  if (!elementHasQuery(root)) return 0;
  return Array.from(root.querySelectorAll('input[type="file"]')).reduce((total, node) => {
    if (!isHTMLInputNode(node)) return total;
    return total + (node.files?.length || 0);
  }, 0);
};

const extractUrlsFromStyleValue = (value: string): string[] => {
  if (!value || value.toLowerCase() === "none") return [];
  const urls: string[] = [];
  const regex = /url\(([^)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const normalized = raw.replace(/^['"]|['"]$/g, "");
    if (DATA_OR_BLOB_URL.test(normalized)) {
      urls.push(normalized);
    }
  }
  return urls;
};

const collectPreviewDataUrls = (root: HTMLElement | null): string[] => {
  if (!root) return [];
  const urls = new Set<string>();

  const addUrl = (value: string | null) => {
    if (!value || !DATA_OR_BLOB_URL.test(value)) return;
    urls.add(value.trim());
  };

  const inspectElement = (element: Element) => {
    const htmlElement = ensureHTMLElement(element);
    if (!htmlElement) return;
    if (isHTMLImageNode(htmlElement)) {
      addUrl(htmlElement.getAttribute("src"));
    }
    extractUrlsFromStyleValue(htmlElement.style?.backgroundImage || "").forEach((url) => addUrl(url));
    try {
      const computed = getComputedStyle(htmlElement);
      extractUrlsFromStyleValue(computed.backgroundImage || "").forEach((url) => addUrl(url));
    } catch {
      // ignore computed style failures
    }
  };

  ATTACHMENT_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => {
      const element = ensureHTMLElement(node);
      if (!element) return;
      inspectElement(element);
      element.querySelectorAll("img").forEach((img) => inspectElement(img));
      element.querySelectorAll("*").forEach((child) => inspectElement(child));
    });
  });

  return Array.from(urls);
};

export const countComposerAttachments = (root: ComposerRoot): number => {
  if (!root) return 0;
  for (const selector of ATTACHMENT_SELECTORS) {
    const nodes = root.querySelectorAll(selector);
    if (nodes.length) return nodes.length;
  }
  if (REMOVE_QUERY) {
    const removalNodes = root.querySelectorAll(REMOVE_QUERY);
    if (removalNodes.length) return removalNodes.length;
  }
  const fallback = root.querySelectorAll('img[src^="blob:"], img[src^="data:"]');
  if (fallback.length) return fallback.length;
  return countFilesInInputs(root);
};

export const gatherComposerAttachments = async (
  root: ComposerRoot,
): Promise<Attachment[]> => {
  if (!root) return [];
  const attachments: Attachment[] = [];
  const inputs = Array.from(root.querySelectorAll('input[type="file"]')).filter(
    (input): input is HTMLInputElement => isHTMLInputNode(input),
  );

  for (const input of inputs) {
    const files = Array.from(input.files || []);
    for (const file of files) {
      if (!(file instanceof File)) continue;
      try {
        const attachment = await createAttachmentFromFile(file);
        if (attachment) attachments.push(attachment);
      } catch {
        // ignore file read issues
      }
    }
  }

  const blobImages = Array.from(root.querySelectorAll('img[src^="blob:"]'));
  const seenDataUrls = new Set(attachments.map((item) => item.dataUrl));

  for (const img of blobImages) {
    const src = img.getAttribute("src");
    if (!src) continue;
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const mime = blob.type || "image/png";
      const extension = mime.split("/")[1] || "png";
      const file = new File([blob], `image-${makeId()}.${extension}`, { type: mime });
      const attachment = await createAttachmentFromFile(file);
      if (attachment && !seenDataUrls.has(attachment.dataUrl)) {
        attachments.push(attachment);
        seenDataUrls.add(attachment.dataUrl);
      }
    } catch {
      // ignore fetch errors
    }
  }

  const previewUrls = collectPreviewDataUrls(isHTMLElementNode(root) ? (root as HTMLElement) : null);
  for (const url of previewUrls) {
    if (!url || seenDataUrls.has(url)) continue;
    if (/^data:/i.test(url)) {
      const attachment = createAttachmentFromDataUrl(url);
      if (attachment) {
        attachments.push(attachment);
        seenDataUrls.add(attachment.dataUrl);
      }
      continue;
    }
    if (/^blob:/i.test(url)) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const mime = blob.type || "image/png";
        const extension = mime.split("/")[1] || "png";
        const file = new File([blob], `image-${makeId()}.${extension}`, { type: mime });
        const attachment = await createAttachmentFromFile(file);
        if (attachment) {
          attachments.push(attachment);
          seenDataUrls.add(attachment.dataUrl);
        }
      } catch {
        // ignore fetch errors
      }
    }
  }

  return attachments;
};

export const clearComposerAttachments = (root: ComposerRoot): void => {
  if (!root) return;
  ATTACHMENT_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => {
      const element = ensureHTMLElement(node);
      if (!element) return;
      const removeButton = REMOVE_QUERY ? element.querySelector(REMOVE_QUERY) : null;
      if (isHTMLElementNode(removeButton)) {
        removeButton.click();
      }
    });
  });

  root.querySelectorAll('input[type="file"]').forEach((input) => {
    if (!isHTMLInputNode(input)) return;
    if (!input.value) return;
    try {
      input.value = "";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      // ignore input clearing issues
    }
  });
};

export const waitForAttachmentsReady = (
  root: ComposerRoot,
  baseCount: number,
  expectedIncrease: number,
  timeoutMs = 4000,
): Promise<boolean> =>
  new Promise((resolve) => {
    if (!expectedIncrease) {
      resolve(true);
      return;
    }
    const target = baseCount + expectedIncrease;
    let settled = false;
    let observer: MutationObserver | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let cancelThrottled: (() => void) | null = null;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (poll) clearInterval(poll);
      cancelThrottled?.();
      resolve(result);
    };

    const throttledCheck = throttle(() => {
      if (countComposerAttachments(root) >= target) finish(true);
    }, 80);
    cancelThrottled = () => throttledCheck.cancel();

    const observationTarget =
      (root && isHTMLElementNode(root) && (root as HTMLElement)) ||
      (root && hasDocument && root instanceof Document ? root : null);

    if (observationTarget && hasMutationObserver) {
      observer = new MutationObserver(() => {
        throttledCheck();
      });
      observer.observe(observationTarget, { childList: true, subtree: true });
    }

    poll = setInterval(() => {
      throttledCheck();
    }, 180);

    setTimeout(() => finish(false), timeoutMs);
  });

export interface ApplyAttachmentsOptions {
  inputSelector?: string;
  triggerSelector?: string;
  settleDelayMs?: number;
}

export const applyAttachmentsToComposer = async (
  root: ComposerRoot,
  attachments: Attachment[] | null | undefined,
  options: ApplyAttachmentsOptions = {},
): Promise<boolean> => {
  const debugSend = isDebugSendEnabled();
  if (!root) return false;
  if (!attachments || attachments.length === 0) return true;
  if (typeof DataTransfer === "undefined") {
    if (debugSend) console.warn("[cq][attachments] missing DataTransfer");
    return false;
  }

  const inputSelector = options.inputSelector || COMPOSER_INPUT_SELECTOR;
  const triggerSelector = options.triggerSelector || UPLOAD_TRIGGER_SELECTOR;
  const settleDelayMs = Number.isFinite(options.settleDelayMs)
    ? Number(options.settleDelayMs)
    : 120;

  let input = root.querySelector(inputSelector);
  if (!isHTMLInputNode(input)) {
    const trigger = root.querySelector(triggerSelector);
    if (isHTMLElementNode(trigger)) {
      trigger.click();
      await sleep(60);
      input = root.querySelector(inputSelector);
    }
  }
  if (!isHTMLInputNode(input)) {
    if (debugSend) console.warn("[cq][attachments] missing file input");
    return false;
  }

  const dataTransfer = new DataTransfer();
  for (const attachment of attachments) {
    const file = await attachmentToFile(attachment);
    if (file) dataTransfer.items.add(file);
  }
  if (dataTransfer.items.length === 0) {
    if (debugSend) console.warn("[cq][attachments] dataTransfer empty");
    return true;
  }

  const baseCount = countComposerAttachments(root);

  try {
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForAttachmentsReady(root, baseCount, dataTransfer.items.length);
    await sleep(settleDelayMs);
    return true;
  } catch {
    if (debugSend) console.warn("[cq][attachments] failed to apply files");
    return false;
  }
};
