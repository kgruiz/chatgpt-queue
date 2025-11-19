import { createQueueHelpers } from "../lib/queue";
import { createInitialState } from "../lib/state";
import { createQueueStateEmitter, type QueueStateChangeReason } from "../lib/state/events";
import { LEGACY_STORAGE_KEY, resolveConversationIdentifier, hostToken } from "../lib/storage";
import {
    createStorageManager,
    type PersistedQueueState,
} from "../lib/storage-manager";
import type { QueueEntry, QueueModelDefinition, ThinkingLevel } from "../lib/types";
import {
    THINKING_TIME_OPTIONS,
    isThinkingLevelAvailableForPlan,
} from "../lib/constants/models";
import { composer } from "./dom-adapters";
import { initComposerController, type ComposerController } from "./composer-controller";
import { initModelController, type ModelController } from "./model-controller";
import { initQueueController, type QueueController } from "./queue-controller";
import { initShortcuts } from "./shortcuts";
import type { Context, PlatformFlags } from "./types";

type ShortcutHandles = ReturnType<typeof initShortcuts> | null;

const MODEL_SHORTCUT_KEY_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const THINKING_OPTION_ID_SET = new Set<ThinkingLevel>(
    THINKING_TIME_OPTIONS.map((option) => option.id),
);


const normalizeThinkingOptionId = (value: unknown): ThinkingLevel | null => {
    if (typeof value !== "string") return null;

    const normalized = value.trim().toLowerCase();

    if (!THINKING_OPTION_ID_SET.has(normalized as ThinkingLevel)) return null;

    return normalized as ThinkingLevel;
};

const dispatchPointerAndMousePress = (target: Element | null) => {
    if (!(target instanceof HTMLElement)) return false;

    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const screenX = (window.screenX || 0) + clientX;
    const screenY = (window.screenY || 0) + clientY;
    const pageX = clientX + (window.scrollX || window.pageXOffset || 0);
    const pageY = clientY + (window.scrollY || window.pageYOffset || 0);
    const pointerInit = {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
        screenX,
        screenY,
        pageX,
        pageY,
    } as const;

    try {
        if (typeof PointerEvent === "function") {
            target.dispatchEvent(
                new PointerEvent("pointerdown", {
                    ...pointerInit,
                }),
            );
            target.dispatchEvent(
                new PointerEvent("pointerup", {
                    ...pointerInit,
                }),
            );
        }
    } catch (_) {
        /* PointerEvent may be unavailable */
    }

    const mouseDown = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
        screenX,
        screenY,
    });

    const mouseUp = new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX,
        clientY,
        screenX,
        screenY,
    });

    const mouseClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
        screenX,
        screenY,
    });

    target.dispatchEvent(mouseDown);
    target.dispatchEvent(mouseUp);
    target.dispatchEvent(mouseClick);

    return true;
};

const dispatchKeyboardEnterPress = (target: Element | null) => {
    if (!(target instanceof HTMLElement)) return false;

    const keyOpts = {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
    } as const;

    target.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    target.dispatchEvent(new KeyboardEvent("keyup", keyOpts));

    return true;
};

const resolvePlatformFlags = (): PlatformFlags => {
    const navPlatform =
        typeof navigator === "object"
            ? ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
                navigator.platform ||
                navigator.userAgent ||
                "")
            : "";

    const isApplePlatform = /mac|iphone|ipad|ipod/i.test(navPlatform);
    const pauseShortcutLabel = isApplePlatform ? "Command+Shift+P" : "Ctrl+Shift+P";

    return {
        isApplePlatform,
        navPlatform,
        pauseShortcutLabel,
        modelShortcutKeyOrder: MODEL_SHORTCUT_KEY_ORDER,
    };
};

const createContentContext = (): Context => {
    const state = createInitialState();
    const events = createQueueStateEmitter(state);

    const emitStateChange = (
        reason: QueueStateChangeReason = "state:change",
        detail?: Record<string, unknown>,
    ) => {
        events.emit(reason, detail);
    };

    const storageManager = createStorageManager<PersistedQueueState>({
        legacyKey: LEGACY_STORAGE_KEY,
        onError: (type, error) => {
            console.error(`cq: failed to ${type} persisted state`, error);
        },
    });

    const queueHelpers = createQueueHelpers(normalizeThinkingOptionId);

    return {
        state,
        events,
        emitStateChange,
        storageManager,
        queueHelpers,
        platform: resolvePlatformFlags(),
        dispatchers: {
            dispatchPointerAndMousePress,
            dispatchKeyboardEnterPress,
        },
        ui: {
            composerRoot: composer,
        },
        logger: console,
    };
};

