import { createModelMenuController, MODEL_DROPDOWN_ID } from "../lib/models/menu";
import { STATIC_MODEL_DEFINITIONS, type UserPlan } from "../lib/constants/models";
import type { QueueState } from "../lib/state";
import type {
    QueueModelDefinition,
    QueueModelGroupMeta,
} from "../lib/types";
import { sleep } from "../lib/utils";
import type { Emit, ModelElements } from "./types";

declare global {
    interface Window {
        __CQ_DEBUG_MODELS?: boolean;
        cqShowModelDebugPopup?: (models: QueueModelDefinition[]) => void;
    }
}

export interface ModelControllerContext {
    state: QueueState;
    emitStateChange: Emit;
    refreshControls: () => void;
    saveState: (identifier?: string | null) => void;
    dispatchPointerAndMousePress: (target: Element | null) => void;
    dispatchKeyboardEnterPress: (target: Element | null) => void;
}

export interface ModelController {
    modelMenuController: ReturnType<typeof createModelMenuController>;
    normalizeModelId: (value: unknown) => string;
    applyModelIdAlias: (value: string | null | undefined) => string;
    supportsThinkingForModel: (
        modelId: string | null | undefined,
        label?: string | null,
    ) => boolean;
    resolveCurrentModelButtonValue: () => string;
    labelForModel: (id: string | null | undefined, fallback?: string) => string;
    openModelDropdownForAnchor: (
        anchor: HTMLElement,
        options?: {
            selectedModelId?: string | null;
            onSelect?: (model: QueueModelDefinition) => void;
        },
    ) => Promise<void>;
    ensureModelOptions: (options?: { force?: boolean }) => Promise<QueueModelDefinition[]>;
    ensureModel: (modelId: string | null | undefined) => Promise<boolean>;
    markModelSelected: (id: string, label?: string) => void;
    scheduleHeaderModelSync: (delay?: number) => void;
    ensureModelSwitcherObserver: () => void;
    dedupeModelsForDisplay: (models: QueueModelDefinition[]) => QueueModelDefinition[];
    resolveModelOrder: (model: QueueModelDefinition) => number;
    activateMenuItem: (item: Element | null) => boolean;
    openModelSwitcherDropdown: () => boolean;
    getCurrentModelId: () => string | null;
    getCurrentModelLabel: () => string;
    showModelDebugPopup: (models: QueueModelDefinition[]) => void;
    detectUserPlan: () => UserPlan;
    dispose: () => void;
}

const MODEL_BUTTON_FALLBACK_LABEL = "Detecting…";
const HEADER_MODEL_SYNC_DEBOUNCE_MS = 150;
const HEADER_LABEL_SEPARATORS = ["·", "|", "/", "-", "–", "—", "·", ":"];

