import type { QueueHelpers } from "../lib/queue";
import type { QueueState } from "../lib/state";
import type { createQueueStateEmitter, QueueStateChangeReason } from "../lib/state/events";
import type { PersistedQueueState, StorageManager } from "../lib/storage-manager";

export type Emit = (
    reason?: QueueStateChangeReason,
    detail?: Record<string, unknown>,
) => void;

export interface UIHandles {
    composerRoot: () => HTMLElement | null;
}

export interface PlatformFlags {
    isApplePlatform: boolean;
    pauseShortcutLabel: string;
    modelShortcutKeyOrder: string[];
    navPlatform: string;
}

export interface InteractionDispatchers {
    dispatchPointerAndMousePress: (target: Element | null) => boolean;
    dispatchKeyboardEnterPress: (target: Element | null) => boolean;
}

export type QueueEvents = ReturnType<typeof createQueueStateEmitter>;

export interface Context {
    state: QueueState;
    events: QueueEvents;
    emitStateChange: Emit;
    storageManager: StorageManager<PersistedQueueState>;
    queueHelpers: QueueHelpers;
    platform: PlatformFlags;
    dispatchers: InteractionDispatchers;
    ui: UIHandles;
    logger: Pick<Console, "log" | "warn" | "error">;
}

export interface ComposerElements {
    root: HTMLElement | null;
    editor: HTMLElement | null;
    sendButton: HTMLButtonElement | null;
    stopButton: HTMLButtonElement | null;
    voiceButton: HTMLButtonElement | null;
}

export interface QueueElements {
    ui: HTMLElement | null;
    list: HTMLElement | null;
    collapseToggle: HTMLButtonElement | null;
    inlineHeader: HTMLElement | null;
    pauseToggle: HTMLButtonElement | null;
}

export interface ModelElements {
    switcherButtons: HTMLButtonElement[];
    menuRoot: HTMLElement | null;
}
