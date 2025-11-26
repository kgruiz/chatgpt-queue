import {
    applyAttachmentsToComposer,
    clearComposerAttachments,
    cloneAttachment,
    collectImagesFromDataTransfer,
    countComposerAttachments,
    gatherComposerAttachments,
    hasImagesInDataTransfer,
} from "../lib/attachments";
import { isDebugSendEnabled } from "../lib/env";
import { enqueueQueueEntry } from "../lib/state/queue";
import type { QueueState } from "../lib/state";
import { sleep } from "../lib/utils";
import { UI_CLASS } from "../lib/ui/classes";
import type { Attachment, QueueEntry, QueueModelDefinition, ThinkingLevel } from "../lib/types";
import {
    THINKING_TIME_OPTIONS,
    isThinkingLevelAvailableForPlan,
    type UserPlan,
} from "../lib/constants/models";
import { SEL, composer, findEditor, findSendButton, isGenerating, isVisible, q } from "./dom-adapters";
import type { ComposerElements, Emit } from "./types";

export interface ComposerControllerContext {
    state: QueueState;
    emitStateChange: Emit;
    saveState: (identifier?: string | null) => void;
    refreshControls: () => void;
    scheduleControlRefresh: () => void;
    setPaused: (next: boolean, options?: { reason?: string | null }) => void;
    labelForModel: (id: string | null | undefined, fallback?: string) => string;
    supportsThinkingForModel: (
        modelId: string | null | undefined,
        label?: string | null,
    ) => boolean;
    getCurrentModelId: () => string | null;
    getCurrentModelLabel: () => string;
    ensureModel: (modelId: string | null | undefined) => Promise<boolean>;
    markModelSelected: (id: string, label?: string) => void;
    openModelDropdownForAnchor: (
        anchor: HTMLElement,
        options?: {
            selectedModelId?: string | null;
            onSelect?: (model: QueueModelDefinition) => void;
        },
    ) => Promise<void>;
    modelMenuController: { close: () => void };
    activateMenuItem: (item: Element | null) => boolean;
    dispatchPointerAndMousePress: (target: Element | null) => void;
    queueList: HTMLElement | null;
    applyModelSelectionToEntry: (index: number, model: QueueModelDefinition) => void;
    setEntryThinkingOption: (
        index: number,
        value: string | ThinkingLevel | null | undefined,
    ) => void;
    resolveQueueEntryThinkingLabel: (entry: QueueEntry) => string;
    addAttachmentsToEntry: (index: number, attachments: Attachment[]) => void;
    getUserPlan: () => UserPlan;
}

export interface ComposerController {
    ensureComposerControls: (root?: HTMLElement | Document | null) => void;
    ensureComposerInputListeners: (root?: HTMLElement | Document | null) => void;
    refreshComposerModelLabelButton: () => void;
    hasComposerPrompt: () => boolean;
    getComposerPromptText: () => string;
    composerHasAttachments: () => boolean;
    queueComposerInput: () => Promise<boolean>;
    queueFromComposer: (options?: { hold?: boolean }) => Promise<boolean>;
    sendFromQueue: (
        index: number,
        options?: { allowWhilePaused?: boolean },
    ) => Promise<boolean>;
    getCurrentThinkingOption: () => ThinkingLevel | null;
    selectThinkingTimeOption: (optionId: ThinkingLevel) => Promise<boolean>;
    handleComposerModelSelection: (
        model: QueueModelDefinition | null,
    ) => Promise<boolean>;
    openComposerModelDropdown: () => Promise<void>;
    waitUntilIdle: (timeoutMs?: number) => Promise<boolean>;
    waitForSendReady: (timeoutMs?: number) => Promise<boolean>;
    waitForSendLaunch: (timeoutMs?: number) => Promise<boolean>;
    clickSend: () => void;
    clickStop: () => void;
    createQueueEntryThinkingPill: (
        entry: QueueEntry | null | undefined,
        index: number,
    ) => HTMLElement | null;
    handleAttachmentPaste: (
        event: ClipboardEvent,
        options: { type: "entry" | "composer"; index?: number; textarea?: HTMLTextAreaElement | null },
    ) => void;
    updateComposerControlsState: (options: { promptHasContent: boolean; hasQueueItems: boolean }) => void;
    closeThinkingDropdown: () => void;
    dispose: () => void;
}

const THINKING_DROPDOWN_ID = "cq-thinking-dropdown";

