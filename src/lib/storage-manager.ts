import type { QueueEntry } from "./types";
import { storageKeyForIdentifier as defaultStorageKeyForIdentifier } from "./storage";

export interface PersistedQueueState {
  running: boolean;
  queue: QueueEntry[];
  collapsed: boolean;
  paused: boolean;
  pauseReason: string;
  pausedAt: number | null;
}

export type StorageErrorType = "load" | "save" | "migrate";

export interface StorageAreaLike {
  get(keys: string[] | string, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
  remove(keys: string[] | string, callback?: () => void): void;
}

export interface StorageManagerOptions<TSnapshot> {
  storageArea?: StorageAreaLike | null;
  storageKeyForIdentifier?: (identifier: string | null | undefined) => string;
  legacyKey?: string | null;
  onError?: (type: StorageErrorType, error: unknown) => void;
}

const isContextInvalidatedError = (error: unknown): boolean => {
  const message = typeof error === "string" ? error : (error as Error | undefined)?.message;
  return typeof message === "string" && message.includes("Extension context invalidated");
};

const resolveStorageArea = (area?: StorageAreaLike | null): StorageAreaLike | null => {
  if (area) return area;
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch {
    /* ignore */
  }
  return null;
};

const readRuntimeError = (): chrome.runtime.LastError | null => {
  try {
    if (typeof chrome !== "undefined" && chrome?.runtime?.lastError) {
      return chrome.runtime.lastError;
    }
  } catch {
    /* noop */
  }
  return null;
};

export interface StorageManager<TSnapshot> {
  saveSnapshot(identifier: string | null | undefined, snapshot: TSnapshot): void;
  loadSnapshot(identifier: string | null | undefined): Promise<TSnapshot | null>;
}

export const createStorageManager = <TSnapshot>(
  options: StorageManagerOptions<TSnapshot> = {},
): StorageManager<TSnapshot> => {
  const storageArea = resolveStorageArea(options.storageArea);
  const storageKeyForIdentifier = options.storageKeyForIdentifier || defaultStorageKeyForIdentifier;
  const legacyKey = options.legacyKey;
  const onError = options.onError;
  let legacyMigrated = false;

  const reportError = (type: StorageErrorType, error: unknown) => {
    if (isContextInvalidatedError(error)) return;
    onError?.(type, error);
  };

  const saveSnapshot = (identifier: string | null | undefined, snapshot: TSnapshot) => {
    if (!storageArea?.set) return;
    const storageKey = storageKeyForIdentifier(identifier);
    try {
      storageArea.set({ [storageKey]: snapshot }, () => {
        const error = readRuntimeError();
        if (error) reportError("save", error);
      });
    } catch (error) {
      reportError("save", error);
    }
  };

  const migrateLegacyValue = (
    result: Record<string, unknown>,
    storageKey: string,
  ): TSnapshot | null => {
    if (legacyMigrated || !legacyKey) return null;
    if (!Object.prototype.hasOwnProperty.call(result, legacyKey)) {
      return null;
    }
    legacyMigrated = true;
    const legacyValue = result[legacyKey] as TSnapshot | undefined;
    if (legacyValue && storageArea?.set) {
      try {
        storageArea.set({ [storageKey]: legacyValue }, () => {
          storageArea?.remove?.(legacyKey);
        });
      } catch (error) {
        reportError("migrate", error);
      }
    } else {
      storageArea?.remove?.(legacyKey);
    }
    return legacyValue ?? null;
  };

  const loadSnapshot = (
    identifier: string | null | undefined,
  ): Promise<TSnapshot | null> =>
    new Promise<TSnapshot | null>((resolve) => {
      if (!storageArea?.get) {
        resolve(null);
        return;
      }
      const storageKey = storageKeyForIdentifier(identifier);
      const keys =
        legacyMigrated || !legacyKey ? [storageKey] : [storageKey, legacyKey];
      try {
        storageArea.get(keys, (result: Record<string, unknown> = {}) => {
          const error = readRuntimeError();
          if (error) reportError("load", error);
          let snapshot: TSnapshot | null =
            (result[storageKey] as TSnapshot | undefined) ?? null;
          if (!snapshot) {
            snapshot = migrateLegacyValue(result, storageKey);
          }
          resolve(snapshot ?? null);
        });
      } catch (error) {
        if (isContextInvalidatedError(error)) {
          resolve(null);
        } else {
          reportError("load", error);
          resolve(null);
        }
      }
    });

  return { saveSnapshot, loadSnapshot };
};

export { isContextInvalidatedError };
