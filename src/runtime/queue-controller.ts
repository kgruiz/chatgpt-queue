import { cloneAttachment } from "../lib/attachments";
import { setQueuePauseState, removeQueueEntry, reorderQueueEntry } from "../lib/state/queue";
import type { QueueState } from "../lib/state";
import { UI_CLASS } from "../lib/ui/classes";
import { createQueueShell } from "../lib/ui/header";
import { createConfirmModal } from "../lib/ui/modal";
import {
    createAttachmentList,
    createAttachmentPreview,
    createModelButton,
    createQueueIconButton,
    createQueueRowSkeleton,
} from "../lib/ui/rows";
import type {
    Attachment,
    QueueEntry,
    QueueModelDefinition,
    ThinkingLevel,
    ThinkingOption,
} from "../lib/types";
import {
    THINKING_TIME_OPTIONS,
    isThinkingLevelAvailableForPlan,
} from "../lib/constants/models";
import { composer, CQ_SELECTORS, findEditor, isGenerating } from "./dom-adapters";
import type { ComposerController } from "./composer-controller";
import type { ModelController } from "./model-controller";
import type { Emit, QueueElements } from "./types";

export interface QueueControllerContext {
    state: QueueState;
    emitStateChange: Emit;
    saveState: (identifier?: string | null) => void;
    scheduleSaveState: () => void;
    modelController: ModelController;
    getComposerController?: () => ComposerController | null;
    pauseShortcutLabel: string;
}

export interface QueueController {
    ui: HTMLElement;
    list: HTMLElement | null;
    collapseToggle: HTMLButtonElement | null;
    inlineHeader: HTMLElement | null;
    pauseToggle: HTMLButtonElement | null;
    getQueueRows: () => HTMLElement[];
    focusQueueRow: (row: Element | null) => boolean;
    focusComposerEditor: () => boolean;
    refreshAll: () => void;
    refreshControls: () => void;
    refreshVisibility: () => void;
    setCollapsed: (collapsed: boolean, persist?: boolean) => void;
    setPaused: (next: boolean, options?: { reason?: string | null }) => void;
    togglePaused: (reason?: string | null) => void;
    scheduleControlRefresh: () => void;
    setHydrated: (hydrated: boolean) => void;
    resetStateForNewConversation: () => void;
    applyModelSelectionToEntry: (index: number, model: QueueModelDefinition) => void;
    setEntryThinkingOption: (
        index: number,
        value: string | ThinkingLevel | null | undefined,
    ) => void;
    resolveQueueEntryThinkingLabel: (entry: QueueEntry) => string;
    addAttachmentsToEntry: (index: number, attachments: Attachment[]) => void;
    removeEntryAttachment: (index: number, id: string) => void;
    attachComposerController: (controller: ComposerController) => void;
    ensureMounted: () => void;
    scheduleQueueHeightSync: () => void;
    flushQueueHeightSync: () => void;
    dispose: () => void;
}

const QUEUE_VIEWPORT_MAX_HEIGHT = 220;
const QUEUE_COLLAPSE_DURATION_MS = 620;
const QUEUE_COLLAPSE_EASING = "cubic-bezier(0.3, 1, 0.6, 1)";
const QUEUE_CONTENT_FADE_DURATION_MS = 300;
const CAN_USE_WEB_ANIMATIONS =
    typeof Element !== "undefined" &&
    typeof Element.prototype?.animate === "function";

const THINKING_OPTION_MAP: Record<ThinkingLevel, ThinkingOption> =
    THINKING_TIME_OPTIONS.reduce<Record<ThinkingLevel, ThinkingOption>>((map, option) => {
        map[option.id] = option;
        return map;
    }, {} as Record<ThinkingLevel, ThinkingOption>);

const DEFAULT_THINKING_BUTTON_LABEL = "Thinking level";
const DEFAULT_THINKING_OPTION_LABEL = "Use current thinking";
const THINKING_OPTION_ID_SET = new Set<ThinkingLevel>(
    THINKING_TIME_OPTIONS.map((option) => option.id),
);

const normalizeThinkingOptionId = (value: unknown): ThinkingLevel | null => {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    if (!THINKING_OPTION_ID_SET.has(normalized as ThinkingLevel)) return null;
    return normalized as ThinkingLevel;
};

const labelForThinkingOption = (
    id: unknown,
    fallback = DEFAULT_THINKING_OPTION_LABEL,
): string => {
    const normalized = normalizeThinkingOptionId(id);
    if (!normalized) return fallback;
    return THINKING_OPTION_MAP[normalized]?.label || fallback;
};

const formatFollowUpLabel = (count: number): string =>
    `${count} follow-up${count === 1 ? "" : "s"}`;