const THINKING_OPTION_ICONS: Record<ThinkingLevel, string> = {
    light: `
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          class="icon"
          aria-hidden="true"
        >
          <path
            d="M12.0837 0.00494385C12.4509 0.00511975 12.7488 0.302822 12.7488 0.669983C12.7488 1.03714 12.4509 1.33485 12.0837 1.33502H7.91675C7.54948 1.33502 7.25171 1.03725 7.25171 0.669983C7.25171 0.302714 7.54948 0.00494385 7.91675 0.00494385H12.0837Z"
          ></path>
          <path
            d="M10 2.08494C11.3849 2.08494 12.7458 2.44817 13.9463 3.13865C14.2646 3.32174 14.3744 3.72852 14.1914 4.04686C14.0083 4.36522 13.6016 4.47509 13.2832 4.29198C12.2844 3.71745 11.1523 3.41502 10 3.41502C9.63273 3.41502 9.33496 3.11725 9.33496 2.74998C9.33496 2.38271 9.63273 2.08494 10 2.08494Z"
          ></path>
          <path
            d="M11.2992 10.75C10.8849 11.4675 9.96756 11.7133 9.25012 11.2991C8.53268 10.8849 8.28687 9.96747 8.70108 9.25003C9.45108 7.95099 12.0671 5.4199 12.5001 5.6699C12.9331 5.9199 12.0492 9.45099 11.2992 10.75Z"
          ></path>
          <path
            opacity="0.2"
            d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"
          ></path>
        </svg>`,
    standard: `
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          class="icon"
          aria-hidden="true"
        >
          <path
            d="M10 2.08496C14.3713 2.085 17.915 5.62869 17.915 10C17.915 11.2108 17.6427 12.3599 17.1553 13.3877C16.9979 13.7194 16.6013 13.8612 16.2695 13.7041C15.9378 13.5467 15.7959 13.1501 15.9531 12.8184C16.358 11.9648 16.585 11.0097 16.585 10C16.585 6.36323 13.6368 3.41508 10 3.41504C9.63276 3.415 9.33496 3.11725 9.33496 2.75C9.33496 2.38275 9.63276 2.085 10 2.08496Z"
          ></path>
          <path
            d="M8.70117 9.25C9.1154 8.5326 10.0326 8.28697 10.75 8.70117C12.049 9.45122 14.5799 12.0669 14.3301 12.5C14.0796 12.9328 10.549 12.0488 9.25 11.2988C8.53268 10.8846 8.28699 9.96739 8.70117 9.25Z"
          ></path>
          <path
            d="M12.084 0.00488281C12.451 0.00519055 12.749 0.302842 12.749 0.669922C12.749 1.037 12.451 1.33465 12.084 1.33496H7.91699C7.54972 1.33496 7.25195 1.03719 7.25195 0.669922C7.25195 0.302653 7.54972 0.00488281 7.91699 0.00488281H12.084Z"
          ></path>
          <path
            opacity="0.2"
            d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"
          ></path>
        </svg>`,
    extended: `
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          class="icon"
          aria-hidden="true"
        >
          <path
            d="M10.0007 2.08496C14.3717 2.08536 17.9158 5.62891 17.9158 10C17.9158 14.3711 14.3717 17.9146 10.0007 17.915C5.81265 17.915 2.38471 14.6622 2.10425 10.5449C2.07943 10.1786 2.35612 9.86191 2.72241 9.83691C3.08857 9.8123 3.40547 10.0889 3.43042 10.4551C3.66379 13.8792 6.51699 16.5849 10.0007 16.585C13.6372 16.5846 16.5857 13.6365 16.5857 10C16.5857 6.36345 13.6372 3.41544 10.0007 3.41504C9.6335 3.41499 9.33569 3.11724 9.33569 2.75C9.33569 2.38276 9.6335 2.08501 10.0007 2.08496ZM10.0007 8.5C10.8288 8.50042 11.5007 9.17183 11.5007 10C11.5007 10.8282 10.8288 11.4996 10.0007 11.5C8.50073 11.5 5.00073 10.5 5.00073 10C5.00073 9.5 8.50073 8.5 10.0007 8.5ZM12.0837 0.00488281C12.4508 0.00510456 12.7488 0.302789 12.7488 0.669922C12.7488 1.03705 12.4508 1.33474 12.0837 1.33496H7.91675C7.54948 1.33496 7.25171 1.03719 7.25171 0.669922C7.25171 0.302653 7.54948 0.00488281 7.91675 0.00488281H12.0837Z"
          ></path>
          <path
            opacity="0.2"
            d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"
          ></path>
        </svg>`,
    heavy: `
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          class="icon"
          aria-hidden="true"
        >
          <path
            d="M10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 7.24208 3.49633 4.81441 5.63281 3.39844C5.93895 3.19555 6.3518 3.27882 6.55469 3.58496C6.75745 3.89109 6.67328 4.30398 6.36719 4.50684C4.58671 5.68693 3.41504 7.70677 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C9.63273 3.41504 9.33496 3.11727 9.33496 2.75C9.33496 2.38273 9.63273 2.08496 10 2.08496ZM7.5 5.66992C7.93301 5.41993 10.5488 7.95095 11.2988 9.25C11.713 9.96741 11.4674 10.8846 10.75 11.2988C10.0326 11.713 9.11542 11.4673 8.70117 10.75C7.95118 9.45097 7.06701 5.91997 7.5 5.66992ZM12.084 0.00488281C12.451 0.00519055 12.749 0.302842 12.749 0.669922C12.749 1.037 12.451 1.33465 12.084 1.33496H7.91699C7.54972 1.33496 7.25195 1.03719 7.25195 0.669922C7.25195 0.302653 7.54972 0.00488281 7.91699 0.00488281H12.084Z"
          ></path>
          <path
            opacity="0.2"
            d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"
          ></path>
        </svg>`,
};

const THINKING_OPTION_ID_SET = new Set<ThinkingLevel>(
    THINKING_TIME_OPTIONS.map((option) => option.id),
);

