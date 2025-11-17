import "../styles/content.css";
import { defineContentScript } from "#imports";
import { createQueueHelpers } from "../lib/queue";
import { createInitialState } from "../lib/state";
import {
    createQueueStateEmitter,
    type QueueStateChangeReason,
} from "../lib/state/events";
import {
    LEGACY_STORAGE_KEY,
    resolveConversationIdentifier,
} from "../lib/storage";
import {
    createStorageManager,
    type PersistedQueueState,
} from "../lib/storage-manager";
import type {
    QueueModelDefinition,
    ThinkingLevel,
    ThinkingOption,
} from "../lib/types";
import { composer } from "./dom-adapters";
import { initModelController, type ModelController } from "./model-controller";
import {
    initComposerController,
    type ComposerController,
} from "./composer-controller";
import {
    initQueueController,
    type QueueController,
} from "./queue-controller";
import { initShortcuts } from "./shortcuts";

declare global {
    interface Window {
        __CQ_DEBUG_MODELS?: boolean;
        cqShowModelDebugPopup?: (models: QueueModelDefinition[]) => void;
    }
}

export default defineContentScript({
    matches: [
        "https://chat.openai.com/*",
        "https://chatgpt.com/*",
    ],
    runAt: "document_idle",
    cssInjectionMode: "manifest",
    main() {
        const STATE = createInitialState();
        const STATE_EVENTS = createQueueStateEmitter(STATE);

        let modelController: ModelController;
        let composerController: ComposerController | null = null;
        let queueController: QueueController | null = null;

        const emitStateChange = (
            reason: QueueStateChangeReason = "state:change",
            detail?: Record<string, unknown>,
        ) => {
            STATE_EVENTS.emit(reason, detail);
        };

        const navPlatform =
            typeof navigator === "object"
                ? ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
                    navigator.platform ||
                    navigator.userAgent ||
                    "")
                : "";
        const isApplePlatform = /mac|iphone|ipad|ipod/i.test(navPlatform);
        const PAUSE_SHORTCUT_LABEL = isApplePlatform
            ? "Command+Shift+P"
            : "Ctrl+Shift+P";
        const MODEL_SHORTCUT_KEY_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
        const THINKING_TIME_OPTIONS: ThinkingOption[] = [
            { id: "light", label: "Light", digit: "1" },
            { id: "standard", label: "Standard", digit: "2" },
            { id: "extended", label: "Extended", digit: "3" },
            { id: "heavy", label: "Heavy", digit: "4" },
        ];
        const THINKING_OPTION_ID_SET = new Set<ThinkingLevel>(
            THINKING_TIME_OPTIONS.map((option) => option.id),
        );

        const normalizeThinkingOptionId = (value: unknown): ThinkingLevel | null => {
            if (typeof value !== "string") return null;
            const normalized = value.trim().toLowerCase();
            if (!THINKING_OPTION_ID_SET.has(normalized as ThinkingLevel)) return null;
            return normalized as ThinkingLevel;
        };

        const { normalizeEntry, cloneEntry } = createQueueHelpers(
            normalizeThinkingOptionId,
        );

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
            };
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
                            buttons: 0,
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
            };
            target.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
            target.dispatchEvent(new KeyboardEvent("keyup", keyOpts));
            return true;
        };

        let saveTimer: ReturnType<typeof setTimeout> | null = null;
        let hydrated = false; // gate UI visibility until persisted state is loaded
        let activeConversationIdentifier = resolveConversationIdentifier();

        const storageManager = createStorageManager<PersistedQueueState>({
            legacyKey: LEGACY_STORAGE_KEY,
            onError: (type, error) => {
                console.error(`cq: failed to ${type} persisted state`, error);
            },
        });

        const persistable = (): PersistedQueueState => ({
            running: STATE.running,
            queue: STATE.queue.map((entry) => cloneEntry(entry)),
            collapsed: STATE.collapsed,
            paused: STATE.paused,
            pauseReason: STATE.pauseReason,
            pausedAt: STATE.pausedAt,
        });

        const save = (identifier: string | null | undefined = activeConversationIdentifier) => {
            storageManager.saveSnapshot(identifier, persistable());
        };

        const scheduleSave = () => {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                saveTimer = null;
                save();
            }, 150);
        };

        modelController = initModelController({
            state: STATE,
            emitStateChange,
            refreshControls: () => queueController?.refreshControls(),
            saveState: save,
            dispatchPointerAndMousePress,
            dispatchKeyboardEnterPress,
        });

        const {
            modelMenuController,
            supportsThinkingForModel,
            labelForModel,
            openModelDropdownForAnchor,
            ensureModelOptions,
            ensureModel,
            markModelSelected,
            scheduleHeaderModelSync,
            dedupeModelsForDisplay,
            resolveModelOrder,
            activateMenuItem,
            openModelSwitcherDropdown,
            getCurrentModelId,
            getCurrentModelLabel,
            showModelDebugPopup,
        } = modelController;

        queueController = initQueueController({
            state: STATE,
            emitStateChange,
            saveState: save,
            scheduleSaveState: scheduleSave,
            modelController,
            getComposerController: () => composerController,
            pauseShortcutLabel: PAUSE_SHORTCUT_LABEL,
        });

        composerController = initComposerController({
            state: STATE,
            emitStateChange,
            saveState: save,
            refreshControls: () => queueController?.refreshControls(),
            scheduleControlRefresh: () => queueController?.scheduleControlRefresh(),
            setPaused: queueController.setPaused,
            labelForModel,
            supportsThinkingForModel,
            getCurrentModelId,
            getCurrentModelLabel,
            ensureModel,
            markModelSelected,
            openModelDropdownForAnchor,
            modelMenuController,
            activateMenuItem,
            dispatchPointerAndMousePress,
            queueList: queueController.list,
            applyModelSelectionToEntry: queueController.applyModelSelectionToEntry,
            setEntryThinkingOption: queueController.setEntryThinkingOption,
            resolveQueueEntryThinkingLabel: queueController.resolveQueueEntryThinkingLabel,
            addAttachmentsToEntry: queueController.addAttachmentsToEntry,
        });

        queueController.attachComposerController(composerController);

        const selectThinkingTimeOption = async (optionId: ThinkingLevel) =>
            composerController?.selectThinkingTimeOption(optionId) ?? false;

        const handleComposerModelSelection = async (
            model: QueueModelDefinition | null,
        ): Promise<boolean> =>
            composerController?.handleComposerModelSelection(model) ?? false;

        const applyPersistedState = (snapshot: PersistedQueueState | null) => {
            const cq = snapshot && typeof snapshot === "object" ? snapshot : null;
            STATE.running = false;
            STATE.queue = Array.isArray(cq?.queue)
                ? cq.queue.map((item) => normalizeEntry(item))
                : [];
            STATE.collapsed =
                typeof cq?.collapsed === "boolean" ? cq.collapsed : false;
            STATE.paused = typeof cq?.paused === "boolean" ? cq.paused : false;
            STATE.pauseReason =
                typeof cq?.pauseReason === "string" ? cq.pauseReason : "";
            STATE.pausedAt =
                typeof cq?.pausedAt === "number" ? cq.pausedAt : null;
            emitStateChange("state:hydrate");
            hydrated = true;
            queueController?.setHydrated(true);
            queueController?.refreshVisibility();
        };

        const loadPersistedState = (identifier = activeConversationIdentifier) =>
            storageManager.loadSnapshot(identifier).then((snapshot) => {
                applyPersistedState(snapshot);
                return snapshot;
            });

        const persistActiveConversationState = () => {
            if (!hydrated) return;
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
            save(activeConversationIdentifier);
        };

        STATE_EVENTS.subscribe(() => {
            queueController?.refreshAll();
        });

        const queueComposerInput = async () =>
            composerController?.queueComposerInput() ?? false;

        const queueFromComposer = async ({ hold = false } = {}) =>
            composerController?.queueFromComposer({ hold }) ?? false;

        const handleConversationChangeIfNeeded = () => {
            const nextIdentifier = resolveConversationIdentifier();
            if (nextIdentifier === activeConversationIdentifier) return;
            persistActiveConversationState();
            activeConversationIdentifier = nextIdentifier;
            queueController?.resetStateForNewConversation();
            hydrated = false;
            loadPersistedState(nextIdentifier)
                .then(() => ensureModelOptions())
                .catch(() => {});
        };

        const shortcuts = initShortcuts({
            state: STATE,
            isApplePlatform,
            modelShortcutOrder: MODEL_SHORTCUT_KEY_ORDER,
            thinkingOptions: THINKING_TIME_OPTIONS,
            getQueueRows: () => queueController?.getQueueRows() ?? [],
            focusQueueRow: (row) => queueController?.focusQueueRow(row) ?? false,
            focusComposerEditor: () => queueController?.focusComposerEditor() ?? false,
            getComposerNode: composer,
            togglePaused: () => queueController?.togglePaused(),
            setCollapsed: (collapsed) => queueController?.setCollapsed(collapsed),
            openModelSwitcherDropdown,
            dedupeModelsForDisplay,
            resolveModelOrder,
            handleComposerModelSelection,
            selectThinkingTimeOption,
            emitStateChange,
            scheduleControlRefresh: () => queueController?.scheduleControlRefresh(),
            queueFromComposer,
            queueComposerInput,
        });

        chrome.runtime?.onMessage.addListener((msg) => {
            if (msg?.type === "queue-from-shortcut") void queueComposerInput();
            if (msg?.type === "toggle-ui") {
                queueController?.setCollapsed(false);
            }
            if (msg?.type === "show-ui") {
                queueController?.setCollapsed(false);
            }
        });

        const conversationChangeInterval = window.setInterval(
            handleConversationChangeIfNeeded,
            800,
        );

        window.addEventListener("popstate", handleConversationChangeIfNeeded);
        window.addEventListener("hashchange", handleConversationChangeIfNeeded);

        if (typeof history === "object" && history) {
            (["pushState", "replaceState"] as const).forEach((method) => {
                const original = history[method];
                if (typeof original !== "function") return;
                history[method] = function cqPatchedHistoryMethod(
                    this: History,
                    ...args: Parameters<History[typeof method]>
                ) {
                    const result = original.apply(this, args);
                    handleConversationChangeIfNeeded();
                    return result;
                } as History[typeof method];
            });
        }

        window.addEventListener("beforeunload", () => {
            clearInterval(conversationChangeInterval);
            persistActiveConversationState();
            shortcuts.dispose();
        });

        const rootObserver = new MutationObserver(() => {
            queueController?.scheduleControlRefresh();
            queueController?.ensureMounted();
            shortcuts.refreshPopover();
            handleConversationChangeIfNeeded();
        });
        rootObserver.observe(document.documentElement, {
            subtree: true,
            childList: true,
        });

        queueController.ensureMounted();
        shortcuts.refreshPopover();
        queueController.refreshVisibility();

        loadPersistedState()
            .then(() => ensureModelOptions())
            .catch(() => {})
            .finally(() => {
                scheduleHeaderModelSync(0);
            });

        window.__CQ_DEBUG_MODELS = typeof window.__CQ_DEBUG_MODELS === "boolean"
            ? window.__CQ_DEBUG_MODELS
            : false;
        if (window.__CQ_DEBUG_MODELS) {
            window.cqShowModelDebugPopup = (models) => {
                showModelDebugPopup(models);
            };
        }
    },
});