export const initModelController = (ctx: ModelControllerContext): ModelController => {
    const {
        state: STATE,
        emitStateChange,
        refreshControls,
        saveState,
        dispatchPointerAndMousePress,
        dispatchKeyboardEnterPress,
    } = ctx;

    let currentModelId: string | null = null;
    let currentModelLabel = "";
    let modelSwitcherObserver: MutationObserver | null = null;
    let observedModelSwitcherButton: HTMLButtonElement | null = null;
    let headerModelSyncTimer = 0;
    let headerModelSyncInFlight = false;
    let lastSyncedHeaderLabelSignature = "";
    let lastLoggedMarkModelId: string | null = null;
    let lastLoggedMarkModelLabel = "";
    let lastLoggedCurrentModelId: string | null = "__unset__";
    let lastLoggedCurrentModelLabel = "__unset__";
    let modelChangeClickListener: ((event: Event) => void) | null = null;

    const MODEL_ID_ALIASES: Record<string, string> = {
        auto: "gpt-5-1",
        gpt5: "gpt-5-1",
        "gpt-5": "gpt-5-1",
        "gpt-5-mini": "gpt-5-t-mini",
        "gpt5-mini": "gpt-5-t-mini",
    };

    const normalizeModelId = (value: unknown): string =>
        String(value ?? "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");

    const applyModelIdAlias = (value: string | null | undefined): string => {
        const normalized = normalizeModelId(value);
        return MODEL_ID_ALIASES[normalized] || String(value ?? "");
    };

    const resolveModelElements = (): ModelElements => ({
        switcherButtons: queryModelSwitcherButtons(),
        menuRoot: findModelMenuRoot(),
    });

    const supportsThinkingForModel = (
        modelId: string | null | undefined,
        label?: string | null,
    ): boolean => {
        const canonical = modelId
            ? normalizeModelId(applyModelIdAlias(modelId))
            : "";
        const normalizedLabel = typeof label === "string" ? label : "";
        const canonicalMatches = canonical.includes("thinking");
        const labelMatches = normalizedLabel.toLowerCase().includes("thinking");
        return canonicalMatches || labelMatches;
    };

    const isModelDebugEnabled = (): boolean => {
        try {
            if (typeof window !== "object") return false;
            if (typeof window.__CQ_DEBUG_MODELS === "boolean") {
                return window.__CQ_DEBUG_MODELS;
            }
            const stored = window.localStorage?.getItem("cq:model-debug");
            return stored === "true";
        } catch (_) {
            return false;
        }
    };

    const logModelDebug = (...parts: unknown[]) => {
        if (!isModelDebugEnabled()) return;
        try {
            if (typeof console === "object" && typeof console.info === "function") {
                console.info("[cq][models]", ...parts);
            }
        } catch (_) {
            /* ignored */
        }
    };

    const isElementVisible = (element: Element | null): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false;

        const style = window.getComputedStyle(element);

        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return false;
        }

        if (style.pointerEvents === "none") return false;

        const rect = element.getBoundingClientRect();

        return rect.width > 0 && rect.height > 0;
    };

    const isThinkingRelatedElement = (node: Element | null): boolean => {
        if (!(node instanceof Element)) return false;

        const candidates: Array<string | null | undefined> = [
            node.getAttribute("aria-label"),
            node.getAttribute("data-testid"),
            node.getAttribute("title"),
            node.textContent,
        ];

        const normalized = candidates
            .map((value) => (value || "").trim().toLowerCase())
            .filter(Boolean)
            .join(" ");

        if (normalized.includes("thinking")) return true;

        const role = node.getAttribute("role");
        if (role === "menuitemradio" || role === "menuitem") {
            if (normalized.includes("think")) return true;
        }

        return false;
    };

    const isThinkingInteraction = (node: Element | null): boolean => {
        let cursor: Element | null = node;

        for (let depth = 0; cursor && depth < 6; depth += 1) {
            if (isThinkingRelatedElement(cursor)) return true;
            cursor = cursor.parentElement;
        }

        return false;
    };

    const isComposerFooterInteraction = (node: Element | null): boolean => {
        if (!(node instanceof Element)) return false;

        return !!node.closest('[data-testid="composer-footer-actions"]');
    };

    const queryModelSwitcherButtons = (): HTMLButtonElement[] =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                'button[data-testid="model-switcher-dropdown-button"]',
            ),
        );

    const findPreferredModelSwitcherButton = () => {
        const { switcherButtons } = resolveModelElements();
        const visible = switcherButtons.filter((btn) => isElementVisible(btn));
        if (!switcherButtons.length) {
            logModelDebug("model switcher button missing", {
                timestamp: Date.now(),
            });
            return null;
        }
        if (visible.length) return visible[0];
        return switcherButtons[0];
    };

    const getActiveFocusableElement = (): HTMLElement | null => {
        if (!(document.activeElement instanceof HTMLElement)) return null;
        return document.activeElement;
    };

    const restoreFocusIfAllowed = (
        element: Element | null,
        guard?: () => boolean,
    ): boolean => {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.isConnected) return false;
        if (typeof guard === "function" && !guard()) return false;
        element.focus({ preventScroll: true });
        return true;
    };

    const findModelMenuRoot = (): HTMLElement | null => {
        const selectors = [
            "[data-radix-menu-content]",
            "[data-radix-dropdown-menu-content]",
            '[role="menu"]',
            '[role="listbox"]',
        ];
        for (const root of document.querySelectorAll(selectors.join(","))) {
            if (!(root instanceof HTMLElement)) continue;
            if (root.id === MODEL_DROPDOWN_ID || root.closest(`#${MODEL_DROPDOWN_ID}`)) {
                continue;
            }
            if (root.querySelector('[data-testid^="model-switcher-"]')) return root;
        }
        return null;
    };

    const waitForModelMenu = (timeoutMs = 1500): Promise<HTMLElement | null> =>
        new Promise<HTMLElement | null>((resolve) => {
            const start = performance.now();
            logModelDebug("waitForModelMenu:start", {
                timeoutMs,
            });
            const tick = () => {
                const root = findModelMenuRoot();
                if (root) {
                    logModelDebug("waitForModelMenu:resolved", {
                        elapsed: performance.now() - start,
                        menuId: root.id || null,
                    });
                    resolve(root);
                    return;
                }
                if (performance.now() - start >= timeoutMs) {
                    logModelDebug("waitForModelMenu:timeout", {
                        elapsed: performance.now() - start,
                    });
                    resolve(null);
                    return;
                }
                requestAnimationFrame(tick);
            };
            tick();
        });

    const lookupMenuItemAcrossRoots = (modelId: string): HTMLElement | null => {
        const selector = `[role="menuitem"][data-testid="model-switcher-${escapeCss(modelId)}"]`;
        for (const root of document.querySelectorAll("[data-radix-menu-content]")) {
            if (
                root instanceof HTMLElement &&
                (root.id === MODEL_DROPDOWN_ID || root.closest(`#${MODEL_DROPDOWN_ID}`))
            ) {
                continue;
            }
            const match = root.querySelector<HTMLElement>(selector);
            if (match) return match;
        }
        return null;
    };

    const findClosedSubmenuTrigger = (visited: Set<HTMLElement>): HTMLElement | null => {
        const submenus = document.querySelectorAll(
            '[role="menuitem"][data-testid$="-submenu"]',
        );
        for (const trigger of submenus) {
            if (!(trigger instanceof HTMLElement)) continue;
            if (trigger.getAttribute("aria-expanded") === "true") continue;
            if (visited.has(trigger)) continue;
            return trigger;
        }
        return null;
    };

    const dispatchPointerAndMousePressSafe = (target: Element | null) => {
        dispatchPointerAndMousePress(target);
    };

    const dispatchKeyboardEnterPressSafe = (target: Element | null) => {
        dispatchKeyboardEnterPress(target);
    };

    const openSubmenuTrigger = async (trigger: HTMLElement | null): Promise<boolean> => {
        if (!(trigger instanceof HTMLElement)) return false;
        const alreadyOpen = trigger.getAttribute("aria-expanded") === "true";
        const controlsId = trigger.getAttribute("aria-controls") || "";
        if (!alreadyOpen) {
            dispatchPointerAndMousePressSafe(trigger);
            await sleep(12);
        }
        if (trigger.getAttribute("aria-expanded") !== "true") {
            dispatchPointerAndMousePressSafe(trigger);
        }
        const root = controlsId
            ? document.getElementById(controlsId)
            : trigger.parentElement;
        const item = root?.querySelector?.(
            '[role="menuitem"][data-testid^="model-switcher-"]',
        );
        if (alreadyOpen) return !!item;
        return !!item;
    };

    const waitForModelMenuItem = async (
        menu: HTMLElement | null,
        modelId: string,
        timeoutMs = 1200,
    ): Promise<HTMLElement | null> => {
        const start = performance.now();
        const visited = new Set<HTMLElement>();
        const lookup = (): HTMLElement | null => {
            if (menu) {
                const direct = menu.querySelector<HTMLElement>(
                    `[role="menuitem"][data-testid="model-switcher-${escapeCss(modelId)}"]`,
                );
                if (direct) return direct;
            }
            const cross = lookupMenuItemAcrossRoots(modelId);
            if (cross) return cross;
            return null;
        };
        let target = lookup();
        while (!target && performance.now() - start < timeoutMs) {
            const submenuTrigger = findClosedSubmenuTrigger(visited);
            if (!submenuTrigger) break;
            visited.add(submenuTrigger);
            await openSubmenuTrigger(submenuTrigger);
            await sleep(40);
            target = lookup();
        }
        return target;
    };

    const isDropdownVisiblyOpen = (button: HTMLElement | null) => {
        if (!(button instanceof HTMLElement)) return false;
        const ariaExpanded = button.getAttribute("aria-expanded") === "true";
        const menu = document.getElementById(MODEL_DROPDOWN_ID);
        const menuVisible =
            menu instanceof HTMLElement &&
            menu.getBoundingClientRect().height > 0 &&
            menu.dataset.state === "open";
        const buttons = queryModelSwitcherButtons();
        const someButtonExpanded = buttons.some(
            (candidate) => candidate.getAttribute("aria-expanded") === "true",
        );
        const dropdownInDOM = findModelMenuRoot();
        return (
            ariaExpanded ||
            menuVisible ||
            someButtonExpanded ||
            !!dropdownInDOM ||
            !!document.querySelector('[data-testid="model-switcher"]')
        );
    };
    const setModelSwitcherOpenState = (button: HTMLElement | null, shouldOpen = true) => {
        if (!(button instanceof HTMLElement)) return false;
        const desired = !!shouldOpen;
        if (desired === isDropdownVisiblyOpen(button)) {
            return true;
        }
        button.focus?.({ preventScroll: true });
        logModelDebug("setModelSwitcherOpenState:attempt", {
            desired,
            ariaExpanded: button.getAttribute("aria-expanded"),
        });
        const attempt = () => {
            const state = isDropdownVisiblyOpen(button);
            return state === desired;
        };
        const trySequence = () => {
            dispatchPointerAndMousePressSafe(button);
            if (attempt()) return true;
            dispatchKeyboardEnterPressSafe(button);
            if (attempt()) return true;
            button.click();
            return attempt();
        };
        let success = trySequence();
        if (!success && !desired) {
            document.dispatchEvent(
                new KeyboardEvent("keydown", {
                    bubbles: true,
                    cancelable: true,
                    key: "Escape",
                    code: "Escape",
                }),
            );
            success = attempt();
        }
        logModelDebug("setModelSwitcherOpenState:result", {
            success,
            desired,
        });
        return success;
    };

    const openModelSwitcherDropdown = (): boolean => {
        modelMenuController.close();
        const button = findPreferredModelSwitcherButton();
        if (!(button instanceof HTMLElement)) return false;
        const opened = setModelSwitcherOpenState(button, true);
        if (!opened) return false;
        button.focus?.({ preventScroll: false });
        return true;
    };

    const modelMenuController = createModelMenuController({
        normalizeModelId,
        dedupeModels: (models) => dedupeModelsForDisplay(models),
        resolveModelOrder: (model) => resolveModelOrder(model),
        resolveHeading: (models, selectedModelId) =>
            resolveModelDropdownHeading(models, selectedModelId),
        getGroupMeta: (groupId) => STATE.modelGroups?.[groupId],
        log: logModelDebug,
    });

    const useModelMenu = async <T>(
        operation: (menu: HTMLElement, button: HTMLButtonElement) => Promise<T> | T,
    ): Promise<T | null> => {
        const button = findPreferredModelSwitcherButton();
        if (!button) {
            logModelDebug("useModelMenu:button-missing");
            return null;
        }
        const wasOpen = isDropdownVisiblyOpen(button);
        logModelDebug("useModelMenu:begin", {
            wasOpen,
            buttonState: button.getAttribute("aria-expanded"),
        });
        let previousFocus = getActiveFocusableElement();
        if (previousFocus === button) previousFocus = null;
        let openedByUs = false;
        if (!wasOpen) {
            openedByUs = true;
            const toggled = setModelSwitcherOpenState(button, true);
            logModelDebug("useModelMenu:toggle-open", {
                toggled,
            });
        }
        const menu = await waitForModelMenu();
        if (!menu) {
            logModelDebug("useModelMenu:no-menu", {
                openedByUs,
                wasOpen,
            });
            if (!wasOpen && openedByUs) {
                setModelSwitcherOpenState(button, false);
            }
            return null;
        }
        logModelDebug("useModelMenu:menu-ready", {
            openedByUs,
            wasOpen,
            menuId: menu.id || null,
        });
        let result: T | null = null;
        try {
            result = await operation(menu, button);
        } finally {
            if (!wasOpen && openedByUs) {
                logModelDebug("useModelMenu:closing-menu");
                setModelSwitcherOpenState(button, false);
                restoreFocusIfAllowed(previousFocus, () => {
                    const active = document.activeElement;
                    if (!(active instanceof HTMLElement)) return true;
                    if (active === button) return true;
                    if (active === document.body) return true;
                    return !!active.closest("[data-radix-menu-content]");
                });
            }
        }
        return result;
    };

    const activateMenuItem = (item: Element | null): boolean => {
        if (!(item instanceof HTMLElement)) return false;
        item.focus?.({ preventScroll: true });
        dispatchPointerAndMousePressSafe(item);
        if (!item.isConnected) return true;
        dispatchKeyboardEnterPressSafe(item);
        if (!item.isConnected) return true;
        item.click();
        return true;
    };

    const getModelNodeLabel = (node: Element | null | undefined): string => {
        if (!node) return "";
        const text = node.textContent || "";
        const lines = text
            .split("\n")
            .map((line: string) => line.trim())
            .filter(Boolean);
        return lines[0] || text.trim();
    };

    const waitForModelMenuItemWithTimeout = async (
        menu: HTMLElement,
        modelId: string,
        timeoutMs: number,
    ) => waitForModelMenuItem(menu, modelId, timeoutMs);

    const ensureModel = async (modelId: string | null | undefined) => {
        if (!modelId) return true;
        const targetModelId = applyModelIdAlias(modelId);
        await ensureModelOptions();
        const targetNormalized = normalizeModelId(targetModelId);
        if (
            targetNormalized &&
            normalizeModelId(currentModelId) === targetNormalized
        ) {
            return true;
        }
        const result = await useModelMenu(async (menu) => {
            const item = await waitForModelMenuItemWithTimeout(menu, targetModelId, 3000);
            if (!item) {
                return false;
            }
            const label = getModelNodeLabel(item) || targetModelId;
            activateMenuItem(item);
            await sleep(120);
            markModelSelected(modelId, label);
            return true;
        });
        return !!result;
    };

    const normalizeModelLabelSignature = (value: unknown): string =>
        String(value || "")
            .replace(/chatgpt/gi, "")
            .replace(/[•·|/:\-–—]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

    const extractHeaderLabelSignatures = (label: string | null | undefined): string[] => {
        const signatures = new Set<string>();
        const base = normalizeModelLabelSignature(label);
        if (base) signatures.add(base);
        const safeLabel = String(label ?? "");
        const parts = [safeLabel];
        HEADER_LABEL_SEPARATORS.forEach((sep) => {
            safeLabel.split(sep).forEach((part) => parts.push(part));
        });
        parts.forEach((part) => {
            const sig = normalizeModelLabelSignature(part);
            if (sig) signatures.add(sig);
        });
        return Array.from(signatures);
    };

    const tokenizeSignature = (signature: string | null | undefined): string[] => {
        if (!signature) return [];
        return signature
            .split(" ")
            .map((token) => token.trim())
            .filter(Boolean);
    };

    const collectDigitsFromValue = (value: unknown): string[] => {
        if (!value) return [];
        return (String(value).match(/\d+/g) || []).map((digit) => digit.trim()).filter(Boolean);
    };

    interface ModelSignatureMeta {
        labelSignature: string;
        descriptionSignature: string;
        idSignature: string;
        tokens: Set<string>;
        digits: Set<string>;
    }

    const buildModelSignatureMeta = (model: QueueModelDefinition): ModelSignatureMeta => {
        const labelSignature = normalizeModelLabelSignature(model?.label);
        const descriptionSignature = normalizeModelLabelSignature(model?.description);
        const idSignature = normalizeModelLabelSignature(model?.id);
        const tokens = new Set<string>();
        [labelSignature, descriptionSignature, idSignature].forEach((signature) => {
            tokenizeSignature(signature).forEach((token) => tokens.add(token));
        });
        const digits = new Set<string>();
        [labelSignature, descriptionSignature, idSignature, model?.id].forEach((signature) => {
            collectDigitsFromValue(signature).forEach((digit) => digits.add(digit));
        });
        return {
            labelSignature,
            descriptionSignature,
            idSignature,
            tokens,
            digits,
        };
    };

    const scoreModelSignatureMatch = (
        signatures: string[],
        headerTokensList: string[][],
        headerDigits: Set<string>,
        meta: ModelSignatureMeta,
    ): number => {
        if (!meta) return 0;
        const headerTokens = new Set<string>();
        headerTokensList.forEach((tokens) =>
            tokens.forEach((token) => headerTokens.add(token)),
        );
        if (!headerTokens.size && !headerDigits.size) return 0;
        const candidateTokens = meta.tokens;
        const candidateDigits = meta.digits;
        if (!candidateTokens.size && !candidateDigits.size) return 0;
        let score = 0;
        signatures.forEach((signature) => {
            if (signature) {
                const { idSignature, labelSignature, descriptionSignature } = meta;
                if (idSignature === signature) score += 3;
                if (labelSignature === signature) score += 4;
                if (descriptionSignature === signature) score += 2;
            }
        });
        headerTokens.forEach((token) => {
            if (candidateTokens.has(token)) {
                score += 3;
            }
        });
        if (headerDigits.size) {
            let digitMatches = 0;
            headerDigits.forEach((digit) => {
                if (meta.digits.has(digit)) digitMatches += 1;
            });
            if (digitMatches) {
                score += 5 + digitMatches * 5;
            } else if (score > 0) {
                score -= 5;
            }
        }
        return score;
    };

    const findModelMatchByLabelSignature = (
        signatureInput: string | string[] | null | undefined,
        models: QueueModelDefinition[] = STATE.models,
    ): QueueModelDefinition | null => {
        const signatures = (Array.isArray(signatureInput) ? signatureInput : [signatureInput]).filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
        );
        if (!signatures.length || !Array.isArray(models)) return null;
        const headerTokensList = signatures.map((signature) => tokenizeSignature(signature));
        const headerDigits = new Set<string>();
        signatures.forEach((signature) => {
            collectDigitsFromValue(signature).forEach((digit) => headerDigits.add(digit));
        });
        let bestModel: QueueModelDefinition | null = null;
        let bestScore = 0;
        models.forEach((model) => {
            const meta = buildModelSignatureMeta(model);
            const score = scoreModelSignatureMatch(
                signatures,
                headerTokensList,
                headerDigits,
                meta,
            );
            if (score > bestScore) {
                bestScore = score;
                bestModel = model;
            } else if (score === bestScore && score > 0 && bestModel) {
                const currentSelected = !!model.selected;
                const bestSelected = !!bestModel.selected;
                if (currentSelected && !bestSelected) {
                    bestModel = model;
                }
            }
        });
        return bestScore > 0 ? bestModel : null;
    };

    const logModelSyncEvent = (event: string, payload: Record<string, unknown> = {}) => {
        try {
            console.info("[cq][debug] headerModelSync", {
                event,
                timestamp: Date.now(),
                currentModelId,
                currentModelLabel,
                ...payload,
            });
        } catch (_) {
            /* ignored */
        }
    };

    const HEADER_LABEL_ALIASES: Array<{ test: (value: string) => boolean; display: string }> = [
        {
            test: (value) => /^5$/i.test(value),
            display: "Auto",
        },
    ];

    const applyHeaderLabelAliases = (label: string | null | undefined): string => {
        const trimmed = String(label || "").trim();
        if (!trimmed) return "";
        const alias = HEADER_LABEL_ALIASES.find((entry) =>
            entry.test(trimmed),
        );
        if (alias) return alias.display;
        return trimmed;
    };

    const HEADER_LABEL_MODEL_MAP: Array<{
        signature?: string;
        modelId: string;
        label: string;
        test?: (value: string) => boolean;
    }> = [
        {
            signature: "5.1 instant",
            modelId: "gpt-5-1-instant",
            label: "Instant",
        },
        {
            signature: "5.1 thinking",
            modelId: "gpt-5-1-thinking",
            label: "Thinking",
        },
        {
            signature: "5.1 auto",
            modelId: "gpt-5-1",
            label: "Auto",
        },
        {
            signature: "5 instant",
            modelId: "gpt-5-instant",
            label: "GPT-5 Instant",
        },
        {
            signature: "5 thinking mini",
            modelId: "gpt-5-t-mini",
            label: "GPT-5 Thinking mini",
        },
    ];

    const findHeaderLabelModelOverride = (label: string | null | undefined): { id: string; label: string } | null => {
        const signature = normalizeModelLabelSignature(label);
        if (!signature) return null;
        const entry = HEADER_LABEL_MODEL_MAP.find((item) => {
            if (typeof item.test === "function") {
                return item.test(signature);
            }
            if (item.signature) {
                return item.signature === signature;
            }
            return false;
        });
        if (!entry) return null;
        return {
            id: entry.modelId,
            label: entry.label ?? label ?? "",
        };
    };

    const setCurrentModel = (id: string | null, label = "") => {
        const pendingId = id || null;
        const pendingLabel = label || "";
        if (
            pendingId !== lastLoggedCurrentModelId ||
            pendingLabel !== lastLoggedCurrentModelLabel
        ) {
            console.info("[cq][debug] setCurrentModel", {
                timestamp: Date.now(),
                id: pendingId,
                label: pendingLabel,
            });
            lastLoggedCurrentModelId = pendingId;
            lastLoggedCurrentModelLabel = pendingLabel;
        }
        currentModelId = id || null;
        if (!id) {
            currentModelLabel = label || "";
            return;
        }
        const info = getModelById(id);
        currentModelLabel = label || info?.label || currentModelLabel || id;
    };

    const markModelSelected = (id: string, label = "") => {
        if (!id) return;
        const labelText = label || "";
        if (
            id !== lastLoggedMarkModelId ||
            labelText !== lastLoggedMarkModelLabel
        ) {
            console.info("[cq][debug] markModelSelected", {
                timestamp: Date.now(),
                id,
                label: labelText,
            });
            lastLoggedMarkModelId = id;
            lastLoggedMarkModelLabel = labelText;
        }
        const canonicalId = applyModelIdAlias(id);
        const targetNormalized = normalizeModelId(canonicalId);
        let found = false;
        STATE.models = STATE.models.map((model) => {
            const match = normalizeModelId(model.id) === targetNormalized;
            if (match) {
                found = true;
                return {
                    ...model,
                    selected: true,
                    label: label || model.label || model.id,
                };
            }
            if (model.selected) {
                return { ...model, selected: false };
            }
            return model;
        });
        if (!found) {
            STATE.models.push({
                id: canonicalId,
                label: label || canonicalId,
                selected: true,
            });
        }
        setCurrentModel(canonicalId, labelForModel(canonicalId, label));
    };

    const getModelById = (id: string | null | undefined): QueueModelDefinition | null => {
        if (!id) return null;
        const normalized = normalizeModelId(id);
        return (
            STATE.models.find(
                (model) => normalizeModelId(model.id) === normalized,
            ) || null
        );
    };

    const labelForModel = (id: string | null | undefined, fallback = ""): string => {
        if (!id) return fallback || "";
        const info = getModelById(id);
        if (info?.label) return info.label;
        if (
            normalizeModelId(currentModelId) === normalizeModelId(id) &&
            currentModelLabel
        )
            return currentModelLabel;
        return fallback || id;
    };

    const resolveModelDropdownHeading = (
        models: QueueModelDefinition[] = STATE.models,
        selectedModelId?: string | null,
    ): string => {
        const slugCandidate =
            selectedModelId ||
            currentModelId ||
            models.find((model) => model.selected)?.id ||
            STATE.models[0]?.id ||
            "";
        if (!slugCandidate) return "Models";
        const normalized = slugCandidate.toLowerCase();
        if (normalized.startsWith("gpt-")) {
            const parts = normalized.split("-");
            const numericRun = [];
            for (let i = 1; i < parts.length; i += 1) {
                const token = parts[i];
                if (/^\d+$/.test(token)) {
                    numericRun.push(token);
                    continue;
                }
                break;
            }
            if (numericRun.length >= 2) {
                return `GPT-${numericRun.join(".")}`;
            }
            if (numericRun.length === 1) {
                return `GPT-${numericRun[0].toUpperCase()}`;
            }
            if (parts[1]) {
                return `GPT-${parts[1].toUpperCase()}`;
            }
            return "GPT";
        }
        return slugCandidate.toUpperCase();
    };

    const dedupeModelsForDisplay = (models: QueueModelDefinition[]): QueueModelDefinition[] => {
        const map = new Map<string, QueueModelDefinition>();
        models.forEach((model) => {
            if (!model?.id) return;
            const canonicalKey = normalizeModelId(applyModelIdAlias(model.id));
            if (!canonicalKey) return;
            const existing = map.get(canonicalKey);
            if (!existing) {
                map.set(canonicalKey, model);
                return;
            }
            const existingIsAlias =
                normalizeModelId(existing.id) !== canonicalKey;
            const currentIsAlias =
                normalizeModelId(model.id) !== canonicalKey;
            let preferCurrent = false;
            if (currentIsAlias && !existingIsAlias) {
                preferCurrent = true;
            } else if (currentIsAlias === existingIsAlias) {
                if (!!model.selected && !existing.selected) {
                    preferCurrent = true;
                }
            }
            if (preferCurrent) {
                map.set(canonicalKey, model);
            }
        });
        return Array.from(map.values());
    };