export const initComposerController = (ctx: ComposerControllerContext): ComposerController => {
    const {
        state: STATE,
        emitStateChange,
        saveState: save,
        refreshControls,
        scheduleControlRefresh,
        setPaused,
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
        queueList,
        applyModelSelectionToEntry,
        setEntryThinkingOption,
        resolveQueueEntryThinkingLabel,
        addAttachmentsToEntry,
        getUserPlan,
    } = ctx;

    const resolveCurrentUserPlan = (): UserPlan => getUserPlan();
    const planAllowsThinkingLevel = (level: ThinkingLevel): boolean =>
        isThinkingLevelAvailableForPlan(resolveCurrentUserPlan(), level);

    let composerControlGroup: HTMLElement | null = null;
    let composerQueueButton: HTMLButtonElement | null = null;
    let composerHoldButton: HTMLButtonElement | null = null;
    let composerModelLabelButton: HTMLButtonElement | null = null;
    let composerModelLabelButtonValue: HTMLElement | null = null;
    let thinkingDropdown: HTMLElement | null = null;
    let thinkingDropdownAnchor: HTMLElement | null = null;
    let thinkingDropdownCleanup: Array<() => void> = [];
    const editorListenerCleanup: Array<() => void> = [];
    const debugSendEnabled = isDebugSendEnabled();

    const resolveComposerElements = (
        preferredRoot?: HTMLElement | Document | null,
    ): ComposerElements => {
        const root = (preferredRoot as HTMLElement | null | undefined) || composer();
        const searchRoot = (root as HTMLElement | Document | null) || document;

        return {
            root,
            editor: findEditor(),
            sendButton: findSendButton(searchRoot),
            stopButton: q<HTMLButtonElement>(SEL.stop, searchRoot),
            voiceButton: q<HTMLButtonElement>(SEL.voice, searchRoot),
        };
    };
    let composerModelSelectionPending = false;

    const normalizeThinkingOptionId = (value: unknown): ThinkingLevel | null => {
        if (typeof value !== "string") return null;
        const normalized = value.trim().toLowerCase();
        if (!THINKING_OPTION_ID_SET.has(normalized as ThinkingLevel)) return null;
        return normalized as ThinkingLevel;
    };

    const normalizeThinkingText = (value = "") => String(value || "").trim().toLowerCase();

    const THINKING_OPTION_LABEL_MAP: Record<ThinkingLevel, string> = THINKING_TIME_OPTIONS.reduce(
        (map, option) => {
            map[option.id] = normalizeThinkingText(option.label);
            return map;
        },
        {} as Record<ThinkingLevel, string>,
    );

    const resolveThinkingOptionFromText = (value = ""): ThinkingLevel | null => {
        const normalized = normalizeThinkingText(value);
        if (!normalized) return null;
        for (const [id, label] of Object.entries(THINKING_OPTION_LABEL_MAP)) {
            if (label && normalized.includes(label)) return id as ThinkingLevel;
        }
        return null;
    };

    const findThinkingChipButton = (): HTMLButtonElement | null => {
        const selector = "button.__composer-pill";
        const scopes: Array<Document | Element> = [];
        const root = composer();

        if (root) scopes.push(root);
        scopes.push(document);

        for (const scope of scopes) {
            const buttons = scope.querySelectorAll<HTMLButtonElement>(selector);
            for (const button of buttons) {
                if (!(button instanceof HTMLElement)) continue;

                const labelText =
                    button.getAttribute("aria-label") ||
                    button.getAttribute("title") ||
                    button.textContent ||
                    "";

                if (!normalizeThinkingText(labelText).includes("thinking")) {
                    continue;
                }

                if (!isVisible(button)) continue;

                return button;
            }
        }

        return null;
    };

    const getCurrentThinkingOption = () => {
        const button = findThinkingChipButton();
        if (!(button instanceof HTMLElement)) return null;
        const aria = button.getAttribute("aria-label") || "";
        let match = resolveThinkingOptionFromText(aria);
        if (match) {
            const normalized = normalizeThinkingOptionId(match);
            if (normalized && planAllowsThinkingLevel(normalized)) return normalized;
        }
        const title = button.getAttribute("title") || "";
        match = resolveThinkingOptionFromText(title);
        if (match) {
            const normalized = normalizeThinkingOptionId(match);
            if (normalized && planAllowsThinkingLevel(normalized)) return normalized;
        }
        const text = button.textContent || "";
        match = resolveThinkingOptionFromText(text);
        if (match) {
            const normalized = normalizeThinkingOptionId(match);
            if (normalized && planAllowsThinkingLevel(normalized)) return normalized;
        }
        return null;
    };

    const findThinkingMenuRoot = (): HTMLElement | null => {
        const menus = document.querySelectorAll("[role=\"menu\"][data-radix-menu-content]");
        for (const menu of menus) {
            if (!(menu instanceof HTMLElement)) continue;
            const heading = menu.querySelector(".__menu-label");
            const label = normalizeThinkingText(heading?.textContent || "");
            if (label === "thinking time") return menu;
        }
        return null;
    };

    const isThinkingMenuOpen = (): boolean => !!findThinkingMenuRoot();

    const waitForThinkingMenu = (timeoutMs = 1200): Promise<HTMLElement | null> =>
        new Promise<HTMLElement | null>((resolve) => {
            const start = performance.now();
            const tick = () => {
                const menu = findThinkingMenuRoot();
                if (menu) {
                    resolve(menu);
                    return;
                }
                if (performance.now() - start >= timeoutMs) {
                    resolve(null);
                    return;
                }
                requestAnimationFrame(tick);
            };
            tick();
        });

    const useThinkingMenu = async <T>(
        operation: (menu: HTMLElement, button: HTMLButtonElement) => Promise<T> | T,
    ): Promise<T | null> => {
        const button = findThinkingChipButton();
        if (!(button instanceof HTMLElement)) return null;
        const wasOpen = isThinkingMenuOpen();
        if (!wasOpen) {
            dispatchPointerAndMousePress(button);
        }
        const menu = wasOpen ? findThinkingMenuRoot() : await waitForThinkingMenu();
        if (!(menu instanceof HTMLElement)) {
            if (!wasOpen) button.click();
            return null;
        }
        let result: T | null = null;
        try {
            result = await operation(menu, button);
        } finally {
            if (!wasOpen && isThinkingMenuOpen()) {
                button.click();
            }
        }
        return result;
    };

    const findThinkingMenuItem = (
        menu: HTMLElement,
        optionId: ThinkingLevel,
    ): HTMLElement | null => {
        if (!(menu instanceof HTMLElement)) return null;
        const desired = THINKING_OPTION_LABEL_MAP[optionId];
        if (!desired) return null;
        const items = menu.querySelectorAll('[role="menuitemradio"]');
        for (const item of items) {
            if (!(item instanceof HTMLElement)) continue;
            const text = normalizeThinkingText(item.textContent || "");
            if (text === desired) return item;
        }
        return null;
    };

    const selectThinkingTimeOption = async (optionId: ThinkingLevel): Promise<boolean> => {
        if (!THINKING_OPTION_LABEL_MAP[optionId]) return false;
        if (!planAllowsThinkingLevel(optionId)) return false;
        const result = await useThinkingMenu(async (menu) => {
            const item = findThinkingMenuItem(menu, optionId);
            if (!item) return false;
            activateMenuItem(item);
            return true;
        });
        return !!result;
    };

    const setComposerModelSelectionBusy = (isBusy: boolean) => {
        if (!(composerModelLabelButton instanceof HTMLElement)) return;
        if (isBusy) {
            composerModelLabelButton.dataset.cqModelSelecting = "true";
            composerModelLabelButton.setAttribute("aria-busy", "true");
        } else {
            delete composerModelLabelButton.dataset.cqModelSelecting;
            composerModelLabelButton.removeAttribute("aria-busy");
        }
    };

    const handleComposerModelSelection = async (
        model: QueueModelDefinition | null,
    ): Promise<boolean> => {
        if (!model || !model.id || composerModelSelectionPending) return false;
        composerModelSelectionPending = true;
        modelMenuController.close();
        setComposerModelSelectionBusy(true);
        try {
            const applied = await ensureModel(model.id);
            if (!applied) {
                console.warn("[cq] Failed to switch model", model.id);
                return false;
            }
            markModelSelected(model.id, model.label || model.id);
            refreshControls();
            return true;
        } catch (error) {
            console.warn("[cq] Model switch encountered an error", error);
            return false;
        } finally {
            setComposerModelSelectionBusy(false);
            composerModelSelectionPending = false;
        }
    };

    const openComposerModelDropdown = async (): Promise<void> => {
        if (!(composerModelLabelButton instanceof HTMLElement)) return;
        await openModelDropdownForAnchor(composerModelLabelButton, {
            selectedModelId: getCurrentModelId(),
            onSelect: (model) => handleComposerModelSelection(model),
        });
    };

    const registerThinkingDropdownCleanup = (
        target: EventTarget | null | undefined,
        event: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
    ) => {
        if (!target || typeof target.addEventListener !== "function") return;
        target.addEventListener(event, handler, options);
        thinkingDropdownCleanup.push(() => {
            try {
                target.removeEventListener(event, handler, options);
            } catch (_) {
                /* noop */
            }
        });
    };

    const closeThinkingDropdown = () => {
        thinkingDropdownCleanup.forEach((cleanup) => {
            try {
                cleanup();
            } catch (_) {
                /* noop */
            }
        });
        thinkingDropdownCleanup = [];
        if (thinkingDropdown?.parentNode) {
            thinkingDropdown.parentNode.removeChild(thinkingDropdown);
        }
        if (thinkingDropdownAnchor instanceof HTMLElement) {
            thinkingDropdownAnchor.dataset.state = "closed";
            thinkingDropdownAnchor.setAttribute("aria-expanded", "false");
        }
        thinkingDropdown = null;
        thinkingDropdownAnchor = null;
    };

    const positionThinkingDropdown = () => {
        if (
            !thinkingDropdown ||
            !thinkingDropdownAnchor ||
            !document.body.contains(thinkingDropdownAnchor)
        ) {
            return;
        }
        const rect = thinkingDropdownAnchor.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        const dropdownRect = thinkingDropdown.getBoundingClientRect();
        const offset = 6;
        let top = rect.bottom + offset;
        let side = "bottom";
        if (top + dropdownRect.height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - dropdownRect.height - offset);
            side = "top";
        }
        let left = rect.left;
        const maxLeft = window.innerWidth - dropdownRect.width - 8;
        if (left > maxLeft) left = Math.max(8, maxLeft);
        if (left < 8) left = 8;
        thinkingDropdown.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        thinkingDropdown.style.setProperty(
            "--radix-popper-transform-origin",
            `${rect.width ? 0 : 0}% ${Math.round(rect.height / 2)}px`,
        );
        thinkingDropdown.style.setProperty(
            "--radix-popper-anchor-width",
            `${rect.width}px`,
        );
        thinkingDropdown.style.setProperty(
            "--radix-popper-anchor-height",
            `${rect.height}px`,
        );
        thinkingDropdown.style.setProperty(
            "--radix-popper-available-width",
            `${window.innerWidth}px`,
        );
        thinkingDropdown.style.setProperty(
            "--radix-popper-available-height",
            `${window.innerHeight}px`,
        );
        const menu = thinkingDropdown.querySelector("[data-radix-menu-content]");
        if (menu instanceof HTMLElement) {
            menu.dataset.side = side;
        }
    };

    const buildThinkingDropdown = (
        { selectedId = null, onSelect }: { selectedId?: string | null; onSelect?: (value: ThinkingLevel | null) => void } = {},
    ) => {
        const wrapper = document.createElement("div");
        wrapper.id = THINKING_DROPDOWN_ID;
        wrapper.dataset.radixPopperContentWrapper = "";
        wrapper.setAttribute("dir", "ltr");
        wrapper.style.position = "fixed";
        wrapper.style.left = "0px";
        wrapper.style.top = "0px";
        wrapper.style.transform = "translate(0px, 0px)";
        wrapper.style.minWidth = "max-content";
        wrapper.style.willChange = "transform";
        wrapper.style.zIndex = "50";
        wrapper.style.pointerEvents = "none";
        const menu = document.createElement("div");
        menu.dataset.radixMenuContent = "";
        menu.dataset.side = "bottom";
        menu.dataset.align = "start";
        menu.dataset.orientation = "vertical";
        menu.dataset.state = "open";
        menu.className =
            "z-50 max-w-xs rounded-2xl popover bg-token-main-surface-primary dark:bg-[#353535] shadow-long will-change-[opacity,transform] radix-side-bottom:animate-slideUpAndFade radix-side-left:animate-slideRightAndFade radix-side-right:animate-slideLeftAndFade radix-side-top:animate-slideDownAndFade py-1.5 data-[unbound-width]:min-w-[unset] data-[custom-padding]:py-0 [--trigger-width:calc(var(--radix-dropdown-menu-trigger-width)-2*var(--radix-align-offset))] min-w-(--trigger-width) max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto select-none";
        menu.setAttribute("dir", "ltr");
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-orientation", "vertical");
        menu.tabIndex = -1;
        menu.style.pointerEvents = "auto";
        menu.style.outline = "none";
        menu.style.setProperty("--radix-align-offset", "-8px");
        menu.style.setProperty(
            "--radix-dropdown-menu-content-transform-origin",
            "var(--radix-popper-transform-origin)",
        );
        const group = document.createElement("div");
        group.setAttribute("role", "group");
        const heading = document.createElement("div");
        heading.className = "__menu-label";
        heading.textContent = "Thinking time";
        group.appendChild(heading);
        let normalizedSelected =
            normalizeThinkingOptionId(selectedId) ||
            normalizeThinkingOptionId(getCurrentThinkingOption());
        const allowedOptions = THINKING_TIME_OPTIONS.filter((option) =>
            planAllowsThinkingLevel(option.id),
        );
        const optionsSource = allowedOptions.length ? allowedOptions : THINKING_TIME_OPTIONS;
        if (
            normalizedSelected &&
            !optionsSource.some((option) => option.id === normalizedSelected)
        ) {
            normalizedSelected = null;
        }
        const options = optionsSource.map((option) => ({
            id: option.id,
            label: option.label,
            icon: THINKING_OPTION_ICONS[option.id],
        }));
        options.forEach((option) => {
            const selected =
                normalizeThinkingOptionId(option.id) === normalizedSelected;
            const item = document.createElement("div");
            item.className = "group __menu-item hoverable";
            item.dataset.state = selected ? "checked" : "unchecked";
            item.dataset.orientation = "vertical";
            item.dataset.radixCollectionItem = "";
            item.setAttribute("role", "menuitemradio");
            item.setAttribute("aria-checked", selected ? "true" : "false");
            item.tabIndex = 0;
            const row = document.createElement("div");
            row.className = "flex min-w-0 items-center gap-1.5";
            const iconWrapper = document.createElement("div");
            iconWrapper.className =
                "flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon";
            iconWrapper.innerHTML = option.icon || "";
            row.appendChild(iconWrapper);
            const labelWrapper = document.createElement("div");
            labelWrapper.className =
                "flex min-w-0 grow items-center gap-2.5 group-data-no-contents-gap:gap-0";
            const label = document.createElement("div");
            label.className = "truncate";
            label.textContent = option.label;
            labelWrapper.appendChild(label);
            row.appendChild(labelWrapper);
            item.appendChild(row);
            const trailing = document.createElement("div");
            trailing.className = "trailing";
            if (selected) {
                const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                check.setAttribute("width", "16");
                check.setAttribute("height", "16");
                check.setAttribute("viewBox", "0 0 16 16");
                check.setAttribute("fill", "currentColor");
                check.classList.add("icon-sm");
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute(
                    "d",
                    "M12.0961 2.91371C12.3297 2.68688 12.6984 2.64794 12.9779 2.83852C13.2571 3.02905 13.3554 3.38601 13.2299 3.68618L13.1615 3.81118L6.91152 12.9772C6.79412 13.1494 6.60631 13.2604 6.39882 13.2799C6.19137 13.2994 5.98565 13.226 5.83828 13.0788L2.08828 9.32875L1.99843 9.2184C1.81921 8.94677 1.84928 8.57767 2.08828 8.33852C2.3274 8.0994 2.69648 8.06947 2.96816 8.24868L3.07851 8.33852L6.23085 11.4909L12.0053 3.02211L12.0961 2.91371Z",
                );
                check.appendChild(path);
                trailing.appendChild(check);
            } else {
                const placeholder = document.createElement("div");
                placeholder.className = "icon-sm group-radix-state-checked:hidden";
                trailing.appendChild(placeholder);
            }
            item.appendChild(trailing);
            const triggerSelection = (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelect?.(option.id);
            };
            item.addEventListener("click", triggerSelection);
            item.addEventListener("keydown", (event: KeyboardEvent) => {
                const key = event.key || "";
                if (key === "Enter" || key === " " || key === "Spacebar") {
                    triggerSelection(event);
                }
            });
            group.appendChild(item);
        });
        menu.appendChild(group);
        wrapper.appendChild(menu);
        return wrapper;
    };

    const openQueueEntryThinkingDropdown = (index: number, anchor: HTMLElement) => {
        if (!(anchor instanceof HTMLElement)) return;
        const entry = STATE.queue[index];
        if (!entry || !supportsThinkingForModel(entry.model, entry.modelLabel)) return;
        if (thinkingDropdown && thinkingDropdownAnchor === anchor) {
            closeThinkingDropdown();
            return;
        }
        closeThinkingDropdown();
        thinkingDropdownAnchor = anchor;
        anchor.dataset.state = "open";
        anchor.setAttribute("aria-expanded", "true");
        thinkingDropdown = buildThinkingDropdown({
            selectedId: entry.thinking,
            onSelect: (optionId) => {
                setEntryThinkingOption(index, optionId || "");
                closeThinkingDropdown();
            },
        });
        document.body.appendChild(thinkingDropdown);
        positionThinkingDropdown();
        const handleClickOutside = (event: Event) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (
                !thinkingDropdown ||
                thinkingDropdown.contains(target) ||
                anchor.contains(target)
            ) {
                return;
            }
            closeThinkingDropdown();
        };
        const handleEscape = (event: KeyboardEvent | Event) => {
            if (!(event instanceof KeyboardEvent)) return;
            if (event.key === "Escape") {
                event.preventDefault();
                closeThinkingDropdown();
                anchor.focus?.();
            }
        };
        const handleViewportChange = () => positionThinkingDropdown();
        registerThinkingDropdownCleanup(document, "mousedown", handleClickOutside, true);
        registerThinkingDropdownCleanup(document, "keydown", handleEscape, true);
        registerThinkingDropdownCleanup(window, "resize", handleViewportChange);
        registerThinkingDropdownCleanup(window, "scroll", handleViewportChange, true);
    };

    const createQueueEntryThinkingPill = (
        entry: QueueEntry | null | undefined,
        index: number,
    ): HTMLElement | null => {
        if (!entry) return null;
        if (!supportsThinkingForModel(entry.model, entry.modelLabel)) return null;
        const container = document.createElement("div");
        container.className = "__composer-pill-composite group relative";
        container.classList.add(UI_CLASS.rowThinking);
        container.dataset.entryIndex = String(index);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "__composer-pill-remove";
        removeBtn.classList.add(UI_CLASS.rowThinkingRemove);
        const removeLabel = resolveQueueEntryThinkingLabel(entry);
        removeBtn.setAttribute("aria-label", `${removeLabel}, click to remove`);
        removeBtn.innerHTML = `
            <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                class="icon-sm"
            >
                <path
                    d="M11.1152 3.91503C11.3868 3.73594 11.756 3.7658 11.9951 4.00488C12.2341 4.24395 12.264 4.61309 12.0849 4.88476L11.9951 4.99511L8.99018 7.99999L11.9951 11.0049L12.0849 11.1152C12.264 11.3869 12.2341 11.756 11.9951 11.9951C11.756 12.2342 11.3868 12.2641 11.1152 12.085L11.0048 11.9951L7.99995 8.99023L4.99506 11.9951C4.7217 12.2685 4.2782 12.2685 4.00483 11.9951C3.73146 11.7217 3.73146 11.2782 4.00483 11.0049L7.00971 7.99999L4.00483 4.99511L3.91499 4.88476C3.73589 4.61309 3.76575 4.24395 4.00483 4.00488C4.24391 3.7658 4.61305 3.73594 4.88471 3.91503L4.99506 4.00488L7.99995 7.00976L11.0048 4.00488L11.1152 3.91503Z"
                ></path>
            </svg>
        `;
        removeBtn.hidden = !entry.thinking;
        removeBtn.addEventListener("click", (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            setEntryThinkingOption(index, "");
            applyModelSelectionToEntry(index, { id: "auto", label: "Auto" });
        });
        const pillButton = document.createElement("button");
        pillButton.type = "button";
        pillButton.className = "__composer-pill group/pill";
        pillButton.classList.add(UI_CLASS.rowThinkingPill);
        pillButton.dataset.entryIndex = String(index);
        pillButton.dataset.state = "closed";
        pillButton.setAttribute("aria-haspopup", "menu");
        pillButton.setAttribute("aria-expanded", "false");
        pillButton.setAttribute(
            "aria-label",
            "Choose thinking level for this follow-up",
        );
        pillButton.title = "Choose thinking level";
        const icon = document.createElement("div");
        icon.className = "__composer-pill-icon";
        const iconId: ThinkingLevel =
            (entry.thinking || "extended") as ThinkingLevel;
        icon.innerHTML =
            THINKING_OPTION_ICONS[iconId] || THINKING_OPTION_ICONS.extended;
        const labelSpan = document.createElement("span");
        labelSpan.className = "max-w-40 truncate [[data-collapse-labels]_&]:sr-only";
        labelSpan.textContent = resolveQueueEntryThinkingLabel(entry);
        const caret = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        caret.setAttribute("width", "16");
        caret.setAttribute("height", "16");
        caret.setAttribute("viewBox", "0 0 16 16");
        caret.setAttribute("fill", "currentColor");
        caret.classList.add("icon-sm", "-me-0.5", "h-3.5", "w-3.5");
        const caretPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        caretPath.setAttribute(
            "d",
            "M12.1338 5.94433C12.3919 5.77382 12.7434 5.80202 12.9707 6.02929C13.1979 6.25656 13.2261 6.60807 13.0556 6.8662L12.9707 6.9707L8.47067 11.4707C8.21097 11.7304 7.78896 11.7304 7.52926 11.4707L3.02926 6.9707L2.9443 6.8662C2.77379 6.60807 2.80199 6.25656 3.02926 6.02929C3.25653 5.80202 3.60804 5.77382 3.86617 5.94433L3.97067 6.02929L7.99996 10.0586L12.0293 6.02929L12.1338 5.94433Z",
        );
        caret.appendChild(caretPath);
        pillButton.append(icon, labelSpan, caret);
        pillButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void openQueueEntryThinkingDropdown(index, pillButton);
        });
        container.append(removeBtn, pillButton);
        return container;
    };

    const mountComposerModelLabelBeforeDictate = (root: ParentNode | null): boolean => {
        if (!composerModelLabelButton) return false;
        if (!root || typeof (root as ParentNode).querySelector !== "function") {
            return false;
        }
        const dictateButton = (root as ParentNode).querySelector(
            'button[aria-label="Dictate button"]',
        );
        if (!(dictateButton instanceof HTMLElement)) return false;
        const dictateWrapper = dictateButton.closest("span") || dictateButton;
        if (!(dictateWrapper instanceof HTMLElement)) return false;
        const host = dictateWrapper.parentElement;
        if (!(host instanceof HTMLElement)) return false;
        if (
            composerModelLabelButton.parentElement === host &&
            composerModelLabelButton.nextSibling === dictateWrapper
        ) {
            return true;
        }
        host.insertBefore(composerModelLabelButton, dictateWrapper);
        return true;
    };

    const mountComposerModelLabelInControls = () => {
        if (!composerModelLabelButton || !composerControlGroup) return false;
        let beforeNode = composerHoldButton || composerControlGroup.firstChild;
        if (
            beforeNode &&
            beforeNode.parentElement !== composerControlGroup
        ) {
            beforeNode = composerControlGroup.firstChild;
        }
        if (
            composerModelLabelButton.parentElement === composerControlGroup &&
            ((beforeNode &&
                composerModelLabelButton.nextSibling === beforeNode) ||
                (!beforeNode &&
                    composerModelLabelButton === composerControlGroup.firstChild))
        ) {
            return true;
        }
        composerControlGroup.insertBefore(
            composerModelLabelButton,
            beforeNode || null,
        );
        return true;
    };

    const deriveQueueButtonClasses = (_sendButton: HTMLElement | null) => {

        const baseTokens = new Set<string>([
            UI_CLASS.composerQueueButton,
            "relative",
            "flex",
            "items-center",
            "justify-center",
            "h-9",
            "w-9",
            "rounded-full",
            "composer-secondary-button-color",
            "disabled:text-gray-50",
            "disabled:opacity-30",
        ]);

        return Array.from(baseTokens).join(" ");
    };

    const refreshComposerModelLabelButton = () => {
        if (!(composerModelLabelButton instanceof HTMLElement)) return;
        if (
            composerModelLabelButtonValue &&
            !composerModelLabelButton.contains(composerModelLabelButtonValue)
        ) {
            composerModelLabelButtonValue = null;
        }
        if (!composerModelLabelButtonValue) {
            composerModelLabelButtonValue =
                composerModelLabelButton.querySelector(
                    `.${UI_CLASS.modelButtonValue}`,
                );
        }
        const label = labelForModel(
            getCurrentModelId(),
            getCurrentModelLabel() || getCurrentModelId() || "Select model",
        );
        if (composerModelLabelButtonValue) {
            composerModelLabelButtonValue.textContent = label;
        }
        const tooltip = `Show available models. Current: ${label}`;
        composerModelLabelButton.setAttribute("aria-label", tooltip);
        composerModelLabelButton.title = tooltip;
    };

    const ensureComposerControls = (rootParam?: HTMLElement | Document | null) => {
        const { root, sendButton, voiceButton } = resolveComposerElements(rootParam);
        if (!root) return;
        const SPEECH_BUTTON_CONTAINER_SELECTOR =
            '[data-testid="composer-speech-button-container"]';

        const resolveAnchor = (
            node: Element | null,
        ): { anchor: HTMLElement | null; parent: HTMLElement | null } => {
            if (!(node instanceof HTMLElement)) {
                return { anchor: null, parent: null };
            }
            let anchorRef = node;
            let parentRef = node.parentElement;
            if (
                parentRef instanceof HTMLElement &&
                parentRef.tagName === "SPAN" &&
                parentRef.parentElement instanceof HTMLElement
            ) {
                anchorRef = parentRef;
                parentRef = parentRef.parentElement;
            }
            if (!(parentRef instanceof HTMLElement)) {
                parentRef = anchorRef.closest(
                    '[data-testid="composer-actions"], [data-testid="composer-toolbar"], [data-testid="composer-bottom-buttons"], [data-testid="composer-controls"]',
                );
            }
            return {
                anchor: anchorRef instanceof HTMLElement ? anchorRef : null,
                parent: parentRef instanceof HTMLElement ? parentRef : null,
            };
        };

        let { anchor, parent } = resolveAnchor(sendButton);
        if (!parent) {
            ({ anchor, parent } = resolveAnchor(voiceButton));
        }

        const promoteSpeechContainerParent = () => {
            const speechContainer =
                (anchor instanceof HTMLElement &&
                    anchor.closest(SPEECH_BUTTON_CONTAINER_SELECTOR)) ||
                (parent instanceof HTMLElement &&
                    parent.closest(SPEECH_BUTTON_CONTAINER_SELECTOR));
            if (
                speechContainer instanceof HTMLElement &&
                speechContainer.parentElement instanceof HTMLElement
            ) {
                anchor = speechContainer;
                parent = speechContainer.parentElement;
            }
        };

        promoteSpeechContainerParent();
        if (!parent) {
            const candidate = root.querySelector(
                `${SPEECH_BUTTON_CONTAINER_SELECTOR}, [data-testid="composer-actions"], [data-testid="composer-toolbar"], [data-testid="composer-bottom-buttons"], [data-testid="composer-controls"]`,
            );
            if (candidate instanceof HTMLElement) {
                parent = candidate;
                anchor =
                    Array.from(candidate.children).find(
                        (node) => node instanceof HTMLElement,
                    ) || null;
            }
        }

        promoteSpeechContainerParent();

        const parentIsFlexRow = (element: HTMLElement | null) => {

            if (!(element instanceof HTMLElement)) return false;

            const style = window.getComputedStyle(element);

            return (
                style.display === "flex" &&
                style.flexDirection !== "column" &&
                style.flexDirection !== "column-reverse"
            );

        };

        const promoteToNearestFlexRowParent = () => {

            if (!(anchor instanceof HTMLElement)) return;

            if (parentIsFlexRow(parent)) return;

            let candidate = anchor.parentElement;

            while (candidate instanceof HTMLElement) {

                if (parentIsFlexRow(candidate)) {
                    let directChild: HTMLElement | null = anchor;

                    while (
                        directChild &&
                        directChild.parentElement instanceof HTMLElement &&
                        directChild.parentElement !== candidate
                    ) {
                        directChild = directChild.parentElement;
                    }

                    if (directChild && directChild.parentElement === candidate) {
                        parent = candidate;
                        anchor = directChild;
                    }

                    return;
                }

                if (candidate === root) break;

                candidate = candidate.parentElement;
            }

        };

        promoteToNearestFlexRowParent();

        if (!(parent instanceof HTMLElement)) return;
        if (!composerControlGroup || !composerControlGroup.isConnected) {
            composerControlGroup = document.createElement("div");
            composerControlGroup.id = "cq-composer-controls";
            composerControlGroup.className = UI_CLASS.composerControls;
            composerControlGroup.hidden = true;
        }

        if (!composerQueueButton) {
            const queueBtn = document.createElement("button");
            queueBtn.type = "button";
            queueBtn.id = "cq-composer-queue-btn";
            queueBtn.setAttribute(
                "aria-label",
                "Add prompt to follow-up queue",
            );
            queueBtn.title = "Add to queue";
            queueBtn.innerHTML = `
        <span class="${UI_CLASS.composerQueueButtonIcon}" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="6" width="14" height="2" rx="1"></rect>
            <rect x="3" y="11" width="14" height="2" rx="1"></rect>
            <rect x="3" y="16" width="10" height="2" rx="1"></rect>
            <rect x="18" y="13" width="2" height="8" rx="1"></rect>
            <rect x="15" y="16" width="8" height="2" rx="1"></rect>
          </svg>
        </span>`;
            queueBtn.addEventListener("click", (event) => {
                event.preventDefault();
                void queueFromComposer();
            });
            composerQueueButton = queueBtn;
        }

        if (!composerHoldButton) {
            const pauseBtn = document.createElement("button");
            pauseBtn.type = "button";
            pauseBtn.id = "cq-composer-hold-btn";
            pauseBtn.className = UI_CLASS.composerHoldButton;
            pauseBtn.setAttribute(
                "aria-label",
                "Add to queue and pause queue",
            );
            pauseBtn.title = "Add to queue and pause";
            pauseBtn.innerHTML = `
        <span class="${UI_CLASS.composerHoldButtonIcon}" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="6" width="12" height="2" rx="1"></rect>
            <rect x="3" y="11" width="14" height="2" rx="1"></rect>
            <rect x="3" y="16" width="10" height="2" rx="1"></rect>
            <rect x="18" y="13" width="2" height="8" rx="1"></rect>
            <rect x="15" y="16" width="8" height="2" rx="1"></rect>
            <rect x="16" y="2" width="2" height="7" rx="1"></rect>
            <rect x="20" y="2" width="2" height="7" rx="1"></rect>
          </svg>
        </span>`;
            pauseBtn.addEventListener("click", (event) => {
                event.preventDefault();
                void queueFromComposer({ hold: true });
            });
            pauseBtn.hidden = true;
            composerHoldButton = pauseBtn;
        }

        if (!composerModelLabelButton) {
            const button = document.createElement("button");
            button.type = "button";
            button.id = "cq-composer-models-btn";
            button.className = UI_CLASS.modelButton;
            const value = document.createElement("span");
            value.className = UI_CLASS.modelButtonValue;
            value.textContent = labelForModel(
                getCurrentModelId(),
                getCurrentModelLabel() || "Select model",
            );
            button.append(value);
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                void openComposerModelDropdown();
            });
            composerModelLabelButton = button;
            composerModelLabelButtonValue = value;
            refreshComposerModelLabelButton();
        }

        const classSource =
            (sendButton instanceof HTMLElement && sendButton) ||
            (voiceButton instanceof HTMLElement && voiceButton) ||
            (anchor instanceof HTMLElement ? anchor : null);
        const sharedClasses = deriveQueueButtonClasses(classSource);
        composerQueueButton.className = sharedClasses;
        composerHoldButton.className = `${sharedClasses} ${UI_CLASS.composerHoldButton}`;

        if (
            !mountComposerModelLabelBeforeDictate(root) &&
            mountComposerModelLabelInControls()
        ) {
            /* noop */
        }
        if (!composerControlGroup.contains(composerHoldButton)) {
            composerControlGroup.appendChild(composerHoldButton);
        }
        if (!composerControlGroup.contains(composerQueueButton)) {
            composerControlGroup.appendChild(composerQueueButton);
        }

        try {
            if (
                composerControlGroup.parentElement !== parent ||
                (anchor instanceof HTMLElement &&
                    composerControlGroup.nextElementSibling !== anchor)
            ) {
                if (anchor instanceof HTMLElement && parent.contains(anchor)) {
                    parent.insertBefore(composerControlGroup, anchor);
                } else {
                    parent.appendChild(composerControlGroup);
                }
            }
        } catch (_) {
            try {
                parent.appendChild(composerControlGroup);
            } catch (_) {
                /* noop */
            }
        }
    };

    const ensureComposerInputListeners = (rootParam?: HTMLElement | Document | null) => {
        const { editor } = resolveComposerElements(rootParam);
        if (!(editor instanceof HTMLElement)) return;
        if (editor.dataset.cqQueueBound === "true") return;
        const notify = () => scheduleControlRefresh();
        ["input", "keyup", "paste", "cut", "compositionend"].forEach(
            (eventName) => {
                editor.addEventListener(eventName, notify);
                editorListenerCleanup.push(() => {
                    try {
                        editor.removeEventListener(eventName, notify);
                    } catch (_) {
                        /* noop */
                    }
                });
            },
        );
        editor.dataset.cqQueueBound = "true";
    };

    const refreshComposerButtonsState = (
        { promptHasContent, hasQueueItems }: { promptHasContent: boolean; hasQueueItems: boolean },
    ) => {

        if (composerControlGroup) {
            composerControlGroup.hidden = false;
        }
        if (composerQueueButton) {
            composerQueueButton.disabled = !promptHasContent;
        }
        if (composerHoldButton) {
            const showHold = !hasQueueItems;
            composerHoldButton.hidden = !showHold;
            composerHoldButton.disabled = !promptHasContent;
        }
    };

    const setPrompt = (text: string): Promise<boolean> =>
        new Promise((resolve) => {
            const onMsg = (e: MessageEvent) => {
                if (e.source === window && e.data && e.data.type === "CQ_SET_PROMPT_DONE") {
                    window.removeEventListener("message", onMsg);
                    resolve(true);
                }
            };
            window.addEventListener("message", onMsg);
            window.postMessage({ type: "CQ_SET_PROMPT", text }, "*");

            setTimeout(() => {
                window.removeEventListener("message", onMsg);
                resolve(false);
            }, 1500);
        });

    const clickStop = () => {
        const button = q(SEL.stop, composer());
        if (button) button.click();
    };

    const clickSend = () => {
        const button = q(SEL.send, composer());
        if (button) button.click();
    };

    const waitUntilIdle = (timeoutMs = 120000) => {
        const root = composer();
        if (!root) return Promise.resolve(false);

        return new Promise<boolean>((resolve) => {
            let finished = false;
            let observer: MutationObserver | null = null;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const done = () => {
                if (finished) return;
                finished = true;
                observer?.disconnect();
                if (timer) clearTimeout(timer);
                setTimeout(() => resolve(true), STATE.cooldownMs);
            };
            const isIdle = () => {
                const stopBtn = q<HTMLButtonElement>(SEL.stop, root);
                if (stopBtn && !stopBtn.disabled && stopBtn.offsetParent !== null) return false;
                const sendBtn = q<HTMLButtonElement>(SEL.send, root);
                if (sendBtn && !sendBtn.disabled && sendBtn.offsetParent !== null) return true;
                const voiceBtn = q<HTMLButtonElement>(SEL.voice, root);
                if (voiceBtn && !voiceBtn.disabled && voiceBtn.offsetParent !== null) return true;
                return false;
            };
            observer = new MutationObserver(() => {
                if (isIdle()) done();
            });
            observer.observe(root, {
                subtree: true,
                childList: true,
                attributes: true,
            });
            if (isIdle()) {
                done();
                return;
            }
            timer = setTimeout(() => {
                if (finished) return;
                observer?.disconnect();
                resolve(false);
            }, timeoutMs);
        });
    };

    const waitForSendReady = async (timeoutMs = 5000) => {
        const start = performance.now();
        while (performance.now() - start < timeoutMs) {
            const root = composer();
            if (root) {
                const button = findSendButton(root);
                if (
                    button &&
                    !button.disabled &&
                    button.getAttribute("aria-disabled") !== "true"
                ) {
                    return true;
                }
            }
            await sleep(60);
        }
        return false;
    };

    const waitForSendLaunch = async (timeoutMs = 8000) => {
        const start = performance.now();
        while (performance.now() - start < timeoutMs) {
            if (isGenerating()) return true;
            const root = composer();
            if (!root) {
                await sleep(60);
                continue;
            }
            const button = findSendButton(root);
            if (!button) return true;
            if (button.disabled || button.getAttribute("aria-disabled") === "true") {
                return true;
            }
            await sleep(60);
        }
        return false;
    };

    const restoreEntryAfterSendFailure = (
        index: number,
        entry: QueueEntry,
        stage: string,
    ) => {
        if (!entry) return;
        STATE.busy = false;
        STATE.phase = "idle";
        STATE.queue.splice(index, 0, entry);
        emitStateChange("queue:send-error", { index, stage });
        save();
    };

    const getComposerPromptText = () => {
        const ed = findEditor();
        if (!ed) return "";
        const text = ed.innerText || "";
        return text.replace(/[\u200b\u200c\u200d\uFEFF]/g, "").trim();
    };

    const composerHasAttachments = () => {
        const root = composer();
        if (!root) return false;
        return countComposerAttachments(root) > 0;
    };

    const hasComposerPrompt = () => {
        return getComposerPromptText().length > 0 || composerHasAttachments();
    };

    const queueComposerInput = async () => {
        const ed = findEditor();
        if (!ed) return false;
        const root = composer();
        if (!root) return false;
        const text = getComposerPromptText();
        const attachmentCount = countComposerAttachments(root);
        const attachments = await gatherComposerAttachments(root);
        if (!text && attachments.length === 0) return false;
        if (attachmentCount > 0 && attachments.length === 0) {
            console.warn("[cq] Unable to capture composer attachments; queue aborted.");
            return false;
        }
        const modelId = getCurrentModelId();
        const modelLabelBase = getCurrentModelLabel();
        const modelLabel = modelId ? labelForModel(modelId, modelLabelBase) : null;
        const thinking =
            modelId &&
            supportsThinkingForModel(modelId, modelLabel || modelLabelBase)
                ? getCurrentThinkingOption()
                : null;

        const entryIndex = enqueueQueueEntry(STATE, {
            text,
            attachments: attachments.map((attachment) => cloneAttachment(attachment)),
            model: modelId,
            modelLabel,
            thinking,
        });

        if (attachments.length) {
            clearComposerAttachments(root);
        }
        ed.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
        ed.dispatchEvent(new Event("input", { bubbles: true }));
        save();
        emitStateChange("queue:enqueue", { index: entryIndex });
        requestAnimationFrame(() => {
            queueList?.scrollTo?.({ top: queueList.scrollHeight });
        });
        ed.focus?.({ preventScroll: true });
        scheduleControlRefresh();
        return true;
    };

    const queueFromComposer = async ({ hold = false } = {}) => {
        const added = await queueComposerInput();
        if (!added) return false;
        if (hold) setPaused(true);
        return true;
    };

    const debugSendFailure = (stage: string) => {
        if (debugSendEnabled) {
            console.warn(`[cq][sendFromQueue] failed at ${stage}`);
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
        const dataTransfer = event.clipboardData;
        if (!hasImagesInDataTransfer(dataTransfer)) return;
        event.preventDefault();
        const plain = dataTransfer?.getData?.("text/plain") || "";
        if (plain && textarea) {
            const { selectionStart, selectionEnd, value } = textarea;
            const before = value.slice(0, selectionStart);
            const after = value.slice(selectionEnd);
            const nextValue = `${before}${plain}${after}`;
            const cursor = before.length + plain.length;
            textarea.value = nextValue;
            textarea.selectionStart = cursor;
            textarea.selectionEnd = cursor;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        }
        collectImagesFromDataTransfer(dataTransfer)
            .then((attachments) => {
                if (!attachments.length) return;
                if (type === "entry" && typeof index === "number") {
                    addAttachmentsToEntry(index, attachments);
                }
            })
            .catch(() => {});
    };

    const sendFromQueue = async (
        index: number,
        { allowWhilePaused = false }: { allowWhilePaused?: boolean } = {},
    ) => {
        if (STATE.busy) {
            debugSendFailure("busy");
            return false;
        }
        if (STATE.paused && !allowWhilePaused) {
            debugSendFailure("paused");
            return false;
        }
        if (STATE.queue.length === 0) {
            debugSendFailure("empty");
            return false;
        }

        if (isGenerating()) {
            clickStop();
            await waitUntilIdle();
        }

        const root = composer();
        if (!root) {
            debugSendFailure("root");
            return false;
        }

        const entry = STATE.queue[index];
        if (!entry) {
            debugSendFailure("entry");
            return false;
        }
        const promptText = typeof entry.text === "string" ? entry.text : "";
        const attachments = Array.isArray(entry.attachments)
            ? entry.attachments.slice()
            : [];
        const desiredModel = entry.model || null;
        const baseModelId = getCurrentModelId();
        const baseModelLabel = getCurrentModelLabel();
        const targetModelId = desiredModel || baseModelId;
        const targetModelLabel = desiredModel
            ? entry.modelLabel || labelForModel(desiredModel, desiredModel)
            : labelForModel(baseModelId, baseModelLabel);
        const desiredThinking =
            entry.thinking &&
            supportsThinkingForModel(targetModelId, targetModelLabel)
                ? entry.thinking
                : null;

        const [removed] = STATE.queue.splice(index, 1);
        STATE.busy = true;
        STATE.phase = "sending";
        save();
        emitStateChange("queue:send-start", { index });

        if (desiredModel) {
            const modelApplied = await ensureModel(desiredModel);
            if (!modelApplied) {
                restoreEntryAfterSendFailure(index, removed, "model");
                debugSendFailure("model");
                return false;
            }
        }

        if (desiredThinking) {
            const thinkingApplied = await selectThinkingTimeOption(desiredThinking);
            if (!thinkingApplied) {
                restoreEntryAfterSendFailure(index, removed, "thinking");
                debugSendFailure("thinking");
                return false;
            }
        }

        const textSet = await setPrompt(promptText);
        if (!textSet) {
            restoreEntryAfterSendFailure(index, removed, "prompt");
            debugSendFailure("prompt");
            return false;
        }

        const attachmentsApplied = await applyAttachmentsToComposer(
            root,
            attachments,
        );
        if (!attachmentsApplied) {
            restoreEntryAfterSendFailure(index, removed, "attachments");
            debugSendFailure("attachments");
            return false;
        }

        const readyToSend = await waitForSendReady();
        if (!readyToSend) {
            restoreEntryAfterSendFailure(index, removed, "ready");
            debugSendFailure("ready");
            return false;
        }

        clickSend();
        STATE.phase = "waiting";
        refreshControls();

        const launched = await waitForSendLaunch();
        if (!launched) {
            restoreEntryAfterSendFailure(index, removed, "launch");
            debugSendFailure("launch");
            return false;
        }

        await waitUntilIdle();

        STATE.busy = false;
        STATE.phase = "idle";
        emitStateChange("queue:send-complete", { index });
        refreshControls();
        save();
        return true;
    };

    const dispose = () => {
        closeThinkingDropdown();
        editorListenerCleanup.splice(0).forEach((cleanup) => {
            try {
                cleanup();
            } catch (_) {
                /* noop */
            }
        });
        if (composerControlGroup?.parentElement) {
            composerControlGroup.parentElement.removeChild(composerControlGroup);
        }
    };

    return {
        ensureComposerControls,
        ensureComposerInputListeners,
        refreshComposerModelLabelButton,
        hasComposerPrompt,
        getComposerPromptText,
        composerHasAttachments,
        queueComposerInput,
        queueFromComposer,
        sendFromQueue,
        getCurrentThinkingOption,
        selectThinkingTimeOption,
        handleComposerModelSelection,
        openComposerModelDropdown,
        waitUntilIdle,
        waitForSendReady,
        waitForSendLaunch,
        clickSend,
        clickStop,
        createQueueEntryThinkingPill,
        handleAttachmentPaste,
        updateComposerControlsState: refreshComposerButtonsState,
        closeThinkingDropdown,
        dispose,
    };
};