export const initQueueController = (ctx: QueueControllerContext): QueueController => {
    const { state: STATE, emitStateChange, saveState: save, scheduleSaveState: scheduleSave, modelController, pauseShortcutLabel } = ctx;

    let composerController =
        typeof ctx.getComposerController === "function"
            ? ctx.getComposerController() || null
            : null;

    document.getElementById("cq-ui")?.remove();
    document.getElementById("cq-dock")?.remove();

    const {
        root: ui,
        queueList: list,
        collapseToggle,
        inlineHeader,
        pauseToggle,
        pauseLabel,
        queueLabel,
        stateLabel: elState,
    } = createQueueShell();

    ui.setAttribute("aria-hidden", "true");
    if (list) {
        list.style.setProperty(
            "--cq-queue-content-fade-duration",
            `${QUEUE_CONTENT_FADE_DURATION_MS}ms`,
        );
    }

    const elements: QueueElements = {
        ui,
        list,
        collapseToggle,
        inlineHeader,
        pauseToggle,
    };

    let hydrated = false;
    let canvasModeActive = false;
    let queueHeightRaf = 0;
    let lastQueueExpandedHeight = "";
    let queueCollapseAnimation: Animation | null = null;
    let lastRenderedCollapsed: boolean | null = null;
    let threadLayoutSignature = "";
    let threadLayoutRaf = 0;
    let threadLayoutObserver: ResizeObserver | null = null;
    let observedLayoutNode: HTMLElement | null = null;
    let controlRefreshPending = false;
    let autoDispatchTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingManualSend: { entry: QueueEntry; allowWhilePaused: boolean } | null = null;
    let dragIndex: number | null = null;
    let dragOverItem: HTMLElement | null = null;
    let dragOverPosition: "before" | "after" | null = null;

    const disposables: Array<() => void> = [];

    const addCleanup = (cleanup: () => void) => {
        disposables.push(cleanup);
    };

    const bind = (
        target: EventTarget | null | undefined,
        event: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
    ) => {
        if (!target || typeof (target as EventTarget).addEventListener !== "function") return;
        target.addEventListener(event, handler, options);
        addCleanup(() => {
            try {
                target.removeEventListener(event, handler, options);
            } catch (_) {
                /* noop */
            }
        });
    };

    const setHydrated = (next: boolean) => {
        hydrated = !!next;
    };

    const createQueueEntryThinkingPill = (
        entry: QueueEntry | null | undefined,
        index: number,
    ): HTMLElement | null =>
        composerController?.createQueueEntryThinkingPill(entry, index) || null;

    const hasComposerPrompt = () =>
        composerController?.hasComposerPrompt() ?? false;

    const sendFromQueue = async (
        index: number,
        { allowWhilePaused = false }: { allowWhilePaused?: boolean } = {},
    ) =>
        composerController?.sendFromQueue(index, { allowWhilePaused }) ?? false;

    const clickStop = () => {
        composerController?.clickStop();
    };

    const applyThreadLayoutVars = (source: HTMLElement | null) => {
        if (!(source instanceof HTMLElement)) return;
        const THREAD_LAYOUT_VARS = [
            "--thread-content-margin",
            "--thread-content-max-width",
        ];
        const computed = window.getComputedStyle(source);
        const values = THREAD_LAYOUT_VARS.map((token) =>
            (computed.getPropertyValue(token) || "").trim(),
        );
        const signature = values.join("|");
        if (signature === threadLayoutSignature) return;
        threadLayoutSignature = signature;
        THREAD_LAYOUT_VARS.forEach((token, index) => {
            const value = values[index];
            if (value) {
                ui.style.setProperty(token, value);
            } else {
                ui.style.removeProperty(token);
            }
        });
    };

    const scheduleThreadLayoutSync = (source?: HTMLElement | null) => {
        const target = source || observedLayoutNode || composer();
        if (!(target instanceof HTMLElement)) return;
        if (threadLayoutRaf) cancelAnimationFrame(threadLayoutRaf);
        threadLayoutRaf = requestAnimationFrame(() => {
            threadLayoutRaf = 0;
            applyThreadLayoutVars(target);
        });
    };

    const observeThreadLayoutSource = (node: HTMLElement | null) => {
        if (!(node instanceof HTMLElement)) return;
        if (observedLayoutNode === node) {
            scheduleThreadLayoutSync(node);
            return;
        }
        observedLayoutNode = node;
        if (typeof ResizeObserver === "function") {
            if (!threadLayoutObserver) {
                threadLayoutObserver = new ResizeObserver(() =>
                    scheduleThreadLayoutSync(observedLayoutNode),
                );
            } else {
                threadLayoutObserver.disconnect();
            }
            threadLayoutObserver.observe(node);
        }
        scheduleThreadLayoutSync(node);
    };

    const handleWindowResize = () => scheduleThreadLayoutSync();

    bind(window, "resize", handleWindowResize);

    const setQueueExpandedHeight = (value: string) => {
        if (!(list instanceof HTMLElement)) return;
        if (lastQueueExpandedHeight === value) return;
        lastQueueExpandedHeight = value;
        list.style.setProperty("--cq-queue-expanded-height", value);
    };

    const parsePxValue = (value: string): number => {
        if (typeof value !== "string") return 0;
        const numeric = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
        return Number.isFinite(numeric) ? numeric : 0;
    };

    const measureQueueExpandedHeight = () => {
        if (!(list instanceof HTMLElement)) return;
        const scrollHeight = list.scrollHeight || 0;
        const computed = window.getComputedStyle(list);
        const expandedBleed = parsePxValue(
            computed.getPropertyValue("--queue-shadow-bleed") || "0px",
        );
        const currentBleedPadding = parsePxValue(
            computed.getPropertyValue("--queue-shadow-bleed-padding") ||
                "0px",
        );
        const bleedDelta = Math.max(expandedBleed - currentBleedPadding, 0);
        const totalHeight = scrollHeight + bleedDelta;
        const bounded = Math.min(
            Math.max(totalHeight, 0),
            QUEUE_VIEWPORT_MAX_HEIGHT,
        );
        setQueueExpandedHeight(`${bounded}px`);
    };

    const scheduleQueueHeightSync = () => {
        if (queueHeightRaf) return;
        queueHeightRaf = requestAnimationFrame(() => {
            queueHeightRaf = 0;
            measureQueueExpandedHeight();
        });
    };

    const flushQueueHeightSync = () => {
        if (queueHeightRaf) {
            cancelAnimationFrame(queueHeightRaf);
            queueHeightRaf = 0;
        }
        measureQueueExpandedHeight();
    };

    const getQueueExpandedHeightValue = () => {
        if (!(list instanceof HTMLElement)) return 0;
        const computed = window.getComputedStyle(list);
        const declared =
            computed.getPropertyValue("--cq-queue-expanded-height") ||
            computed.getPropertyValue("--cq-queue-max-height") ||
            "";
        const numeric = parsePxValue(declared);
        if (numeric > 0) return numeric;
        return list.scrollHeight || 0;
    };

    const setQueueAnimationState = (state: string | null) => {
        if (!(list instanceof HTMLElement)) return;
        if (state) {
            list.dataset.cqAnimState = state;
        } else {
            delete list.dataset.cqAnimState;
        }
    };

    const cancelQueueAnimation = (
        { preserveVisualState = false }: { preserveVisualState?: boolean } = {},
    ) => {
        if (!(list instanceof HTMLElement)) {
            queueCollapseAnimation = null;
            return null;
        }
        let preservedHeight = null as number | null;
        if (preserveVisualState) {
            const rect = list.getBoundingClientRect();
            if (rect && Number.isFinite(rect.height)) {
                preservedHeight = rect.height;
            }
        }
        if (queueCollapseAnimation) {
            queueCollapseAnimation.cancel();
            queueCollapseAnimation = null;
        }
        setQueueAnimationState("");
        if (preserveVisualState && preservedHeight !== null) {
            list.style.setProperty("max-height", `${preservedHeight}px`);
        } else {
            list.style.removeProperty("max-height");
        }
        return preservedHeight;
    };

    const animateQueueContainer = (targetCollapsed: boolean) => {
        if (!(list instanceof HTMLElement)) return;
        flushQueueHeightSync();
        if (!CAN_USE_WEB_ANIMATIONS) {
            list.classList.toggle("is-collapsed", targetCollapsed);
            setQueueAnimationState("");
            return;
        }
        const wasCollapsedClass = list.classList.contains("is-collapsed");
        if (!targetCollapsed && wasCollapsedClass) {
            list.classList.remove("is-collapsed");
        }
        const expandedHeight = getQueueExpandedHeightValue();
        const currentRect = list.getBoundingClientRect();
        const startHeight =
            currentRect?.height && Number.isFinite(currentRect.height)
                ? currentRect.height
                : targetCollapsed
                  ? expandedHeight
                  : 0;
        const endHeight = targetCollapsed ? 0 : expandedHeight;
        if (Math.abs(startHeight - endHeight) < 0.5) {
            list.classList.toggle("is-collapsed", targetCollapsed);
            setQueueAnimationState("");
            return;
        }
        const preservedHeight = cancelQueueAnimation({ preserveVisualState: true });
        const initialHeight =
            preservedHeight !== null ? preservedHeight : startHeight;
        list.style.maxHeight = `${initialHeight}px`;
        setQueueAnimationState(targetCollapsed ? "collapsing" : "expanding");
        queueCollapseAnimation = list.animate(
            [
                { maxHeight: `${startHeight}px` },
                { maxHeight: `${endHeight}px` },
            ],
            {
                duration: QUEUE_COLLAPSE_DURATION_MS,
                easing: QUEUE_COLLAPSE_EASING,
                fill: "forwards",
            },
        );
        queueCollapseAnimation.onfinish = () => {
            list.style.removeProperty("max-height");
            list.classList.toggle("is-collapsed", targetCollapsed);
            setQueueAnimationState("");
            queueCollapseAnimation = null;
            scheduleQueueHeightSync();
        };
        queueCollapseAnimation.oncancel = () => {
            list.style.removeProperty("max-height");
            setQueueAnimationState("");
            queueCollapseAnimation = null;
            scheduleQueueHeightSync();
        };
    };

    measureQueueExpandedHeight();

    const locateCanvasPanel = (): HTMLElement | null => {
        const marked = document.querySelector<HTMLElement>("[data-cq-canvas-panel='true']");
        if (marked) return marked;
        const candidate = document.querySelector<HTMLElement>(
            'div.bg-token-bg-primary.absolute.start-0.z-20.h-full.overflow-hidden[style*="calc("][style*="translateX"]',
        );
        if (candidate && candidate.querySelector("section.popover")) {
            candidate.dataset.cqCanvasPanel = "true";
            return candidate;
        }
        return null;
    };

    const isCanvasWorkspaceOpen = () => !!locateCanvasPanel();

    const getPauseLabelText = () => {
        if (!pauseLabel) return "";
        const basePaused = STATE.paused ? "Resume queue" : "Pause queue";
        if (!canvasModeActive) return basePaused;
        return STATE.paused ? "Resume" : "Pause";
    };

    const refreshPauseLabel = () => {
        if (!pauseLabel) return;
        pauseLabel.textContent = getPauseLabelText();
    };

    const refreshQueueLabel = () => {
        if (!queueLabel) return;
        queueLabel.textContent = formatFollowUpLabel(STATE.queue.length);
    };

    const getQueueRows = (): HTMLElement[] =>
        Array.from(list?.querySelectorAll?.(CQ_SELECTORS.row) || []) as HTMLElement[];

    const focusQueueRow = (row: Element | null): boolean => {
        if (!(row instanceof HTMLElement)) return false;
        const textarea = row.querySelector(CQ_SELECTORS.rowTextarea);
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        textarea.focus({ preventScroll: true });
        requestAnimationFrame(() => {
            const length = textarea.value.length;
            textarea.setSelectionRange(length, length);
        });
        row.scrollIntoView({ block: "nearest" });
        return true;
    };

    const focusComposerEditor = () => {
        const ed = findEditor();
        if (!ed) return false;
        ed.focus({ preventScroll: true });
        return true;
    };

    const entryPreviewText = (entry: QueueEntry | null | undefined, index: number): string => {
        const raw =
            (typeof entry?.text === "string" ? entry.text : "").trim() ||
            `Follow-up #${(index ?? 0) + 1}`;
        return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
    };

    const showDeleteConfirmDialog = (entry: QueueEntry, index: number) =>
        new Promise<boolean>((resolve) => {
            const title = "Delete follow-up?";
            const preview = entryPreviewText(entry, index);
            const previousActive = document.activeElement as HTMLElement | null;

            const bodyLine = document.createElement("div");
            bodyLine.textContent = "This will delete ";
            const strong = document.createElement("strong");
            strong.textContent = preview;
            bodyLine.appendChild(strong);
            bodyLine.append(".");

            const modal = createConfirmModal({
                title,
                body: bodyLine,
                confirmLabel: "Delete",
                cancelLabel: "Cancel",
                testId: "cq-delete-followup",
                confirmTestId: "cq-delete-queue-confirm",
            });

            const cleanup = (result: boolean) => {
                modal.root.remove();
                document.removeEventListener("keydown", onKeyDown, true);
                previousActive?.focus?.({ preventScroll: true });
                resolve(result);
            };

            const onKeyDown = (event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    cleanup(false);
                }
            };

            modal.overlay.addEventListener("click", (event) => {
                if (
                    event.target === modal.overlay ||
                    event.target === modal.container
                ) {
                    cleanup(false);
                }
            });
            modal.cancelButton.addEventListener("click", () => cleanup(false));
            modal.confirmButton.addEventListener("click", () => cleanup(true));

            document.addEventListener("keydown", onKeyDown, true);
            document.body.appendChild(modal.root);
            requestAnimationFrame(() => {
                modal.confirmButton.focus();
            });
        });

    const deleteQueueEntry = (index: number): boolean => {
        const removed = removeQueueEntry(STATE, index);
        if (!removed) return false;
        save();
        emitStateChange("queue:delete", { index });
        return true;
    };

    const focusAfterDeletion = (index: number) => {
        requestAnimationFrame(() => {
            const rows = getQueueRows();
            if (!rows.length) {
                focusComposerEditor();
                return;
            }
            const nextIndex = Math.min(index, rows.length - 1);
            focusQueueRow(rows[nextIndex]);
        });
    };

    const requestDeleteEntry = (
        index: number,
        { skipConfirm = false }: { skipConfirm?: boolean } = {},
    ) => {
        if (!Number.isInteger(index)) return;
        if (skipConfirm) {
            if (deleteQueueEntry(index)) focusAfterDeletion(index);
            return;
        }
        const entry = STATE.queue[index];
        if (!entry) return;
        showDeleteConfirmDialog(entry, index).then((confirmed) => {
            if (!confirmed) return;
            if (deleteQueueEntry(index)) focusAfterDeletion(index);
        });
    };

    const resolveQueueEntryModelLabel = (entry: QueueEntry | null | undefined) => {
        const {
            labelForModel,
            resolveCurrentModelButtonValue,
            getCurrentModelId,
            getCurrentModelLabel,
        } = modelController;
        if (!entry) return resolveCurrentModelButtonValue() || "Select model";
        if (entry.model) {
            return labelForModel(entry.model, entry.modelLabel || entry.model);
        }
        if (entry.modelLabel) return entry.modelLabel;
        const currentModelId = getCurrentModelId();
        const currentModelLabel = getCurrentModelLabel();
        if (currentModelId) {
            return labelForModel(
                currentModelId,
                currentModelLabel || currentModelId,
            );
        }
        return resolveCurrentModelButtonValue() || "Select model";
    };

    const resolveQueueEntryThinkingLabel = (entry: QueueEntry): string => {
        const normalized = normalizeThinkingOptionId(entry?.thinking);
        if (!normalized) return DEFAULT_THINKING_OPTION_LABEL;
        if (normalized === "standard") return "Thinking";
        const label = labelForThinkingOption(normalized, DEFAULT_THINKING_BUTTON_LABEL);
        if (!label) return DEFAULT_THINKING_BUTTON_LABEL;
        return `${label} thinking`;
    };

    const setEntryThinkingOption = (
        index: number,
        value: string | ThinkingLevel | null | undefined,
    ) => {
        const entry = STATE.queue[index];
        if (!entry) return;
        if (!modelController.supportsThinkingForModel(entry.model, entry.modelLabel)) {
            if (entry.thinking) {
                entry.thinking = null;
                scheduleSave();
                emitStateChange("queue:entry-thinking-reset", { index });
            }
            return;
        }
        const normalized = normalizeThinkingOptionId(value);
        const plan = modelController.detectUserPlan();
        const allowedValue =
            normalized && isThinkingLevelAvailableForPlan(plan, normalized)
                ? normalized
                : null;
        const nextValue = allowedValue || null;
        if (entry.thinking === nextValue) return;
        entry.thinking = nextValue;
        scheduleSave();
        emitStateChange("queue:entry-thinking", {
            index,
            value: nextValue,
        });
    };

    const applyModelSelectionToEntry = (index: number, model: QueueModelDefinition) => {
        if (!model?.id) return;
        const entry = STATE.queue[index];
        if (!entry) return;
        const canonicalId = modelController.applyModelIdAlias(model.id);
        entry.model = canonicalId;
        entry.modelLabel = model.label || canonicalId;
        if (!modelController.supportsThinkingForModel(entry.model, entry.modelLabel)) {
            entry.thinking = null;
        }
        scheduleSave();
        emitStateChange("queue:entry-model", {
            index,
            modelId: entry.model,
        });
    };

    const openQueueEntryModelDropdown = async (
        index: number,
        anchor: HTMLElement | null,
    ) => {
        if (!Number.isInteger(index)) return;
        const entry = STATE.queue[index];
        if (!entry || !(anchor instanceof HTMLElement)) return;
        await modelController.openModelDropdownForAnchor(anchor, {
            selectedModelId: entry.model,
            onSelect: (model) => {
                modelController.modelMenuController.close();
                applyModelSelectionToEntry(index, model);
            },
        });
    };

    const refreshControls = () => {
        const manualSendEnabled = STATE.queue.length > 0 && !STATE.busy;
        refreshQueueLabel();
        if (elState) {
            let status = "Idle";
            if (STATE.paused) {
                status = "Paused";
            } else if (STATE.busy) {
                status = STATE.phase === "waiting" ? "Waiting…" : "Sending…";
            }
            elState.textContent = status;
        }
        composerController?.ensureComposerControls();
        composerController?.refreshComposerModelLabelButton();
        modelController.ensureModelSwitcherObserver();
        const promptHasContent = hasComposerPrompt();
        const hasQueueItems = STATE.queue.length > 0;
        composerController?.updateComposerControlsState({
            promptHasContent,
            hasQueueItems,
        });
        if (pauseToggle) {
            pauseToggle.dataset.state = STATE.paused ? "paused" : "active";
            pauseToggle.setAttribute(
                "aria-pressed",
                STATE.paused ? "true" : "false",
            );
            pauseToggle.setAttribute(
                "aria-label",
                STATE.paused ? "Resume queue" : "Pause queue",
            );
            pauseToggle.title = `${STATE.paused ? "Resume" : "Pause"} queue (${pauseShortcutLabel})`;
        }
        refreshPauseLabel();
        ui.classList.toggle("is-busy", STATE.busy);
        ui.classList.toggle("is-paused", STATE.paused);
        if (list) {
            list.querySelectorAll<HTMLButtonElement>('button[data-action="send"]').forEach(
                (button) => {
                    button.disabled = !manualSendEnabled;
                    if (!manualSendEnabled) {
                        if (STATE.busy) {
                            button.title = "Queue busy";
                        } else {
                            button.title = "Queue empty";
                        }
                    } else {
                        button.title = "Send now";
                    }
                },
            );
        }
        if (STATE.queue.length === 0 || STATE.busy || STATE.paused) {
            cancelAutoDispatch();
        } else {
            maybeAutoDispatch();
        }
    };

    const refreshVisibility = () => {
        ensureMounted();
        const shouldShow = hydrated && STATE.queue.length > 0;
        ui.style.display = shouldShow ? "flex" : "none";
        ui.setAttribute("aria-hidden", shouldShow ? "false" : "true");
        if (collapseToggle) {
            collapseToggle.setAttribute(
                "aria-expanded",
                STATE.collapsed ? "false" : "true",
            );
            collapseToggle.setAttribute(
                "aria-label",
                STATE.collapsed ? "Expand queue" : "Collapse queue",
            );
        }
        if (collapseToggle?.parentElement?.classList.contains(UI_CLASS.inlineMeta)) {
            const header = collapseToggle.closest(CQ_SELECTORS.inlineHeader);
            if (header) {
                header.classList.toggle("is-collapsed", STATE.collapsed);
            }
        }
        if (list) {
            if (!shouldShow) {
                cancelQueueAnimation();
                list.classList.toggle("is-collapsed", false);
                list.setAttribute("aria-hidden", "true");
                lastRenderedCollapsed = null;
            } else {
                const hasRenderedState = lastRenderedCollapsed !== null;
                const collapseChanged =
                    hasRenderedState &&
                    lastRenderedCollapsed !== STATE.collapsed;
                if (collapseChanged) {
                    animateQueueContainer(STATE.collapsed);
                } else if (!queueCollapseAnimation) {
                    list.classList.toggle("is-collapsed", STATE.collapsed);
                }
                list.setAttribute(
                    "aria-hidden",
                    STATE.collapsed ? "true" : "false",
                );
                lastRenderedCollapsed = STATE.collapsed;
            }
        }
        scheduleQueueHeightSync();
    };

    const setCollapsed = (collapsed: boolean, persist = true) => {
        const next = !!collapsed;
        const focusInQueue =
            next &&
            list instanceof HTMLElement &&
            document.activeElement instanceof HTMLElement &&
            list.contains(document.activeElement);
        flushQueueHeightSync();
        STATE.collapsed = next;
        refreshVisibility();
        refreshControls();
        if (persist) save();
        if (focusInQueue) {
            focusComposerEditor();
        }
    };

    const setPaused = (next: boolean, { reason }: { reason?: string | null } = {}) => {
        const result = setQueuePauseState(STATE, next, { reason: reason ?? undefined });
        if (!result.changed) return;
        if (STATE.paused) {
            cancelAutoDispatch();
        }
        refreshControls();
        save();
        if (!STATE.paused) {
            maybeAutoDispatch(120);
        }
    };

    const togglePaused = (reason?: string | null) => {
        if (!hydrated) return;
        setPaused(!STATE.paused, { reason });
    };

    const autoSize = (textarea: HTMLTextAreaElement | null | undefined) => {
        if (!(textarea instanceof HTMLTextAreaElement)) return;
        textarea.style.height = "auto";
        const height = Math.min(200, textarea.scrollHeight || 24);
        textarea.style.height = `${height}px`;
        scheduleQueueHeightSync();
    };

    const scheduleControlRefresh = () => {
        if (controlRefreshPending) return;
        controlRefreshPending = true;
        requestAnimationFrame(() => {
            controlRefreshPending = false;
            refreshControls();
        });
    };

    const resetStateForNewConversation = () => {
        cancelAutoDispatch();
        pendingManualSend = null;
        STATE.queue = [];
        STATE.collapsed = false;
        STATE.paused = false;
        STATE.pauseReason = "";
        STATE.pausedAt = null;
        STATE.busy = false;
        STATE.phase = "idle";
        hydrated = false;
        emitStateChange("state:reset");
    };

    const shouldAutoDispatch = () => {
        if (pendingManualSend) return false;
        if (STATE.busy) return false;
        if (STATE.paused) return false;
        if (isGenerating()) return false;
        if (STATE.queue.length === 0) return false;
        if (!composer()) return false;
        if (hasComposerPrompt()) return false;
        return true;
    };

    const cancelAutoDispatch = () => {
        if (autoDispatchTimer) {
            clearTimeout(autoDispatchTimer);
            autoDispatchTimer = null;
        }
    };

    const maybeAutoDispatch = (delay = 120) => {
        if (pendingManualSend) {
            if (STATE.busy) return;
            if (STATE.paused && !pendingManualSend.allowWhilePaused) return;
            const { entry, allowWhilePaused } = pendingManualSend;
            pendingManualSend = null;
            const index = STATE.queue.indexOf(entry);
            if (index !== -1) {
                void sendFromQueue(index, { allowWhilePaused: !!allowWhilePaused });
                return;
            }
        }
        if (STATE.paused) {
            cancelAutoDispatch();
            return;
        }
        if (!shouldAutoDispatch()) {
            cancelAutoDispatch();
            return;
        }
        if (autoDispatchTimer) return;
        autoDispatchTimer = setTimeout(() => {
            autoDispatchTimer = null;
            if (!shouldAutoDispatch()) return;
            const result = sendFromQueue(0);
            if (result && typeof result.then === "function") {
                result
                    .then((success) => {
                        if (!success) maybeAutoDispatch(240);
                    })
                    .catch(() => {
                        maybeAutoDispatch(240);
                    });
            }
        }, delay);
    };

    const requestSend = (index: number, { manual = false }: { manual?: boolean } = {}) => {
        if (!Number.isInteger(index) || index < 0) return;
        const allowWhilePaused = !!manual;
        if (STATE.paused && !allowWhilePaused) return;
        const entry = STATE.queue[index];
        if (!entry) return;
        if (manual && STATE.busy) {
            pendingManualSend = { entry, allowWhilePaused };
            cancelAutoDispatch();
            if (isGenerating()) clickStop();
            scheduleControlRefresh();
            return;
        }
        void sendFromQueue(index, { allowWhilePaused });
    };

    const addAttachmentsToEntry = (index: number, attachments: Attachment[]) => {
        if (!Array.isArray(attachments) || attachments.length === 0) return;
        const entry = STATE.queue[index];
        if (!entry) return;
        if (!Array.isArray(entry.attachments)) entry.attachments = [];
        const seen = new Set(entry.attachments.map((att) => att.id));
        attachments.forEach((attachment) => {
            if (!seen.has(attachment.id)) {
                entry.attachments.push(cloneAttachment(attachment));
                seen.add(attachment.id);
            }
        });
        save();
        emitStateChange("queue:attachments-add", { index });
    };

    const removeEntryAttachment = (index: number, id: string) => {
        const entry = STATE.queue[index];
        if (!entry || !Array.isArray(entry.attachments)) return;
        const next = entry.attachments.filter(
            (attachment) => attachment.id !== id,
        );
        if (next.length !== entry.attachments.length) {
            entry.attachments = next;
            save();
            emitStateChange("queue:attachments-remove", { index, id });
        }
    };

    const handleAttachmentPaste = (
        event: ClipboardEvent,
        {
            type,
            index,
            textarea,
        }: { type: "entry" | "composer"; index?: number; textarea?: HTMLTextAreaElement | null },
    ) => {
        composerController?.handleAttachmentPaste(event, { type, index, textarea });
    };

    const moveItem = (from: number, to: number) => {
        if (!reorderQueueEntry(STATE, from, to)) return;
        save();
        emitStateChange("queue:reorder", { from, to });
    };

    const clearDragIndicator = () => {
        if (dragOverItem) {
            dragOverItem.classList.remove(
                UI_CLASS.rowDropBefore,
                UI_CLASS.rowDropAfter,
            );
        }
        dragOverItem = null;
        dragOverPosition = null;
    };

    const renderQueue = () => {
        const canManualSend = !STATE.running && !STATE.busy && !STATE.paused;
        composerController?.closeThinkingDropdown?.();
        list.textContent = "";
        if (STATE.queue.length === 0) {
            scheduleQueueHeightSync();
            return;
        }

        const reversedQueue = [...STATE.queue].reverse();
        const textareasToSize: HTMLTextAreaElement[] = [];
        reversedQueue.forEach((entry, reversedIndex) => {
            const index = STATE.queue.length - 1 - reversedIndex;
            const { row, indicator, body, textarea, actions } =
                createQueueRowSkeleton({
                    index,
                    isNext: index === STATE.queue.length - 1,
                });
            row.dataset.index = String(index);
            indicator.value = String(index + 1);

            let indicatorCommitLocked = false;
            const storeOriginalValue = () => {
                indicator.dataset.originalValue = String(index + 1);
            };
            storeOriginalValue();

            const getOriginalValue = () =>
                indicator.dataset.originalValue || String(index + 1);

            const clearPrefill = () => {
                indicator.removeAttribute("data-prefill");
            };

            const resetIndicator = () => {
                indicator.value = getOriginalValue();
                clearPrefill();
            };

            const hasDigits = () => indicator.value.trim().length > 0;

            const commitIndicatorValue = () => {
                if (indicatorCommitLocked) return;
                indicatorCommitLocked = true;
                clearPrefill();
                const numericValue = Number.parseInt(
                    indicator.value.trim(),
                    10,
                );
                const total = STATE.queue.length;
                if (!Number.isInteger(numericValue) || total === 0) {
                    resetIndicator();
                    return;
                }
                let targetIndex = numericValue - 1;
                if (targetIndex < 0) targetIndex = 0;
                if (targetIndex >= total) targetIndex = total - 1;
                if (targetIndex === index) {
                    resetIndicator();
                    return;
                }
                moveItem(index, targetIndex);
            };

            indicator.addEventListener("focus", () => {
                indicatorCommitLocked = false;
                storeOriginalValue();
                indicator.dataset.prefill = "true";
                indicator.value = "";
            });
            indicator.addEventListener("blur", () => {
                if (!hasDigits()) {
                    resetIndicator();
                    return;
                }
                commitIndicatorValue();
            });
            indicator.addEventListener("keydown", (event) => {
                const allowControlKeys = [
                    "Backspace",
                    "Delete",
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Tab",
                    "Home",
                    "End",
                ];
                if (event.key === "Enter") {
                    event.preventDefault();
                    if (!hasDigits()) {
                        resetIndicator();
                    } else {
                        commitIndicatorValue();
                    }
                    indicator.blur();
                    return;
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    resetIndicator();
                    indicator.blur();
                    return;
                }
                if (allowControlKeys.includes(event.key)) {
                    if (event.key === "Backspace" || event.key === "Delete") {
                        if (!hasDigits()) {
                            indicator.value = "";
                        }
                    }
                    return;
                }
                if (event.metaKey || event.ctrlKey || event.altKey) {
                    return;
                }
                if (event.key.length === 1 && !/\d/.test(event.key)) {
                    event.preventDefault();
                }
            });
            indicator.addEventListener("input", () => {
                const digits = indicator.value.replace(/[^0-9]/g, "");
                if (indicator.value !== digits) {
                    indicator.value = digits;
                }
                if (digits.length > 0) {
                    clearPrefill();
                }
            });
            indicator.addEventListener("paste", (event) => {
                const text = event.clipboardData?.getData("text") || "";
                if (!text) return;
                const digits = text.replace(/[^0-9]/g, "");
                if (!digits) {
                    event.preventDefault();
                    return;
                }
                event.preventDefault();
                indicator.value = digits;
                clearPrefill();
            });
            indicator.addEventListener("dragstart", (event) => {
                event.preventDefault();
            });
            ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
                indicator.addEventListener(eventName, (event) => {
                    event.stopPropagation();
                });
            });

            textarea.value = entry.text;
            textarea.addEventListener("input", () => {
                STATE.queue[index].text = textarea.value;
                autoSize(textarea);
                scheduleSave();
            });
            textarea.addEventListener("blur", () => save());
            textarea.addEventListener("paste", (event) => {
                handleAttachmentPaste(event, {
                    type: "entry",
                    index,
                    textarea,
                });
            });
            textarea.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    if (
                        event.shiftKey ||
                        event.altKey ||
                        event.metaKey ||
                        event.ctrlKey
                    ) {
                        return;
                    }
                    event.preventDefault();
                    requestSend(index, { manual: true });
                    return;
                }
                const isDeleteKey =
                    event.key === "Delete" || event.key === "Backspace";
                if (!isDeleteKey || !event.shiftKey) return;
                event.preventDefault();
                const skipConfirm = !!event.altKey;
                requestDeleteEntry(index, { skipConfirm });
            });
            textareasToSize.push(textarea);

            if (entry.attachments.length) {
                const mediaWrap = createAttachmentList(index);
                entry.attachments.forEach((attachment) => {
                    const mediaNode = createAttachmentPreview(attachment, {
                        entryIndex: index,
                        onLoad: () => scheduleQueueHeightSync(),
                    });
                    mediaWrap.appendChild(mediaNode);
                });
                body.appendChild(mediaWrap);
            }

            const thinkingPill = createQueueEntryThinkingPill(entry, index);
            if (thinkingPill) {
                actions.appendChild(thinkingPill);
            }

            const { button: modelButton, value: modelValue } =
                createModelButton();
            modelButton.dataset.entryIndex = String(index);
            modelValue.textContent = resolveQueueEntryModelLabel(entry);
            modelButton.title = "Choose model for this follow-up";
            modelButton.setAttribute(
                "aria-label",
                "Choose model for this follow-up",
            );
            modelButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                void openQueueEntryModelDropdown(index, modelButton);
            });
            actions.appendChild(modelButton);

            const sendButton = createQueueIconButton("send");
            sendButton.dataset.action = "send";
            sendButton.dataset.index = String(index);
            sendButton.setAttribute("aria-label", "Send now");
            if (!canManualSend) {
                sendButton.disabled = true;
                sendButton.title = STATE.paused
                    ? "Resume queue to send"
                    : STATE.busy
                      ? "Queue busy"
                      : "Queue empty";
            }
            actions.appendChild(sendButton);

            const deleteButton = createQueueIconButton("delete");
            deleteButton.dataset.action = "delete";
            deleteButton.dataset.index = String(index);
            deleteButton.setAttribute("aria-label", "Delete");
            actions.appendChild(deleteButton);

            list.appendChild(row);
        });
        const scheduleMeasureAfterAutosize = () => scheduleQueueHeightSync();
        if (textareasToSize.length) {
            requestAnimationFrame(() => {
                textareasToSize.forEach((area) => autoSize(area));
                scheduleMeasureAfterAutosize();
            });
        } else {
            scheduleMeasureAfterAutosize();
        }
    };

    const refreshAll = () => {
        refreshControls();
        renderQueue();
        refreshVisibility();
    };

    const THREAD_HOST_SELECTOR = "[class*='thread-content']";

    const findThreadContentHost = (
        rootNode: Element | null,
        container: Element | null,
        anchor: Element | null,
    ): HTMLElement | null => {
        if (rootNode instanceof HTMLElement) {
            const closestHost = rootNode.closest(THREAD_HOST_SELECTOR) as HTMLElement | null;
            if (closestHost) return closestHost;
        }
        const scopes: HTMLElement[] = [];
        if (anchor instanceof HTMLElement) scopes.push(anchor);
        if (container instanceof HTMLElement) scopes.push(container);
        for (const scope of scopes) {
            const direct = scope.querySelector(
                `:scope > ${THREAD_HOST_SELECTOR}`,
            );
            if (direct instanceof HTMLElement) return direct;
        }
        for (const scope of scopes) {
            const any = scope.querySelector(THREAD_HOST_SELECTOR);
            if (any instanceof HTMLElement) return any;
        }
        return null;
    };

    const firstNonQueueChild = (parent: HTMLElement | null) => {
        if (!parent) return null;
        let child = parent.firstChild;
        while (child) {
            if (child !== ui) return child;
            child = child.nextSibling;
        }
        return null;
    };

    const ensureMounted = () => {
        const root = composer();
        if (!root || !(root instanceof HTMLElement)) return;
        composerController?.ensureComposerControls(root);
        composerController?.ensureComposerInputListeners(root);
        let container = root.closest<HTMLElement>("#thread-bottom-container");
        if (!container) {
            let current = root.parentElement;
            while (
                current &&
                current !== document.body &&
                current !== document.documentElement &&
                !current.matches("#thread-bottom-container")
            ) {
                current = current.parentElement;
            }
            if (current && current.matches("#thread-bottom-container")) {
                container = current;
            }
        }
        if (!container && root.parentElement) {
            container = root.parentElement;
        }
        if (
            (container === document.body ||
                container === document.documentElement) &&
            root.parentElement &&
            root.parentElement !== container
        ) {
            container = root.parentElement;
        }
        if (!container) {
            container = document.body;
        }
        let anchor = container.querySelector<HTMLElement>("#thread-bottom");
        if (!anchor) {
            anchor = root;
            while (
                anchor &&
                anchor.parentElement &&
                anchor.parentElement !== container
            ) {
                anchor = anchor.parentElement;
            }
        }
        if (
            !anchor ||
            !container.contains(anchor) ||
                anchor.parentElement !== container
        ) {
            if (ui.parentElement !== container) {
                try {
                    container.appendChild(ui);
                } catch (_) {
                    /* noop */
                }
            }
            observeThreadLayoutSource(container);
            return;
        }
        const layoutHost = findThreadContentHost(root, container, anchor);
        const useThreadHost = !!(canvasModeActive && layoutHost);
        const desiredParent = useThreadHost ? layoutHost : container;
        const desiredBefore = useThreadHost
            ? firstNonQueueChild(layoutHost)
            : anchor;
        if (
            ui.parentElement !== desiredParent ||
            ui.nextSibling !== desiredBefore
        ) {
            try {
                desiredParent.insertBefore(ui, desiredBefore || null);
            } catch (_) {
                try {
                    container.insertBefore(ui, anchor);
                } catch (_) {
                    try {
                        container.appendChild(ui);
                    } catch (_) {
                        /* noop */
                    }
                }
            }
        }
        const layoutSource = useThreadHost
            ? layoutHost
            : anchor || container;
        observeThreadLayoutSource(layoutSource || container);
    };

    const syncCanvasMode = (force = false) => {
        const next = isCanvasWorkspaceOpen();
        if (!force && next === canvasModeActive) return;
        canvasModeActive = next;
        ui.classList.toggle(UI_CLASS.canvasMode, canvasModeActive);
        refreshPauseLabel();
        queueMicrotask(() => ensureMounted());
    };

    syncCanvasMode(true);
    const canvasObserver = new MutationObserver(() => syncCanvasMode());
    if (document.body) {
        canvasObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    const onListClick: EventListener = (event) => {
        if (!(event instanceof MouseEvent)) return;
        const target =
            event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;
        const attachmentBtn = target.closest<HTMLButtonElement>("button[data-attachment-remove]");
        if (attachmentBtn) {
            const id = attachmentBtn.dataset.attachmentRemove;
            const entryAttr = attachmentBtn.dataset.entryIndex;
            if (id && entryAttr) {
                const index = Number(entryAttr);
                if (Number.isInteger(index)) {
                    removeEntryAttachment(index, id);
                }
            }
            return;
        }
        const button = target.closest<HTMLButtonElement>("button[data-action]");
        if (!button) return;
        const index = Number(button.dataset.index);
        if (!Number.isInteger(index)) return;

        const action = button.dataset.action;
        if (action === "delete") {
            const skipConfirm = !!event.altKey;
            requestDeleteEntry(index, { skipConfirm });
        } else if (action === "send") {
            requestSend(index, { manual: true });
        }
    };

    const onListDragStart: EventListener = (event) => {
        if (!(event instanceof DragEvent)) return;
        const target =
            event.target instanceof HTMLElement
                ? (event.target.closest(CQ_SELECTORS.row) as HTMLElement | null)
                : null;
        if (!target) return;
        const index = Number(target.dataset.index);
        if (!Number.isInteger(index)) return;
        dragIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(index));
            try {
                event.dataTransfer.setDragImage(target, 20, 20);
            } catch (_) {
                /* noop */
            }
        }
        target.classList.add(UI_CLASS.rowDragging);
    };

    const onListDragEnd: EventListener = () => {
        list.querySelector(`.${UI_CLASS.rowDragging}`)?.classList.remove(
            UI_CLASS.rowDragging,
        );
        dragIndex = null;
        clearDragIndicator();
    };

    const onListDragOver: EventListener = (event) => {
        if (!(event instanceof DragEvent)) return;
        if (dragIndex === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const item =
            event.target instanceof HTMLElement
                ? (event.target.closest(CQ_SELECTORS.row) as HTMLElement | null)
                : null;
        if (!item) {
            clearDragIndicator();
            return;
        }
        const overIndex = Number(item.dataset.index);
        if (!Number.isInteger(overIndex)) return;
        if (overIndex === dragIndex) {
            clearDragIndicator();
            return;
        }
        const rect = item.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const position = event.clientY < midpoint ? "before" : "after";
        if (item !== dragOverItem || position !== dragOverPosition) {
            clearDragIndicator();
            dragOverItem = item;
            dragOverPosition = position;
            item.classList.add(
                position === "before"
                    ? UI_CLASS.rowDropBefore
                    : UI_CLASS.rowDropAfter,
            );
        }
    };

    const onListDragLeave: EventListener = (event) => {
        if (!(event instanceof DragEvent)) return;
        const item =
            event.target instanceof HTMLElement
                ? (event.target.closest(CQ_SELECTORS.row) as HTMLElement | null)
                : null;
        if (item && item === dragOverItem) clearDragIndicator();
    };

    const onListDrop: EventListener = (event) => {
        if (!(event instanceof DragEvent)) return;
        if (dragIndex === null) return;
        event.preventDefault();
        let newIndex = dragIndex;
        const item =
            event.target instanceof HTMLElement
                ? (event.target.closest(CQ_SELECTORS.row) as HTMLElement | null)
                : null;
        if (item) {
            const overIndex = Number(item.dataset.index);
            if (Number.isInteger(overIndex)) {
                const rect = item.getBoundingClientRect();
                const after = event.clientY >= rect.top + rect.height / 2;
                newIndex = overIndex + (after ? 1 : 0);
            }
        } else {
            newIndex = STATE.queue.length;
        }
        clearDragIndicator();
        const length = STATE.queue.length;
        if (newIndex > length) newIndex = length;
        if (newIndex > dragIndex) newIndex -= 1;
        moveItem(dragIndex, newIndex);
        dragIndex = null;
    };

    const attachListListeners = () => {
        if (!list) return;
        bind(list, "click", onListClick);
        bind(list, "dragstart", onListDragStart);
        bind(list, "dragend", onListDragEnd);
        bind(list, "dragover", onListDragOver);
        bind(list, "dragleave", onListDragLeave);
        bind(list, "drop", onListDrop);
    };

    attachListListeners();

    if (collapseToggle) {
        bind(collapseToggle, "click", (event) => {
            event.preventDefault();
            setCollapsed(!STATE.collapsed);
        });
    }

    if (inlineHeader) {
        bind(inlineHeader, "click", (event) => {
            if (event.target !== inlineHeader) return;
            setCollapsed(!STATE.collapsed);
        });
    }

    if (pauseToggle) {
        bind(pauseToggle, "click", (event) => {
            event.preventDefault();
            togglePaused();
        });
    }

    const attachComposerController = (controller: ComposerController) => {
        composerController = controller;
        scheduleControlRefresh();
    };

    const dispose = () => {
        cancelAutoDispatch();
        if (queueCollapseAnimation) {
            queueCollapseAnimation.cancel();
            queueCollapseAnimation = null;
        }
        if (queueHeightRaf) {
            cancelAnimationFrame(queueHeightRaf);
            queueHeightRaf = 0;
        }
        if (threadLayoutRaf) {
            cancelAnimationFrame(threadLayoutRaf);
            threadLayoutRaf = 0;
        }
        if (threadLayoutObserver) {
            threadLayoutObserver.disconnect();
            threadLayoutObserver = null;
        }
        canvasObserver.disconnect();
        observedLayoutNode = null;
        disposables.splice(0).forEach((cleanup) => {
            try {
                cleanup();
            } catch (_) {
                /* noop */
            }
        });
        ui?.remove();
    };

    return {
        ...elements,
        getQueueRows,
        focusQueueRow,
        focusComposerEditor,
        refreshAll,
        refreshControls,
        refreshVisibility,
        setCollapsed,
        setPaused,
        togglePaused,
        scheduleControlRefresh,
        setHydrated,
        resetStateForNewConversation,
        applyModelSelectionToEntry,
        setEntryThinkingOption,
        resolveQueueEntryThinkingLabel,
        addAttachmentsToEntry,
        removeEntryAttachment,
        attachComposerController,
        ensureMounted,
        scheduleQueueHeightSync,
        flushQueueHeightSync,
        dispose,
    };
};
