import { CQ_SELECTORS } from "./dom-adapters";
import type { QueueState } from "../lib/state";
import type { QueueStateChangeReason } from "../lib/state/events";
import type {
    KeyboardShortcutEntry,
    QueueModelDefinition,
    ShortcutKeyToken,
    ThinkingLevel,
    ThinkingOption,
} from "../lib/types";
import {
    isModelAvailableForPlan,
    type UserPlan,
} from "../lib/constants/models";

export interface ShortcutContext {
    state: QueueState;
    isApplePlatform: boolean;
    modelShortcutOrder: string[];
    thinkingOptions: ThinkingOption[];
    userPlan: UserPlan;
    getQueueRows(): HTMLElement[];
    focusQueueRow(row: HTMLElement): boolean;
    focusComposerEditor(): boolean;
    getComposerNode(): HTMLElement | null;
    togglePaused(): void;
    setCollapsed(collapsed: boolean): void;
    openModelSwitcherDropdown(): boolean;
    dedupeModelsForDisplay(models: QueueModelDefinition[]): QueueModelDefinition[];
    resolveModelOrder(model: QueueModelDefinition): number;
    handleComposerModelSelection(
        model: QueueModelDefinition | null,
    ): Promise<boolean> | boolean;
    selectThinkingTimeOption(optionId: ThinkingLevel): Promise<boolean> | boolean;
    emitStateChange(
        reason?: QueueStateChangeReason,
        detail?: Record<string, unknown>,
    ): void;
    scheduleControlRefresh(): void;
    queueFromComposer(options?: { hold?: boolean }): boolean | Promise<boolean>;
    queueComposerInput(): Promise<boolean> | boolean;
}

export interface ShortcutController {
    refreshPopover(): void;
    refreshPopoverBurst(): void;
    dispose(): void;
}