const resolveModelOrder = (model: QueueModelDefinition): number =>
    Number.isFinite(model?.order)
        ? Number(model.order)
        : Number.MAX_SAFE_INTEGER;

const KNOWN_MODEL_DESCRIPTIONS = [
    "Decides how long to think",
    "Answers right away",
    "Thinks longer for better answers",
    "Research-grade intelligence",
];

const stripKnownModelDescriptions = (value: string): string => {
    const text = value || "";
    const lower = text.toLowerCase();

    for (const description of KNOWN_MODEL_DESCRIPTIONS) {
        const normalizedDescription = description.toLowerCase();
        const index = lower.lastIndexOf(normalizedDescription);

        if (index !== -1 && index + normalizedDescription.length === lower.length) {
            const trimmed = text.slice(0, index).trim();

            if (trimmed) {
                return trimmed;
            }
        }
    }

    return text;
};

const readCurrentModelLabelFromHeader = () => {
    const button = findPreferredModelSwitcherButton();
    if (!(button instanceof HTMLElement)) return "";
    const aria = button.getAttribute("aria-label") || "";
    const ariaMatch = aria.match(/current model is (.+)$/i);
    if (ariaMatch && ariaMatch[1]) {
        const trimmed = ariaMatch[1].trim();

        return stripKnownModelDescriptions(trimmed);
    }
    const highlight = button.querySelector(
        ".text-token-text-tertiary, span[class*='text-token-text-tertiary']",
    );
    if (highlight && highlight.textContent) {
        const trimmed = highlight.textContent.trim();

        return stripKnownModelDescriptions(trimmed);
    }
    const text = button.textContent || "";
    const stripped = text.replace(/chatgpt/i, "").trim();

    return stripKnownModelDescriptions(stripped);
};

    const resolveCurrentModelButtonValue = () => {
        const headerLabel = applyHeaderLabelAliases(
            readCurrentModelLabelFromHeader(),
        );
        if (headerLabel) return headerLabel;
        const directLabel =
            (currentModelId &&
                labelForModel(
                    currentModelId,
                    currentModelLabel || currentModelId,
                )) ||
            currentModelLabel ||
            "";
        if (directLabel) return directLabel;
        if (currentModelId) return currentModelId;
        const selected =
            STATE.models.find((model) => model.selected) || STATE.models[0];
        if (selected) {
            return (
                selected.label ||
                selected.modelLabel ||
                selected.id ||
                MODEL_BUTTON_FALLBACK_LABEL
            );
        }
        return MODEL_BUTTON_FALLBACK_LABEL;
    };

    const scheduleHeaderModelSync = (delay: number = HEADER_MODEL_SYNC_DEBOUNCE_MS) => {
        if (headerModelSyncTimer) {
            window.clearTimeout(headerModelSyncTimer);
        }
        headerModelSyncTimer = window.setTimeout(() => {
            headerModelSyncTimer = 0;
            void syncCurrentModelFromHeader();
        }, delay);
    };

    const ensureNativeModelResetListener = () => {
        if (modelChangeClickListener) return;

        modelChangeClickListener = (event: Event) => {
            const target = event.target;

            if (!(target instanceof Element)) return;

            if (
                !isThinkingInteraction(target) &&
                !isComposerFooterInteraction(target)
            )
                return;

            void syncCurrentModelFromHeader();

            scheduleHeaderModelSync(0);

            window.setTimeout(() => scheduleHeaderModelSync(180), 180);
            window.setTimeout(() => scheduleHeaderModelSync(500), 500);
            window.setTimeout(() => scheduleHeaderModelSync(1100), 1100);
        };

        document.addEventListener("click", modelChangeClickListener, true);
    };

    const syncCurrentModelFromHeader = async () => {
        if (headerModelSyncInFlight) return;
        const label = applyHeaderLabelAliases(readCurrentModelLabelFromHeader());
        const signatures = extractHeaderLabelSignatures(label);
        const signatureKey = signatures.join("|");
        logModelSyncEvent("start", {
            label,
            signatureCount: signatures.length,
        });
        const overrideMatch = findHeaderLabelModelOverride(label);
        if (overrideMatch) {
            lastSyncedHeaderLabelSignature = signatureKey;
            logModelSyncEvent("override-match", {
                overrideId: overrideMatch.id,
                overrideLabel: overrideMatch.label || null,
                signatureKey,
            });
            if (
                normalizeModelId(overrideMatch.id) !==
                    normalizeModelId(currentModelId) ||
                (overrideMatch.label &&
                    overrideMatch.label !== currentModelLabel)
            ) {
                markModelSelected(overrideMatch.id, overrideMatch.label);
                refreshControls();
            } else {
                logModelSyncEvent("override-match-unchanged", {
                    overrideId: overrideMatch.id,
                });
            }
            return;
        }
        if (!signatures.length) {
            logModelSyncEvent("no-signatures", { label });
            return;
        }
        if (signatureKey === lastSyncedHeaderLabelSignature && currentModelId) {
            logModelSyncEvent("skip-unchanged", {
                signatureKey,
                label,
            });
            return;
        }
        headerModelSyncInFlight = true;
        try {
            const existingMatch = findModelMatchByLabelSignature(signatures);
            if (existingMatch) {
                lastSyncedHeaderLabelSignature = signatureKey;
                logModelSyncEvent("existing-match", {
                    matchId: existingMatch.id,
                    matchLabel: existingMatch.label || null,
                });
                if (
                    normalizeModelId(existingMatch.id) !==
                        normalizeModelId(currentModelId) ||
                    (existingMatch.label &&
                        existingMatch.label !== currentModelLabel)
                ) {
                    markModelSelected(existingMatch.id, existingMatch.label || label);
                    refreshControls();
                } else {
                    logModelSyncEvent("existing-match-unchanged", {
                        matchId: existingMatch.id,
                    });
                }
                return;
            }
            logModelSyncEvent("existing-match-miss", {
                signatureKey,
                label,
            });
            const cachedModels = await ensureModelOptions();
            logModelSyncEvent("post-cache-fetch", {
                cachedModelCount: cachedModels.length,
            });
            let selectedMatch =
                cachedModels.find((model) => model.selected) ||
                findModelMatchByLabelSignature(signatures, cachedModels);
            if (!selectedMatch) {
                logModelSyncEvent("refresh-model-list", {});
                const refreshedModels = await ensureModelOptions({ force: true });
                logModelSyncEvent("post-refresh-fetch", {
                    refreshedModelCount: refreshedModels.length,
                });
                selectedMatch =
                    refreshedModels.find((model) => model.selected) ||
                    findModelMatchByLabelSignature(signatures, refreshedModels);
            }
            if (selectedMatch) {
                lastSyncedHeaderLabelSignature = signatureKey;
                logModelSyncEvent("selected-match", {
                    matchId: selectedMatch.id,
                    matchLabel: selectedMatch.label || null,
                });
                if (
                    normalizeModelId(selectedMatch.id) !==
                        normalizeModelId(currentModelId) ||
                    (selectedMatch.label &&
                        selectedMatch.label !== currentModelLabel)
                ) {
                    markModelSelected(selectedMatch.id, selectedMatch.label);
                    refreshControls();
                } else {
                    logModelSyncEvent("selected-match-unchanged", {
                        matchId: selectedMatch.id,
                    });
                }
            } else {
                logModelSyncEvent("no-match-found", {
                    signatureKey,
                    label,
                });
            }
        } catch (error) {
            console.info("[cq][debug] header model sync error", error);
        } finally {
            headerModelSyncInFlight = false;
        }
    };

    const disconnectModelSwitcherObserver = () => {
        if (modelSwitcherObserver) {
            modelSwitcherObserver.disconnect();
            modelSwitcherObserver = null;
        }
        observedModelSwitcherButton = null;
    };

    const ensureModelSwitcherObserver = () => {
        const button = findPreferredModelSwitcherButton();
        if (!button) {
            disconnectModelSwitcherObserver();
            return;
        }
        if (observedModelSwitcherButton === button) return;
        disconnectModelSwitcherObserver();
        observedModelSwitcherButton = button;
        modelSwitcherObserver = new MutationObserver(() => {
            scheduleHeaderModelSync();
        });
        modelSwitcherObserver.observe(button, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
        });
        scheduleHeaderModelSync(0);
    };

    const applyDefaultModelToQueueIfMissing = () => {
        if (!currentModelId) return false;
        let updated = false;
        STATE.queue.forEach((entry) => {
            if (!entry.model) {
                entry.model = currentModelId;
                entry.modelLabel = currentModelLabel;
                updated = true;
            }
        });
        if (updated) saveState();
        return updated;
    };

    const syncModelMenuStructure = (
        models: QueueModelDefinition[] = STATE.models,
    ) => {
        const sectionOrder = new Map<string, number>();
        const groupOrder = new Map<string, QueueModelGroupMeta>();
        models.forEach((model) => {
            const order = Number.isFinite(model?.order)
                ? Number(model.order)
                : Number.MAX_SAFE_INTEGER;
            if (model?.group) {
                const key = model.group;
                const label = model.groupLabel || model.group;
                const existing = groupOrder.get(key);
                if (existing || existing === undefined) {
                    if (!existing || order < existing.order) {
                        groupOrder.set(key, { label, order });
                    }
                } else {
                    groupOrder.set(key, { label, order });
                }
            }
            const sectionName = String(model?.section || "").trim();
            if (!sectionName) return;
            if (!sectionOrder.has(sectionName)) {
                sectionOrder.set(sectionName, order);
            }
        });
        STATE.modelSections = Array.from(sectionOrder.entries())
            .sort((a, b) => a[1] - b[1])
            .map(([name]) => name);
        STATE.modelGroups = Array.from(groupOrder.entries())
            .sort((a, b) => a[1].order - b[1].order)
            .reduce<Record<string, QueueModelGroupMeta>>((acc, [key, meta]) => {
                acc[key] = meta;
                return acc;
            }, {});
    };

    const buildStaticModelList = (
        selectedId: string | null = null,
    ): QueueModelDefinition[] => {
        const normalizedSelected = normalizeModelId(selectedId || "");
        let hasSelection = false;
        const models = STATIC_MODEL_DEFINITIONS.map((model, index) => {
            const normalizedId = normalizeModelId(model.id);
            const selected =
                normalizedSelected !== "" && normalizedId === normalizedSelected;
            if (selected) hasSelection = true;
            return {
                ...model,
                order: Number.isFinite(model.order) ? Number(model.order) : index,
                selected,
            };
        });
        if (!hasSelection && models.length) {
            models[0].selected = true;
        }
        return models;
    };

    const ensureModelOptions = async (options: { force?: boolean } = {}) => {
        const shouldRefresh = options.force || !STATE.models.length;
        if (!shouldRefresh) return STATE.models;
        console.info("[cq][debug] ensureModelOptions:start", {
            timestamp: Date.now(),
            source: "static",
            currentModelId,
            forced: !!options.force,
        });
        const previousSignature = JSON.stringify(
            STATE.models.map((model) => ({
                id: model.id,
                label: model.label,
            })),
        );
        const preferredId =
            currentModelId ||
            STATE.models.find((model) => model.selected)?.id ||
            STATIC_MODEL_DEFINITIONS[0]?.id ||
            null;
        STATE.models = buildStaticModelList(preferredId);
        syncModelMenuStructure(STATE.models);
        const selectedModel =
            STATE.models.find((model) => model.selected) || STATE.models[0] || null;
        if (selectedModel) {
            setCurrentModel(selectedModel.id, selectedModel.label);
        }
        console.info("[cq][debug] ensureModelOptions:updated", {
            timestamp: Date.now(),
            currentModelId,
            currentModelLabel,
            modelCount: STATE.models.length,
        });
        const queueUpdated = applyDefaultModelToQueueIfMissing();
        const newSignature = JSON.stringify(
            STATE.models.map((model) => ({ id: model.id, label: model.label })),
        );
        const signatureChanged = newSignature !== previousSignature;
        if (queueUpdated || signatureChanged) {
            emitStateChange("models:update", {
                queueUpdated,
                signatureChanged,
            });
        } else {
            refreshControls();
        }
        return STATE.models;
    };

    const openModelDropdownForAnchor = async (
        anchor: HTMLElement,
        {
            selectedModelId = null,
            onSelect,
        }: { selectedModelId?: string | null; onSelect?: (model: QueueModelDefinition) => void } = {},
    ) => {
        if (!(anchor instanceof HTMLElement)) return;
        try {
            const models = await ensureModelOptions();
            if (!Array.isArray(models) || !models.length) return;
            modelMenuController.toggle({
                anchor,
                models,
                selectedModelId,
                onSelect,
            });
        } catch (error) {
            console.warn("[cq] Failed to open model dropdown", error);
            modelMenuController.close();
        }
    };

    const closeModelDebugPopup = () => {
        document.getElementById("cq-model-debug")?.remove();
    };

    const showModelDebugPopup = (models: QueueModelDefinition[]) => {
        closeModelDebugPopup();
        const overlay = document.createElement("div");
        overlay.id = "cq-model-debug";
        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.zIndex = "2147483647";
        overlay.style.background = "rgba(15,15,20,0.45)";
        overlay.style.backdropFilter = "blur(2px)";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";

        const panel = document.createElement("div");
        panel.style.maxWidth = "520px";
        panel.style.width = "min(90vw, 520px)";
        panel.style.maxHeight = "80vh";
        panel.style.background = "#fff";
        panel.style.borderRadius = "16px";
        panel.style.boxShadow = "0 20px 45px rgba(0,0,0,0.25)";
        panel.style.padding = "20px";
        panel.style.color = "#111";
        panel.style.fontFamily =
            '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.gap = "12px";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";

        const title = document.createElement("h2");
        title.textContent = "Available models";
        title.style.fontSize = "18px";
        title.style.margin = "0";

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.textContent = "Close";
        closeBtn.style.border = "none";
        closeBtn.style.background = "#efefef";
        closeBtn.style.borderRadius = "8px";
        closeBtn.style.padding = "6px 14px";
        closeBtn.style.cursor = "pointer";
        closeBtn.addEventListener("click", () => closeModelDebugPopup());

        header.append(title, closeBtn);

        const list = document.createElement("div");
        list.style.overflowY = "auto";
        list.style.maxHeight = "60vh";
        list.style.padding = "4px";
        list.style.border = "1px solid rgba(17,17,17,0.1)";
        list.style.borderRadius = "12px";

        if (!models.length) {
            const empty = document.createElement("p");
            empty.textContent = "No models available.";
            list.appendChild(empty);
        } else {
            models.forEach((model) => {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.justifyContent = "space-between";
                row.style.gap = "12px";
                row.style.padding = "8px 4px";
                row.style.borderBottom = "1px solid rgba(17,17,17,0.08)";
                const left = document.createElement("div");
                left.textContent = model.label || model.id;
                left.style.fontWeight = model.selected ? "600" : "500";
                const right = document.createElement("div");
                right.textContent = model.id;
                right.style.fontFamily = "monospace";
                right.style.fontSize = "12px";
                row.append(left, right);
                list.appendChild(row);
            });
        }

        panel.append(header, list);
        overlay.appendChild(panel);
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) closeModelDebugPopup();
        });
        document.addEventListener(
            "keydown",
            function onKey(event) {
                if (event.key === "Escape") {
                    document.removeEventListener("keydown", onKey, true);
                    closeModelDebugPopup();
                }
            },
            { once: true, capture: true },
        );
        document.body.appendChild(overlay);
        closeBtn.focus({ preventScroll: true });
    };

    ensureNativeModelResetListener();

    window.cqShowModelDebugPopup = showModelDebugPopup;

    const getCurrentModelId = () => currentModelId;

    const getCurrentModelLabel = () => currentModelLabel;

    const openModelDropdownForAnchorSafe = async (
        anchor: HTMLElement,
        options?: {
            selectedModelId?: string | null;
            onSelect?: (model: QueueModelDefinition) => void;
        },
    ) => openModelDropdownForAnchor(anchor, options || {});

    const detectUserPlan = (): UserPlan => {
        const userMenu = document.querySelector('[data-testid="user-menu"]');
        if (!userMenu) return "free";

        const text = userMenu.textContent || "";

        if (text.includes("Pro")) return "pro";
        if (text.includes("Plus")) return "plus";
        if (text.includes("Team")) return "team";
        if (text.includes("Go")) return "go";

        return "free";
    };

    const dispose = () => {
        if (headerModelSyncTimer) {
            window.clearTimeout(headerModelSyncTimer);
            headerModelSyncTimer = 0;
        }

        if (modelChangeClickListener) {
            document.removeEventListener("click", modelChangeClickListener, true);
            modelChangeClickListener = null;
        }

        disconnectModelSwitcherObserver();
        modelMenuController.close();
        closeModelDebugPopup();
        window.cqShowModelDebugPopup = undefined;
    };

    return {
        modelMenuController,
        normalizeModelId,
        applyModelIdAlias,
        supportsThinkingForModel,
        resolveCurrentModelButtonValue,
        labelForModel,
        openModelDropdownForAnchor: openModelDropdownForAnchorSafe,
        ensureModelOptions,
        ensureModel,
        markModelSelected,
        scheduleHeaderModelSync,
        ensureModelSwitcherObserver,
        dedupeModelsForDisplay,
        resolveModelOrder,
        activateMenuItem,
        openModelSwitcherDropdown,
        getCurrentModelId,
        getCurrentModelLabel,
        showModelDebugPopup,
        detectUserPlan,
        dispose,
    };
};

const escapeCss = (value: unknown): string => {
    const str = String(value ?? "");
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
        return CSS.escape(str);
    return str.replace(/[^a-zA-Z0-9_\-]/g, (ch) => `\\${ch}`);
};
