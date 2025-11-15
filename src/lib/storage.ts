export const LEGACY_STORAGE_KEY = "cq";
export const STORAGE_PREFIX = "cq:";
export const CONVERSATION_ID_REGEX = /\/c\/([0-9a-f-]+)/i;

export const hostToken = (): string => {
  if (typeof location === "object" && typeof location.host === "string" && location.host) {
    return location.host.toLowerCase();
  }
  return "chatgpt.com";
};

export const encodePathForStorage = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) return "%2F";
  return encodeURIComponent(value);
};

export const resolveConversationIdentifier = (): string => {
  const host = hostToken();
  const pathname =
    typeof location === "object" && typeof location.pathname === "string" && location.pathname.length
      ? location.pathname
      : "/";
  const match = pathname.match(CONVERSATION_ID_REGEX);
  if (match && match[1]) {
    return `${host}::chat::${match[1].toLowerCase()}`;
  }
  return `${host}::path::${encodePathForStorage(pathname)}`;
};

export const storageKeyForIdentifier = (identifier: string | null | undefined): string =>
  `${STORAGE_PREFIX}${identifier || "global"}`;