class ContentRuntime {
    private readonly ctx: Context;

    private modelController: ModelController | null = null;

    private composerController: ComposerController | null = null;

    private queueController: QueueController | null = null;

    private shortcuts: ShortcutHandles = null;

    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    private hydrated = false;

    private activeConversationIdentifier = resolveConversationIdentifier();

    private rootObserver: MutationObserver | null = null;

    private conversationChangeInterval = 0;

    private bridgeInjected = false;

    constructor(ctx: Context) {
        this.ctx = ctx;
    }

    start() {
        this.injectBridgeScript();
        this.initControllers();
        this.attachEventSubscriptions();
        this.initShortcuts();
        this.attachGlobalObservers();
        this.bootstrapUI();
        this.loadInitialState();
        this.exposeDebugHooks();
    }

    private persistable = (): PersistedQueueState => ({
        running: this.ctx.state.running,
        queue: this.ctx.state.queue.map((entry: QueueEntry) => this.ctx.queueHelpers.cloneEntry(entry)),
        collapsed: this.ctx.state.collapsed,
        paused: this.ctx.state.paused,
        pauseReason: this.ctx.state.pauseReason,
        pausedAt: this.ctx.state.pausedAt,
    });

    private saveState = (
        identifier: string | null | undefined = this.activeConversationIdentifier,
    ) => {
        this.ctx.storageManager.saveSnapshot(identifier, this.persistable());
    };