export const initShortcuts = (ctx: ShortcutContext): ShortcutController => {
    const KEYBOARD_SHORTCUT_SECTION_LABEL = "Queue, models & thinking";
    const SHORTCUT_POPOVER_REFRESH_DELAYS = [0, 160, 360, 640];

    const resolveAvailableModels = (): QueueModelDefinition[] =>
        ctx
            .dedupeModelsForDisplay([...ctx.state.models])
            .filter((model) => isModelAvailableForPlan(model, ctx.userPlan))
            .sort((a, b) => ctx.resolveModelOrder(a) - ctx.resolveModelOrder(b));

    const resolveModelShortcutKeys = (): string[] => {
        const availableCount = resolveAvailableModels().length;
        if (availableCount <= 0) return [];
        return ctx.modelShortcutOrder.slice(0, availableCount);
    };

    const modelShortcutKeys = resolveModelShortcutKeys();

    const MODEL_SHORTCUT_ENTRIES: KeyboardShortcutEntry[] = modelShortcutKeys.map((key, index) => {
        const number = key === "0" ? 10 : index + 1;
        const label = `Select model ${number}`;
        const macKeys: ShortcutKeyToken[] = ["command", "option", key];
        const otherKeys: ShortcutKeyToken[] = ["control", "alt", key];
        return {
            id: `model-select-${number}`,
            label,
            macKeys,
            otherKeys,
        };
    });

    const THINKING_SHORTCUT_ENTRIES: KeyboardShortcutEntry[] = ctx.thinkingOptions.map((option) => ({
        id: `thinking-${option.id}`,
        label: `Set thinking time: ${option.label}`,
        macKeys: ["command", "control", option.digit || ""] as ShortcutKeyToken[],
        otherKeys: ["control", "alt", option.digit || ""] as ShortcutKeyToken[],
    }));

    const KEYBOARD_SHORTCUT_ENTRIES: KeyboardShortcutEntry[] = [
        {
            id: "queue-add",
            label: "Queue current input",
            macKeys: ["option", "enter"],
            otherKeys: ["alt", "enter"],
        },
        {
            id: "queue-hold",
            label: "Queue input & pause",
            macKeys: ["option", "command", "enter"],
            otherKeys: ["alt", "control", "enter"],
        },
        {
            id: "queue-pause",
            label: "Pause/resume queue",
            macKeys: ["shift", "command", "p"],
            otherKeys: ["shift", "control", "p"],
        },
        {
            id: "queue-collapse",
            label: "Toggle queue list",
            macKeys: ["shift", "command", "."],
            otherKeys: ["shift", "control", "."],
        },
        {
            id: "queue-focus-prev",
            label: "Focus previous follow-up",
            macKeys: ["option", "arrowup"],
            otherKeys: ["alt", "arrowup"],
        },
        {
            id: "queue-focus-next",
            label: "Focus next follow-up",
            macKeys: ["option", "arrowdown"],
            otherKeys: ["alt", "arrowdown"],
        },
        {
            id: "queue-send-focused",
            label: "Send focused follow-up",
            macKeys: ["enter"],
            otherKeys: ["enter"],
        },
        {
            id: "queue-delete-focused",
            label: "Delete focused follow-up",
            macKeys: ["shift", "delete"],
            otherKeys: ["shift", "delete"],
        },
        {
            id: "queue-delete-focused-skip",
            label: "Delete focused follow-up (no confirmation)",
            macKeys: ["option", "shift", "delete"],
            otherKeys: ["alt", "shift", "delete"],
        },
        ...MODEL_SHORTCUT_ENTRIES,
        ...THINKING_SHORTCUT_ENTRIES,
    ];

    const KEY_DISPLAY_MAP: Record<string, { glyph: string; aria: string }> = {
        option: { glyph: "⌥", aria: "Option" },
        command: { glyph: "⌘", aria: "Command" },
        meta: { glyph: "⌘", aria: "Command" },
        shift: { glyph: "⇧", aria: "Shift" },
        control: { glyph: ctx.isApplePlatform ? "⌃" : "Ctrl", aria: "Control" },
        ctrl: { glyph: ctx.isApplePlatform ? "⌃" : "Ctrl", aria: "Control" },
        alt: { glyph: "Alt", aria: "Alt" },
        enter: { glyph: "⏎", aria: "Enter" },
        return: { glyph: "⏎", aria: "Return" },
        delete: { glyph: "⌫", aria: "Delete" },
        p: { glyph: "P", aria: "P" },
        period: { glyph: ".", aria: "Period" },
        arrowup: { glyph: "↑", aria: "Arrow Up" },
        arrowdown: { glyph: "↓", aria: "Arrow Down" },
    };

    const resolveShortcutKeys = (entry: KeyboardShortcutEntry): ShortcutKeyToken[] => {
        const keys = ctx.isApplePlatform ? entry.macKeys : entry.otherKeys;
        return Array.isArray(keys) && keys.length ? [...keys] : [];
    };

    const resolveKeyDisplay = (token: ShortcutKeyToken) => {
        if (typeof token !== "string") {
            return { glyph: "?", aria: "Key" };
        }

        const normalized = token.toLowerCase();

        if (KEY_DISPLAY_MAP[normalized]) {
            return KEY_DISPLAY_MAP[normalized];
        }

        const label = token.length === 1 ? token.toUpperCase() : token;

        return { glyph: label, aria: label };
    };

    function buildShortcutKeyGroup(tokens: ShortcutKeyToken[]): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.className =
            "inline-flex whitespace-pre *:inline-flex *:font-sans";
        tokens.forEach((token) => {
            const { glyph, aria } = resolveKeyDisplay(token);
            const kbd = document.createElement("kbd");

            if (aria) kbd.setAttribute("aria-label", aria);

            const span = document.createElement("span");
            span.className = "min-w-[1em]";
            span.textContent = glyph;
            kbd.appendChild(span);
            wrapper.appendChild(kbd);
        });
        return wrapper;
    }

    function widenShortcutPopover(list: HTMLDListElement | null) {
        if (!(list instanceof HTMLDListElement)) return;
        const popover = list.closest(".popover");
        if (!(popover instanceof HTMLElement)) return;
        if (popover.dataset.cqShortcutWide === "true") return;
        const available = Math.max(320, window.innerWidth - 24);
        if (available < 420) return;
        popover.dataset.cqShortcutWide = "true";
        const widthExpr = "min(880px, calc(100vw - 48px))";
        popover.style.maxWidth = widthExpr;
        popover.style.width = widthExpr;
    }

    function ensureShortcutColumns(list: HTMLDListElement): HTMLDivElement | null {
        if (!(list instanceof HTMLDListElement)) return null;
        const popover = list.closest(".popover");
        if (!(popover instanceof HTMLElement)) return null;
        let wrapper = popover.querySelector<HTMLElement>("[data-cq-shortcut-wrapper]");
        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.dataset.cqShortcutWrapper = "true";
            wrapper.style.display = "grid";
            wrapper.style.gridTemplateColumns =
                "minmax(0, 1fr) minmax(0, 1.6fr)";
            wrapper.style.gap = "0 24px";
            wrapper.style.width = "100%";
            wrapper.style.alignItems = "start";
            const parent = list.parentElement;
            if (parent) {
                parent.insertBefore(wrapper, list);
            }
            wrapper.appendChild(list);
        } else if (list.parentElement !== wrapper) {
            wrapper.appendChild(list);
        }
        list.style.gridColumn = "1 / 2";
        list.style.width = "100%";
        list.style.margin = "0";
        let queueColumn = wrapper.querySelector<HTMLDivElement>("[data-cq-queue-column]");
        if (!queueColumn) {
            queueColumn = document.createElement("div") as HTMLDivElement;
            queueColumn.dataset.cqQueueColumn = "true";
            queueColumn.style.gridColumn = "2 / 3";
            queueColumn.style.width = "100%";
            queueColumn.style.alignSelf = "end";
            queueColumn.style.display = "flex";
            queueColumn.style.flexDirection = "column";
            queueColumn.style.gap = "12px";
            queueColumn.style.paddingRight = "10px";
            queueColumn.style.paddingBottom = "8px";
            wrapper.appendChild(queueColumn);
        }
        return queueColumn;
    }

    function injectQueueShortcutsIntoList(list: HTMLDListElement | null) {
        if (!(list instanceof HTMLDListElement)) return;
        const shortcuts = KEYBOARD_SHORTCUT_ENTRIES.map((entry) => ({
            id: entry.id,
            label: entry.label,
            keys: resolveShortcutKeys(entry),
        })).filter((entry) => entry.keys.length > 0);
        if (!shortcuts.length) return;
        widenShortcutPopover(list);
        const queueColumn = ensureShortcutColumns(list);
        if (!queueColumn) return;
        if (queueColumn.dataset.cqShortcutPopulated === "true") return;
        queueColumn.dataset.cqShortcutPopulated = "true";
        queueColumn.textContent = "";
        const heading = document.createElement("div");
        heading.dataset.cqShortcutOrigin = "queue";
        heading.textContent = KEYBOARD_SHORTCUT_SECTION_LABEL;
        heading.className = "text-token-text-tertiary uppercase text-xs";
        heading.style.letterSpacing = "0.08em";
        heading.style.marginTop = "8px";
        heading.style.marginBottom = "8px";
        queueColumn.appendChild(heading);
        const grid = document.createElement("div");
        grid.dataset.cqShortcutOrigin = "queue";
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "minmax(0, 1fr) max-content";
        grid.style.columnGap = "24px";
        grid.style.rowGap = "12px";
        grid.style.width = "100%";
        shortcuts.forEach((shortcut) => {
            const label = document.createElement("span");
            label.dataset.cqShortcutOrigin = "queue";
            label.textContent = shortcut.label;
            label.style.fontSize = "0.9rem";
            label.style.lineHeight = "1.2";
            label.style.alignSelf = "center";
            grid.appendChild(label);
            const keys = buildShortcutKeyGroup(shortcut.keys);
            keys.dataset.cqShortcutOrigin = "queue";
            keys.classList.add("text-token-text-secondary");
            keys.style.justifySelf = "end";
            grid.appendChild(keys);
        });
        queueColumn.appendChild(grid);
    }

    function findShortcutListFromHeading(heading: HTMLElement | null): HTMLDListElement | null {
        let current = heading?.parentElement || null;
        while (current && current !== document.body) {
            const list = current.querySelector?.("dl");

            if (list instanceof HTMLDListElement) {
                return list;
            }

            current = current.parentElement;
        }
        return null;
    }

    function refreshKeyboardShortcutPopover() {
        const seen = new Set<HTMLDListElement>();
        const headings = document.querySelectorAll<HTMLElement>("h2");
        headings.forEach((heading) => {
            if (!(heading instanceof HTMLElement)) return;
            const label = heading.textContent?.trim().toLowerCase();
            if (label !== "keyboard shortcuts") return;
            const list = findShortcutListFromHeading(heading);
            if (list && !seen.has(list)) {
                seen.add(list);
                injectQueueShortcutsIntoList(list);
            }
        });
    }

    function scheduleShortcutPopoverRefreshBurst() {
        SHORTCUT_POPOVER_REFRESH_DELAYS.forEach((delay) => {
            setTimeout(() => refreshKeyboardShortcutPopover(), delay);
        });
    }

    const matchesPauseShortcut = (event: KeyboardEvent) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.shiftKey) return false;
        if (event.altKey) return false;
        const key = event.key.toLowerCase();
        if (key !== "p") return false;
        if (ctx.isApplePlatform) {
            return event.metaKey && !event.ctrlKey;
        }
        return event.ctrlKey && !event.metaKey;
    };

    const matchesQueueToggleShortcut = (event: KeyboardEvent) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.shiftKey) return false;
        if (event.altKey) return false;
        const key = event.key;
        const code = event.code;
        const isPeriodKey = key === "." || key === ">" || code === "Period";
        if (!isPeriodKey) return false;
        if (ctx.isApplePlatform) {
            return event.metaKey && !event.ctrlKey;
        }
        return event.ctrlKey && !event.metaKey;
    };

    const matchesHoldShortcut = (event: KeyboardEvent) => {
        if (!event || typeof event.key !== "string") return false;
        if (event.key !== "Enter") return false;
        const hasAlt = event.altKey;
        const hasMeta = event.metaKey;
        const hasCtrl = event.ctrlKey;
        if (ctx.isApplePlatform) {
            return hasAlt && hasMeta && !hasCtrl;
        }
        return hasAlt && hasCtrl && !hasMeta;
    };

    const matchesShortcutPopoverToggle = (event: KeyboardEvent) => {
        if (!event || typeof event.key !== "string") return false;
        const normalized = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (normalized !== "/" && normalized !== "?") return false;
        if (ctx.isApplePlatform) {
            return event.metaKey && !event.ctrlKey && !event.altKey;
        }
        return event.ctrlKey && !event.metaKey && !event.altKey;
    };

    const matchesQueueNavigationShortcut = (event: KeyboardEvent) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.altKey) return false;
        if (event.ctrlKey || event.metaKey || event.shiftKey) return false;
        return event.key === "ArrowDown" || event.key === "ArrowUp";
    };

    const matchesModelListingShortcut = (event: KeyboardEvent) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.shiftKey || event.altKey) return false;
        const normalized =
            event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (normalized !== "h") return false;
        const metaOnly = event.metaKey && !event.ctrlKey;
        const ctrlOnly = event.ctrlKey && !event.metaKey;
        return metaOnly || ctrlOnly;
    };

    const resolveModelShortcutIndex = (event: KeyboardEvent | null): number | null => {
        if (!event || typeof event.key !== "string") return null;
        const normalized = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        const usesMetaCombo = ctx.isApplePlatform ? event.metaKey : event.ctrlKey;
        const usesAltCombo = ctx.isApplePlatform ? event.altKey : event.altKey;
        if (!usesMetaCombo || !usesAltCombo) return null;
        const allowedKeys = resolveModelShortcutKeys();
        const index = allowedKeys.indexOf(normalized);
        return index >= 0 ? index : null;
    };

    const handleModelShortcut = async (index: number) => {
        const availableModels = resolveAvailableModels();
        const target = availableModels[index];
        if (!target) return;
        await ctx.handleComposerModelSelection(target);
    };

    const resolveThinkingShortcut = (event: KeyboardEvent | null): ThinkingLevel | null => {
        if (!event || typeof event.key !== "string") return null;
        const normalized = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
        const usesCombo = ctx.isApplePlatform
            ? event.metaKey && event.ctrlKey
            : event.ctrlKey && event.altKey;
        if (!usesCombo) return null;
        const option = ctx.thinkingOptions.find((entry) => entry.digit === normalized);
        return option ? option.id : null;
    };

    const handleThinkingShortcut = async (optionId: ThinkingLevel) => {
        const applied = await ctx.selectThinkingTimeOption(optionId);
        if (applied) {
            ctx.emitStateChange("thinking:shortcut", { optionId });
            ctx.scheduleControlRefresh();
        }
    };

    const keydownPrimary = (event: KeyboardEvent) => {
        if (matchesPauseShortcut(event)) {
            event.preventDefault();
            ctx.togglePaused();
            return;
        }

        if (matchesQueueToggleShortcut(event)) {
            event.preventDefault();
            ctx.setCollapsed(!ctx.state.collapsed);
            return;
        }

        if (matchesModelListingShortcut(event)) {
            event.preventDefault();
            ctx.openModelSwitcherDropdown();
            return;
        }

        const modelShortcutIndex = resolveModelShortcutIndex(event);
        if (modelShortcutIndex !== null) {
            event.preventDefault();
            void handleModelShortcut(modelShortcutIndex);
            return;
        }

        const thinkingShortcut = resolveThinkingShortcut(event);
        if (thinkingShortcut) {
            event.preventDefault();
            void handleThinkingShortcut(thinkingShortcut);
            return;
        }
    };

    const keydownNavigation = (event: KeyboardEvent) => {
        if (!matchesQueueNavigationShortcut(event)) return;
        if (!ctx.state.queue.length) return;
        const rows = ctx.getQueueRows();
        if (!rows.length) return;
        const activeElement = document.activeElement;
        const composerNode = ctx.getComposerNode();
        const activeRow =
            activeElement instanceof HTMLElement
                ? (activeElement.closest(CQ_SELECTORS.row) as HTMLElement | null)
                : null;
        const withinComposer =
            composerNode instanceof HTMLElement &&
            composerNode.contains(activeElement);
        if (!activeRow && !withinComposer) return;
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        if (!activeRow) {
            const targetIndex = direction > 0 ? 0 : rows.length - 1;
            ctx.focusQueueRow(rows[targetIndex]);
            return;
        }
        const currentIndex = rows.indexOf(activeRow);
        if (currentIndex === -1) return;
        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= rows.length) {
            ctx.focusComposerEditor();
            return;
        }
        ctx.focusQueueRow(rows[nextIndex]);
    };

    const keyupRefresh = (event: KeyboardEvent) => {
        if (event.repeat) return;
        if (!matchesShortcutPopoverToggle(event)) return;
        scheduleShortcutPopoverRefreshBurst();
    };

    const keydownComposer = (event: KeyboardEvent) => {
        if (matchesHoldShortcut(event)) {
            event.preventDefault();
            ctx.queueFromComposer({ hold: true });
            return;
        }

        if (event.key !== "Enter") return;
        const altOnly =
            event.altKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey;
        if (!altOnly) return;
        event.preventDefault();
        void ctx.queueComposerInput();
    };

    const listeners: Array<() => void> = [];

    document.addEventListener("keydown", keydownPrimary, true);
    listeners.push(() => document.removeEventListener("keydown", keydownPrimary, true));

    document.addEventListener("keydown", keydownNavigation, true);
    listeners.push(() => document.removeEventListener("keydown", keydownNavigation, true));

    document.addEventListener("keyup", keyupRefresh);
    listeners.push(() => document.removeEventListener("keyup", keyupRefresh));

    document.addEventListener("keydown", keydownComposer, true);
    listeners.push(() => document.removeEventListener("keydown", keydownComposer, true));

    return {
        refreshPopover: refreshKeyboardShortcutPopover,
        refreshPopoverBurst: scheduleShortcutPopoverRefreshBurst,
        dispose: () => listeners.splice(0).forEach((off) => off()),
    };
};
