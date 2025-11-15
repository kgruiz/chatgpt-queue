import { createStorageManager, type PersistedQueueState } from "../src/lib/storage-manager";
import type { StorageAreaLike } from "../src/lib/storage-manager";

class MemoryStorageArea implements StorageAreaLike {
  private store = new Map<string, unknown>();

  get(keys: string[] | string, callback: (items: Record<string, unknown>) => void): void {
    const list = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    list.forEach((key) => {
      if (this.store.has(key)) {
        result[key] = this.store.get(key);
      }
    });
    callback(result);
  }

  set(items: Record<string, unknown>, callback: () => void = () => {}): void {
    Object.entries(items).forEach(([key, value]) => {
      this.store.set(key, value);
    });
    callback();
  }

  remove(keys: string[] | string, callback: () => void = () => {}): void {
    const list = Array.isArray(keys) ? keys : [keys];
    list.forEach((key) => this.store.delete(key));
    callback();
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.store.entries());
  }
}

const memory = new MemoryStorageArea();
const storageKeyForIdentifier = (identifier: string | null | undefined) => `cq:${identifier || "global"}`;
const legacyKey = "cq";

const storageManager = createStorageManager<PersistedQueueState>({
  storageArea: memory,
  storageKeyForIdentifier,
  legacyKey,
  onError: (type, error) => {
    throw new Error(`storage manager ${type} error: ${String(error)}`);
  },
});

const legacySnapshot: PersistedQueueState = {
  running: false,
  queue: [
    {
      text: "legacy entry",
      attachments: [],
      model: "gpt-4o",
      modelLabel: "GPT-4o",
      thinking: null,
    },
  ],
  collapsed: false,
  paused: false,
  pauseReason: "",
  pausedAt: null,
};

memory.set({ [legacyKey]: legacySnapshot }, () => {});

async function runHarness() {
  const loaded = await storageManager.loadSnapshot("test-convo");
  if (!loaded || loaded.queue[0]?.text !== "legacy entry") {
    throw new Error("Failed to load legacy snapshot");
  }

  const currentStore = memory.snapshot();
  if (!currentStore[storageKeyForIdentifier("test-convo")]) {
    throw new Error("Legacy snapshot was not migrated to new key");
  }
  if (legacyKey in currentStore) {
    throw new Error("Legacy key was not cleaned up");
  }

  const nextSnapshot: PersistedQueueState = {
    running: false,
    queue: [
      {
        text: "fresh entry",
        attachments: [],
        model: "gpt-4.1",
        modelLabel: "GPT-4.1",
        thinking: null,
      },
    ],
    collapsed: true,
    paused: true,
    pauseReason: "manual",
    pausedAt: Date.now(),
  };

  storageManager.saveSnapshot("test-convo", nextSnapshot);
  const storeAfterSave = memory.snapshot();
  const migrated = storeAfterSave[storageKeyForIdentifier("test-convo")];
  if (!(migrated && (migrated as PersistedQueueState).queue[0]?.text === "fresh entry")) {
    throw new Error("Save did not persist latest snapshot");
  }

  console.log("storage-manager harness passed");
}

runHarness().catch((error) => {
  console.error("storage-manager harness failed", error);
  process.exit(1);
});