    private scheduleSaveState = () => {
        if (this.saveTimer) clearTimeout(this.saveTimer);

        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.saveState();
        }, 150);
    };

    private injectBridgeScript = () => {
        if (this.bridgeInjected) return;

        const existing = document.getElementById("cq-bridge-script");

        if (existing) {
            this.bridgeInjected = true;
            return;
        }

        const url = chrome.runtime?.getURL?.("bridge.js") || "";

        if (!url) return;

        try {
            const script = document.createElement("script");
            script.id = "cq-bridge-script";
            script.src = url;
            script.type = "module";
            script.async = false;
            script.onload = () => {
                this.bridgeInjected = true;
            };
            script.onerror = () => {
                console.warn("[cq] failed to load bridge.js");
            };
            document.documentElement?.appendChild(script);
        } catch (_) {
            /* noop */
        }
    };

    private initControllers() {
        this.modelController = initModelController({
            state: this.ctx.state,
            emitStateChange: this.ctx.emitStateChange,
            refreshControls: () => this.queueController?.refreshControls(),
            saveState: this.saveState,
            dispatchPointerAndMousePress: this.ctx.dispatchers.dispatchPointerAndMousePress,
            dispatchKeyboardEnterPress: this.ctx.dispatchers.dispatchKeyboardEnterPress,
        });

        this.queueController = initQueueController({
            state: this.ctx.state,
            emitStateChange: this.ctx.emitStateChange,
            saveState: this.saveState,
            scheduleSaveState: this.scheduleSaveState,
            modelController: this.modelController,
            getComposerController: () => this.composerController,
            pauseShortcutLabel: this.ctx.platform.pauseShortcutLabel,
        });

        this.composerController = initComposerController({
            state: this.ctx.state,
            emitStateChange: this.ctx.emitStateChange,
            saveState: this.saveState,
            refreshControls: () => this.queueController?.refreshControls(),
            scheduleControlRefresh: () => this.queueController?.scheduleControlRefresh(),
            setPaused: this.queueController.setPaused,
            labelForModel: this.modelController.labelForModel,
            supportsThinkingForModel: this.modelController.supportsThinkingForModel,
            getCurrentModelId: this.modelController.getCurrentModelId,
            getCurrentModelLabel: this.modelController.getCurrentModelLabel,
            ensureModel: this.modelController.ensureModel,
            markModelSelected: this.modelController.markModelSelected,
            openModelDropdownForAnchor: this.modelController.openModelDropdownForAnchor,
            modelMenuController: this.modelController.modelMenuController,
            activateMenuItem: this.modelController.activateMenuItem,
            dispatchPointerAndMousePress: this.ctx.dispatchers.dispatchPointerAndMousePress,
            queueList: this.queueController.list,
            applyModelSelectionToEntry: this.queueController.applyModelSelectionToEntry,
            setEntryThinkingOption: this.queueController.setEntryThinkingOption,
            resolveQueueEntryThinkingLabel: this.queueController.resolveQueueEntryThinkingLabel,
            addAttachmentsToEntry: this.queueController.addAttachmentsToEntry,
            getUserPlan: this.modelController.detectUserPlan,
        });

        this.queueController.attachComposerController(this.composerController);
    }

    private attachEventSubscriptions() {
        this.ctx.events.subscribe(() => {
            this.queueController?.refreshAll();
        });
    }

    private initShortcuts() {
        if (!this.modelController) return;

        const selectThinkingTimeOption = async (optionId: ThinkingLevel) =>
            this.composerController?.selectThinkingTimeOption(optionId) ?? false;

        const queueComposerInput = async () =>
            this.composerController?.queueComposerInput() ?? false;

        const queueFromComposer = async ({ hold = false } = {}) =>
            this.composerController?.queueFromComposer({ hold }) ?? false;

        const detectedPlan = this.modelController.detectUserPlan();
        const filteredThinkingOptions = THINKING_TIME_OPTIONS.filter((option) =>
            isThinkingLevelAvailableForPlan(detectedPlan, option.id),
        );
        const thinkingShortcutOptions =
            filteredThinkingOptions.length > 0
                ? filteredThinkingOptions.map((option, index) => ({
                      ...option,
                      digit: String(index + 1),
                  }))
                : THINKING_TIME_OPTIONS;

        this.shortcuts = initShortcuts({
            state: this.ctx.state,
            isApplePlatform: this.ctx.platform.isApplePlatform,
            modelShortcutOrder: this.ctx.platform.modelShortcutKeyOrder,
            thinkingOptions: thinkingShortcutOptions,
            userPlan: detectedPlan,
            getQueueRows: () => this.queueController?.getQueueRows() ?? [],
            focusQueueRow: (row) => this.queueController?.focusQueueRow(row) ?? false,
            focusComposerEditor: () => this.queueController?.focusComposerEditor() ?? false,
            getComposerNode: this.ctx.ui.composerRoot,
            togglePaused: () => this.queueController?.togglePaused(),
            setCollapsed: (collapsed) => this.queueController?.setCollapsed(collapsed),
            openModelSwitcherDropdown: this.modelController.openModelSwitcherDropdown,
            dedupeModelsForDisplay: this.modelController.dedupeModelsForDisplay,
            resolveModelOrder: this.modelController.resolveModelOrder,
            handleComposerModelSelection: async (model: QueueModelDefinition | null) =>
                this.composerController?.handleComposerModelSelection(model) ?? false,
            selectThinkingTimeOption,
            emitStateChange: this.ctx.emitStateChange,
            scheduleControlRefresh: () => this.queueController?.scheduleControlRefresh(),
            queueFromComposer,
            queueComposerInput,
        });
    }

    private attachGlobalObservers() {
        chrome.runtime?.onMessage.addListener((msg) => {
            if (msg?.type === "queue-from-shortcut") void this.composerController?.queueComposerInput();

            if (msg?.type === "toggle-ui") {
                this.queueController?.setCollapsed(false);
            }

            if (msg?.type === "show-ui") {
                this.queueController?.setCollapsed(false);
            }
        });

        this.conversationChangeInterval = window.setInterval(
            () => this.handleConversationChangeIfNeeded(),
            800,
        );

        window.addEventListener("popstate", () => this.handleConversationChangeIfNeeded());
        window.addEventListener("hashchange", () => this.handleConversationChangeIfNeeded());

        if (typeof history === "object" && history) {
            const notifyConversationChange = () => this.handleConversationChangeIfNeeded();

            (["pushState" as const, "replaceState" as const] as const).forEach((method) => {
                const original = history[method];

                if (typeof original !== "function") return;

                history[method] = function cqPatchedHistoryMethod(
                    this: History,
                    ...args: Parameters<History[typeof method]>
                ) {
                    const result = original.apply(this, args);

                    notifyConversationChange();

                    return result;
                } as History[typeof method];
            });
        }

        window.addEventListener("beforeunload", () => {
            this.teardown();
        });

        this.rootObserver = new MutationObserver(() => {
            this.queueController?.scheduleControlRefresh();
            this.queueController?.ensureMounted();
            this.shortcuts?.refreshPopover();
            this.handleConversationChangeIfNeeded();
        });

        this.rootObserver.observe(document.documentElement, {
            subtree: true,
            childList: true,
        });
    }

    private bootstrapUI() {
        this.queueController?.ensureMounted();
        this.shortcuts?.refreshPopover();
        this.queueController?.refreshVisibility();
    }

    private applyPersistedState = (snapshot: PersistedQueueState | null) => {
        const cq = snapshot && typeof snapshot === "object" ? snapshot : null;
        this.ctx.state.running = false;
        this.ctx.state.queue = Array.isArray(cq?.queue)
            ? cq.queue.map((item) => this.ctx.queueHelpers.normalizeEntry(item))
            : [];
        this.ctx.state.collapsed = typeof cq?.collapsed === "boolean" ? cq.collapsed : false;
        this.ctx.state.paused = typeof cq?.paused === "boolean" ? cq.paused : false;
        this.ctx.state.pauseReason = typeof cq?.pauseReason === "string" ? cq.pauseReason : "";
        this.ctx.state.pausedAt = typeof cq?.pausedAt === "number" ? cq.pausedAt : null;
        this.ctx.emitStateChange("state:hydrate");
        this.hydrated = true;
        this.queueController?.setHydrated(true);
        this.queueController?.refreshVisibility();
    };

    private loadPersistedState = (identifier = this.activeConversationIdentifier) =>
        this.ctx.storageManager.loadSnapshot(identifier).then((snapshot: PersistedQueueState | null) => {
            this.applyPersistedState(snapshot);
            return snapshot;
        });

    private persistActiveConversationState = () => {
        if (!this.hydrated) return;

        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        this.saveState(this.activeConversationIdentifier);
    };

    private handleConversationChangeIfNeeded = () => {
        const nextIdentifier = resolveConversationIdentifier();

        if (nextIdentifier === this.activeConversationIdentifier) return;

        const host = hostToken();
        const isRootPath = (id: string | null | undefined) =>
            typeof id === "string" && id.startsWith(`${host}::path::%2F`);
        const isChatPath = (id: string | null | undefined) =>
            typeof id === "string" && id.startsWith(`${host}::chat::`);

        const upgradingToFirstConversation =
            isRootPath(this.activeConversationIdentifier) &&
            isChatPath(nextIdentifier) &&
            this.ctx.state.queue.length > 0;

        if (upgradingToFirstConversation) {
            this.activeConversationIdentifier = nextIdentifier;
            this.saveState(nextIdentifier);
            return;
        }

        this.persistActiveConversationState();
        this.activeConversationIdentifier = nextIdentifier;
        this.queueController?.resetStateForNewConversation();
        this.hydrated = false;
        this.loadPersistedState(nextIdentifier)
            .then(() => this.modelController?.ensureModelOptions())
            .catch(() => {});
    };

    private loadInitialState() {
        this.loadPersistedState()
            .then(() => this.modelController?.ensureModelOptions())
            .catch(() => {})
            .finally(() => {
                this.modelController?.scheduleHeaderModelSync(0);
            });
    }

    private teardown() {
        if (this.conversationChangeInterval) {
            clearInterval(this.conversationChangeInterval);
        }

        this.persistActiveConversationState();
        this.modelController?.dispose?.();
        this.composerController?.dispose?.();
        this.queueController?.dispose?.();
        this.shortcuts?.dispose();
        this.shortcuts = null;
        this.modelController = null;
        this.composerController = null;
        this.queueController = null;
        this.rootObserver?.disconnect();
        this.rootObserver = null;
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
    }

    private exposeDebugHooks() {
        window.__CQ_DEBUG_MODELS = typeof window.__CQ_DEBUG_MODELS === "boolean"
            ? window.__CQ_DEBUG_MODELS
            : false;

        if (!window.__CQ_DEBUG_MODELS) return;

        window.cqShowModelDebugPopup = (models) => {
            this.modelController?.showModelDebugPopup(models);
        };
    }
}

export const bootstrapContent = () => {
    const runtime = new ContentRuntime(createContentContext());
    runtime.start();
    return runtime;
};
