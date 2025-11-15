import type { Attachment } from "./types";
import { makeId } from "./utils";

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

type ComposerRoot = Document | HTMLElement | null;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
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

const mimeFromDataUrl = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([^;,]+)/i);
  return match?.[1] || "image/png";
};

const elementHasQuery = (
  root: ComposerRoot,
): root is Document | HTMLElement =>
  Boolean(root && typeof (root as Document | HTMLElement).querySelectorAll === "function");

const ensureHTMLElement = (node: Element | null): HTMLElement | null =>
  (node instanceof HTMLElement ? node : null);

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
    if (!(node instanceof HTMLInputElement)) return total;
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
    if (!(element instanceof HTMLElement)) return;
    if (element instanceof HTMLImageElement) {
      addUrl(element.getAttribute("src"));
    }
    extractUrlsFromStyleValue(element.style?.backgroundImage || "").forEach((url) => addUrl(url));
    try {
      const computed = getComputedStyle(element);
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
    (input): input is HTMLInputElement => input instanceof HTMLInputElement,
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

  const previewUrls = collectPreviewDataUrls(root instanceof HTMLElement ? root : null);
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
      if (removeButton instanceof HTMLElement) {
        removeButton.click();
      }
    });
  });

  root.querySelectorAll('input[type="file"]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
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

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (poll) clearInterval(poll);
      resolve(result);
    };

    if (root) {
      observer = new MutationObserver(() => {
        if (countComposerAttachments(root) >= target) finish(true);
      });
      observer.observe(root, { childList: true, subtree: true });
    }

    poll = setInterval(() => {
      if (countComposerAttachments(root) >= target) finish(true);
    }, 150);

    setTimeout(() => finish(false), timeoutMs);
  });
