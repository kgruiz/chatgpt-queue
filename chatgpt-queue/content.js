(() => {
    const STATE = {
        running: false,
        queue: [],
        busy: false,
        cooldownMs: 900,
        collapsed: false,
        phase: "idle",
        models: [],
        paused: false,
        pauseReason: "",
        pausedAt: null,
    };
    const SEL = {
        editor: '#prompt-textarea.ProseMirror[contenteditable="true"]',
        send: 'button[data-testid="send-button"], #composer-submit-button[aria-label="Send prompt"]',
        voice: 'button[data-testid="composer-speech-button"], button[aria-label="Start voice mode"]',
        stop: 'button[data-testid="stop-button"][aria-label="Stop streaming"]',
        composer:
            'form[data-type="unified-composer"], div[data-testid="composer"], div[data-testid="composer-root"]',
    };

    const navPlatform =
        typeof navigator === "object"
            ? navigator.userAgentData?.platform ||
              navigator.platform ||
              navigator.userAgent ||
              ""
            : "";
    const isApplePlatform = /mac|iphone|ipad|ipod/i.test(navPlatform);
    const PAUSE_SHORTCUT_LABEL = isApplePlatform
        ? "Command+Shift+P"
        : "Ctrl+Shift+P";
    const PAUSE_SHORTCUT_DISPLAY = isApplePlatform ? "⌘⇧P" : "Ctrl+Shift+P";

    const KEYBOARD_SHORTCUT_SECTION_LABEL = "Queue";
    const SHORTCUT_POPOVER_REFRESH_DELAYS = [0, 160, 360, 640];
    const KEYBOARD_SHORTCUT_ENTRIES = [
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
    ];

    const KEY_DISPLAY_MAP = {
        option: { glyph: "⌥", aria: "Option" },
        command: { glyph: "⌘", aria: "Command" },
        meta: { glyph: "⌘", aria: "Command" },
        shift: { glyph: "⇧", aria: "Shift" },
        control: { glyph: "Ctrl", aria: "Control" },
        ctrl: { glyph: "Ctrl", aria: "Control" },
        alt: { glyph: "Alt", aria: "Alt" },
        enter: { glyph: "⏎", aria: "Enter" },
        return: { glyph: "⏎", aria: "Return" },
        p: { glyph: "P", aria: "P" },
        period: { glyph: ".", aria: "Period" },
    };

    const resolveShortcutKeys = (entry) => {
        const keys = isApplePlatform ? entry.macKeys : entry.otherKeys;
        return Array.isArray(keys) && keys.length ? [...keys] : [];
    };

    const resolveKeyDisplay = (token) => {
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

    function buildShortcutKeyGroup(tokens) {
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

    function injectQueueShortcutsIntoList(list) {
        if (!(list instanceof HTMLDListElement)) return;
        if (list.querySelector('[data-cq-shortcut-origin="queue"]')) return;
        const shortcuts = KEYBOARD_SHORTCUT_ENTRIES.map((entry) => ({
            id: entry.id,
            label: entry.label,
            keys: resolveShortcutKeys(entry),
        })).filter((entry) => entry.keys.length > 0);
        if (!shortcuts.length) return;
        const fragment = document.createDocumentFragment();
        const heading = document.createElement("dt");
        heading.className =
            "text-token-text-tertiary col-span-2 mt-2 empty:hidden";
        heading.dataset.cqShortcutOrigin = "queue";
        heading.textContent = KEYBOARD_SHORTCUT_SECTION_LABEL;
        fragment.appendChild(heading);
        shortcuts.forEach((shortcut) => {
            const dt = document.createElement("dt");
            dt.dataset.cqShortcutOrigin = "queue";
            dt.textContent = shortcut.label;
            fragment.appendChild(dt);
            const dd = document.createElement("dd");
            dd.dataset.cqShortcutOrigin = "queue";
            dd.className = "text-token-text-secondary justify-self-end";
            dd.appendChild(buildShortcutKeyGroup(shortcut.keys));
            fragment.appendChild(dd);
        });
        list.appendChild(fragment);
    }

    function findShortcutListFromHeading(heading) {
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
        const seen = new Set();
        const headings = document.querySelectorAll("h2");
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

    const makeId = () =>
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const normalizeAttachment = (attachment) => {
        if (!attachment || typeof attachment !== "object") return null;
        const id =
            typeof attachment.id === "string" && attachment.id
                ? attachment.id
                : makeId();
        const name =
            typeof attachment.name === "string" && attachment.name
                ? attachment.name
                : `image-${id}.png`;
        const mime =
            typeof attachment.mime === "string" && attachment.mime
                ? attachment.mime
                : "image/png";
        const dataUrl =
            typeof attachment.dataUrl === "string" ? attachment.dataUrl : null;
        if (!dataUrl) return null;
        return { id, name, mime, dataUrl };
    };

    const normalizeEntry = (entry) => {
        if (typeof entry === "string")
            return {
                text: entry,
                attachments: [],
                model: null,
                modelLabel: null,
            };
        if (!entry || typeof entry !== "object")
            return {
                text: String(entry ?? ""),
                attachments: [],
                model: null,
                modelLabel: null,
            };
        const text =
            typeof entry.text === "string"
                ? entry.text
                : String(entry.text ?? "");
        const attachments = Array.isArray(entry.attachments)
            ? entry.attachments
                  .map((item) => normalizeAttachment(item))
                  .filter(Boolean)
            : [];
        const model =
            typeof entry.model === "string" && entry.model ? entry.model : null;
        const modelLabel =
            typeof entry.modelLabel === "string" && entry.modelLabel
                ? entry.modelLabel
                : null;
        return { text, attachments, model, modelLabel };
    };

    const cloneAttachment = (attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mime: attachment.mime,
        dataUrl: attachment.dataUrl,
    });

    const cloneEntry = (entry) => ({
        text: entry.text,
        attachments: Array.isArray(entry.attachments)
            ? entry.attachments.map((att) => cloneAttachment(att))
            : [],
        model: entry.model || null,
        modelLabel: entry.modelLabel || null,
    });

    const readFileAsDataUrl = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () =>
                reject(reader.error || new Error("Failed to read file"));
            reader.readAsDataURL(file);
        });

    const createAttachmentFromFile = async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        return normalizeAttachment({
            id: makeId(),
            name:
                file.name ||
                `image-${makeId()}.${(file.type.split("/")[1] || "png").split(";")[0]}`,
            mime: file.type || "image/png",
            dataUrl,
        });
    };

    const collectImagesFromDataTransfer = async (dataTransfer) => {
        if (!dataTransfer) return [];
        const items = Array.from(dataTransfer.items || []);
        const files = items
            .filter(
                (item) =>
                    item.kind === "file" && item.type.startsWith("image/"),
            )
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (files.length === 0 && dataTransfer.files?.length) {
            Array.from(dataTransfer.files).forEach((file) => {
                if (file.type.startsWith("image/")) files.push(file);
            });
        }
        if (files.length === 0) return [];
        const attachments = [];
        for (const file of files) {
            try {
                const attachment = await createAttachmentFromFile(file);
                if (attachment) attachments.push(attachment);
            } catch (_) {
                // ignore file read errors
            }
        }
        return attachments;
    };

    const hasImagesInDataTransfer = (dataTransfer) => {
        if (!dataTransfer) return false;
        const items = Array.from(dataTransfer.items || []);
        if (
            items.some(
                (item) =>
                    item.kind === "file" && item.type.startsWith("image/"),
            )
        )
            return true;
        const files = Array.from(dataTransfer.files || []);
        return files.some((file) => file.type.startsWith("image/"));
    };

    const attachmentToFile = async (attachment) => {
        try {
            const normalized = normalizeAttachment(attachment);
            if (!normalized) return null;
            const response = await fetch(normalized.dataUrl);
            const blob = await response.blob();
            const mime = normalized.mime || blob.type || "image/png";
            const extension = mime.split("/")[1] || "png";
            const safeName =
                normalized.name || `image-${makeId()}.${extension}`;
            return new File([blob], safeName, { type: mime });
        } catch (error) {
            return null;
        }
    };

    const ATTACHMENT_SELECTORS = [
        '[data-testid="attachment-item"]',
        '[data-testid="chat-composer-attachment-item"]',
        '[data-testid="uploaded-file"]',
        '[data-testid="file-preview"]',
        '[data-testid="composer-upload-item"]',
        '[data-testid="attachment-preview"]',
    ];

    const countComposerAttachments = (root) => {
        if (!root) return 0;
        for (const selector of ATTACHMENT_SELECTORS) {
            const nodes = root.querySelectorAll(selector);
            if (nodes.length) return nodes.length;
        }
        const fallback = root.querySelectorAll('img[src^="blob:"]');
        return fallback.length;
    };

    const ATTACHMENT_REMOVE_SELECTORS = [
        'button[data-testid="attachment-item-remove"]',
        'button[data-testid="composer-upload-item-remove"]',
        'button[aria-label^="Remove"]',
        'button[aria-label^="Delete"]',
    ];

    const gatherComposerAttachments = async (root) => {
        if (!root) return [];
        const attachments = [];
        const inputs = Array.from(
            root.querySelectorAll('input[type="file"]'),
        ).filter((input) => input instanceof HTMLInputElement);
        for (const input of inputs) {
            const files = Array.from(input.files || []);
            for (const file of files) {
                if (!(file instanceof File)) continue;
                try {
                    const attachment = await createAttachmentFromFile(file);
                    if (attachment) attachments.push(attachment);
                } catch (_) {
                    /* noop */
                }
            }
        }
        const blobImages = Array.from(
            root.querySelectorAll('img[src^="blob:"]'),
        );
        if (blobImages.length && attachments.length >= blobImages.length) {
            return attachments;
        }
        const seenDataUrls = new Set(
            attachments.map((attachment) => attachment.dataUrl),
        );
        for (const img of blobImages) {
            const src = img.getAttribute("src");
            if (!src) continue;
            try {
                const response = await fetch(src);
                const blob = await response.blob();
                const mime = blob.type || "image/png";
                const extension = mime.split("/")[1] || "png";
                const file = new File(
                    [blob],
                    `image-${makeId()}.${extension}`,
                    { type: mime },
                );
                const attachment = await createAttachmentFromFile(file);
                if (attachment && !seenDataUrls.has(attachment.dataUrl)) {
                    attachments.push(attachment);
                    seenDataUrls.add(attachment.dataUrl);
                }
            } catch (_) {
                /* noop */
            }
        }
        return attachments;
    };

    const clearComposerAttachments = (root) => {
        if (!root) return;
        const removeQuery = ATTACHMENT_REMOVE_SELECTORS.join(",");
        ATTACHMENT_SELECTORS.forEach((selector) => {
            root.querySelectorAll(selector).forEach((node) => {
                if (!(node instanceof HTMLElement)) return;
                const removeButton = removeQuery
                    ? node.querySelector(removeQuery)
                    : null;
                if (removeButton instanceof HTMLElement) {
                    removeButton.click();
                }
            });
        });
        root.querySelectorAll('input[type="file"]').forEach((input) => {
            if (!(input instanceof HTMLInputElement)) return;
            if (!input.value) return;
            try {
                input.value = "";
                input.dispatchEvent(new Event("change", { bubbles: true }));
            } catch (_) {
                /* noop */
            }
        });
    };

    const waitForAttachmentsReady = (
        root,
        baseCount,
        expectedIncrease,
        timeoutMs = 4000,
    ) =>
        new Promise((resolve) => {
            if (!expectedIncrease) {
                resolve(true);
                return;
            }
            const target = baseCount + expectedIncrease;
            let settled = false;
            let observer;
            let poll;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                observer?.disconnect();
                if (poll) clearInterval(poll);
                resolve(result);
            };
            observer = new MutationObserver(() => {
                if (countComposerAttachments(root) >= target) finish(true);
            });
            observer.observe(root, { childList: true, subtree: true });
            poll = setInterval(() => {
                if (countComposerAttachments(root) >= target) finish(true);
            }, 150);
            setTimeout(() => finish(false), timeoutMs);
        });

    const escapeCss = (value) => {
        const str = String(value ?? "");
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
            return CSS.escape(str);
        return str.replace(/[^a-zA-Z0-9_\-]/g, (ch) => `\\${ch}`);
    };

    const normalizeModelId = (value) =>
        String(value ?? "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");

    let currentModelId = null;
    let currentModelLabel = "";
    let modelsPromise = null;
    let composerControlGroup = null;
    let composerQueueButton = null;
    let composerHoldButton = null;

    const getModelNodeLabel = (node) => {
        if (!node) return "";
        const text = node.textContent || "";
        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        return lines[0] || text.trim();
    };

    const findModelMenuRoot = () => {
        const selectors = [
            "[data-radix-menu-content]",
            "[data-radix-dropdown-menu-content]",
            '[role="menu"]',
            '[role="listbox"]',
        ];
        for (const root of document.querySelectorAll(selectors.join(","))) {
            if (!(root instanceof HTMLElement)) continue;
            if (root.querySelector('[data-testid^="model-switcher-"]'))
                return root;
        }
        return null;
    };

    const waitForModelMenu = (timeoutMs = 1500) =>
        new Promise((resolve) => {
            const start = performance.now();
            const tick = () => {
                const root = findModelMenuRoot();
                if (root) {
                    resolve(root);
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

    const useModelMenu = async (operation) => {
        const button = document.querySelector(
            'button[data-testid="model-switcher-dropdown-button"]',
        );
        if (!button) return null;
        const wasOpen =
            button.getAttribute("aria-expanded") === "true" ||
            button.dataset.state === "open";
        if (!wasOpen) button.click();
        const menu = await waitForModelMenu();
        if (!menu) {
            if (!wasOpen) button.click();
            return null;
        }
        let result;
        try {
            result = await operation(menu, button);
        } finally {
            if (!wasOpen) {
                const stillOpen =
                    button.getAttribute("aria-expanded") === "true" ||
                    button.dataset.state === "open";
                if (stillOpen) button.click();
            }
        }
        return result;
    };

    const getModelById = (id) => {
        if (!id) return null;
        const normalized = normalizeModelId(id);
        return (
            STATE.models.find(
                (model) => normalizeModelId(model.id) === normalized,
            ) || null
        );
    };

    const labelForModel = (id, fallback = "") => {
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

    const setCurrentModel = (id, label = "") => {
        currentModelId = id || null;
        if (!id) {
            currentModelLabel = label || "";
            return;
        }
        const info = getModelById(id);
        currentModelLabel = label || info?.label || currentModelLabel || id;
    };

    const markModelSelected = (id, label = "") => {
        if (!id) return;
        const normalized = normalizeModelId(id);
        let found = false;
        STATE.models = STATE.models.map((model) => {
            const match = normalizeModelId(model.id) === normalized;
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
            STATE.models.push({ id, label: label || id, selected: true });
        }
        setCurrentModel(id, labelForModel(id, label));
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
        if (updated) save();
        return updated;
    };

    const parseModelItems = (menu) => {
        const items = [];
        const seen = new Set();
        const candidates = menu.querySelectorAll(
            '[role="menuitem"][data-testid]',
        );
        candidates.forEach((item) => {
            if (!(item instanceof HTMLElement)) return;
            if (seen.has(item)) return;
            seen.add(item);
            const testId = item.getAttribute("data-testid") || "";
            if (!testId.startsWith("model-switcher-")) return;
            const id = testId.replace(/^model-switcher-/, "");
            if (!id || id.endsWith("-submenu")) return;
            const disabled =
                item.getAttribute("aria-disabled") === "true" ||
                item.matches('[data-disabled="true"]');
            if (disabled) return;
            const label = getModelNodeLabel(item) || id;
            const hasCheckIcon = !!item.querySelector(
                '.trailing svg, [data-testid="check-icon"], svg[aria-hidden="false"]',
            );
            const selected =
                item.getAttribute("data-state") === "checked" ||
                item.getAttribute("aria-checked") === "true" ||
                item.getAttribute("aria-pressed") === "true" ||
                hasCheckIcon;
            items.push({ id, label, selected });
        });
        return items;
    };

    const mergeModelOptions = (options) => {
        const map = new Map();
        options.forEach((option) => {
            const key = normalizeModelId(option.id);
            const existing = map.get(key);
            if (!existing || option.selected) {
                map.set(key, { ...option, id: option.id });
            }
        });
        return Array.from(map.values());
    };

    const fetchModelOptions = async () => {
        const result = await useModelMenu(async (menu) =>
            parseModelItems(menu),
        );
        if (!Array.isArray(result)) return [];
        return mergeModelOptions(result);
    };

    const ensureModelOptions = async (options = {}) => {
        if (!options.force && STATE.models.length) return STATE.models;
        if (modelsPromise) return modelsPromise;
        modelsPromise = (async () => {
            const models = await fetchModelOptions();
            modelsPromise = null;
            if (!models.length) return STATE.models;
            const previousSignature = JSON.stringify(
                STATE.models.map((model) => ({
                    id: model.id,
                    label: model.label,
                })),
            );
            STATE.models = models;
            const selected = models.find((model) => model.selected);
            if (selected) {
                markModelSelected(selected.id, selected.label);
            } else if (models.length && !currentModelId) {
                markModelSelected(models[0].id, models[0].label);
            }
            const queueUpdated = applyDefaultModelToQueueIfMissing();
            const newSignature = JSON.stringify(
                models.map((model) => ({ id: model.id, label: model.label })),
            );
            if (queueUpdated || newSignature !== previousSignature) {
                refreshAll();
            }
            return STATE.models;
        })().catch((error) => {
            modelsPromise = null;
            console.warn("[cq] Failed to load model list", error);
            return STATE.models;
        });
        return modelsPromise;
    };

    const findModelMenuItem = (menu, modelId) => {
        if (!menu || !modelId) return null;
        const direct = menu.querySelector(
            `[role="menuitem"][data-testid="model-switcher-${escapeCss(modelId)}"]`,
        );
        if (direct) return direct;
        const normalized = normalizeModelId(modelId);
        const candidates = Array.from(
            menu.querySelectorAll(
                '[role="menuitem"][data-testid^="model-switcher-"]',
            ),
        );
        for (const candidate of candidates) {
            const tid = candidate.getAttribute("data-testid") || "";
            const id = tid.replace(/^model-switcher-/, "");
            if (normalizeModelId(id) === normalized) return candidate;
        }
        const info = getModelById(modelId);
        if (info?.label) {
            const labelNormalized = normalizeModelId(info.label);
            for (const candidate of candidates) {
                const label = getModelNodeLabel(candidate);
                if (normalizeModelId(label) === labelNormalized)
                    return candidate;
            }
        }
        return null;
    };

    const ensureModel = async (modelId) => {
        if (!modelId) return true;
        await ensureModelOptions();
        const targetNormalized = normalizeModelId(modelId);
        if (
            targetNormalized &&
            normalizeModelId(currentModelId) === targetNormalized
        )
            return true;
        const result = await useModelMenu(async (menu) => {
            const item = findModelMenuItem(menu, modelId);
            if (!item) return false;
            const label = getModelNodeLabel(item) || modelId;
            item.click();
            await sleep(120);
            markModelSelected(modelId, label);
            return true;
        });
        return !!result;
    };

    function injectBridge() {
        if (document.getElementById("cq-bridge")) return;
        const url = chrome.runtime?.getURL?.("bridge.js");
        if (!url) return;
        const s = document.createElement("script");
        s.id = "cq-bridge";
        s.src = url;
        s.type = "text/javascript";
        s.addEventListener("error", () => s.remove());
        (document.head || document.documentElement).appendChild(s);
    }

    injectBridge();

    // UI -----------------------------------------------------------------------
    document.getElementById("cq-ui")?.remove();
    document.getElementById("cq-dock")?.remove();

    const ui = document.createElement("div");
    ui.id = "cq-ui";
    ui.innerHTML = `
    <div class="cq-shell">
      <div class="cq-inline-header">
        <div class="cq-inline-meta">
          <button id="cq-collapse-toggle" class="cq-collapse-toggle" type="button" aria-label="Collapse queue" aria-expanded="true">
            <span class="cq-collapse-toggle__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" focusable="false">
                <path d="M12.1338 5.94433C12.3919 5.77382 12.7434 5.80202 12.9707 6.02929C13.1979 6.25656 13.2261 6.60807 13.0556 6.8662L12.9707 6.9707L8.47067 11.4707C8.21097 11.7304 7.78896 11.7304 7.52926 11.4707L3.02926 6.9707L2.9443 6.8662C2.77379 6.60807 2.80199 6.25656 3.02926 6.02929C3.25653 5.80202 3.60804 5.77382 3.86617 5.94433L3.97067 6.02929L7.99996 10.0586L12.0293 6.02929L12.1338 5.94433Z"></path>
              </svg>
            </span>
            <span id="cq-label" class="cq-label" aria-live="polite">0 follow-ups</span>
          </button>
          <span id="cq-state" class="cq-state" aria-live="polite">Idle</span>
        </div>
        <div class="cq-inline-actions">
          <button id="cq-pause-toggle" class="cq-pause-toggle" type="button" aria-pressed="false" aria-label="Pause queue" data-state="active">
            <span class="cq-pause-toggle__icon" aria-hidden="true">
              <svg class="cq-pause-toggle__icon-state cq-pause-toggle__icon-state--pause" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" focusable="false">
                <path d="M5 3.25C4.58579 3.25 4.25 3.58579 4.25 4V12C4.25 12.4142 4.58579 12.75 5 12.75H6.5C6.91421 12.75 7.25 12.4142 7.25 12V4C7.25 3.58579 6.91421 3.25 6.5 3.25H5ZM9.5 3.25C9.08579 3.25 8.75 3.58579 8.75 4V12C8.75 12.4142 9.08579 12.75 9.5 12.75H11C11.4142 12.75 11.75 12.4142 11.75 12V4C11.75 3.58579 11.4142 3.25 11 3.25H9.5Z"></path>
              </svg>
              <svg class="cq-pause-toggle__icon-state cq-pause-toggle__icon-state--resume" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" focusable="false">
                <path d="M4.5 3.5C4.5 3.08579 4.83579 2.75 5.25 2.75C5.37798 2.75 5.50362 2.78404 5.61394 2.84837L12.1139 6.34837C12.4517 6.54208 12.5663 6.97906 12.3726 7.3169C12.3077 7.42946 12.2139 7.52332 12.1013 7.58826L5.60134 11.3383C5.2645 11.532 4.82752 11.4174 4.63381 11.0805C4.56948 10.9702 4.53544 10.8446 4.53544 10.7166V3.5H4.5Z"></path>
              </svg>
            </span>
            <span id="cq-pause-label" class="cq-pause-toggle__label">Pause queue</span>
          </button>
        </div>
      </div>
      <div id="cq-list" class="cq-queue" aria-label="Queued prompts"></div>
    </div>`;

    const $ = (selector) => ui.querySelector(selector);
    const elState = $("#cq-state");
    const list = $("#cq-list");
    const collapseToggle = $("#cq-collapse-toggle");
    const inlineHeader = $(".cq-inline-header");
    const pauseToggle = $("#cq-pause-toggle");
    const pauseLabel = $("#cq-pause-label");
    const queueLabel = $("#cq-label");
    ui.setAttribute("aria-hidden", "true");

    const formatFollowUpLabel = (count) =>
        `${count} follow-up${count === 1 ? "" : "s"}`;

    const refreshQueueLabel = () => {
        if (!queueLabel) return;
        queueLabel.textContent = formatFollowUpLabel(STATE.queue.length);
    };

    const getQueueRows = () =>
        Array.from(list?.querySelectorAll?.(".cq-row") || []);

    const focusQueueRow = (row) => {
        if (!(row instanceof HTMLElement)) return false;
        const textarea = row.querySelector(".cq-row-text");
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

    let saveTimer;
    let hydrated = false; // gate UI visibility until persisted state is loaded
    let dragIndex = null;
    let dragOverItem = null;
    let dragOverPosition = null;

    // Persist ------------------------------------------------------------------
    const persistable = () => ({
        running: STATE.running,
        queue: STATE.queue.map((entry) => cloneEntry(entry)),
        collapsed: STATE.collapsed,
        paused: STATE.paused,
        pauseReason: STATE.pauseReason,
        pausedAt: STATE.pausedAt,
    });

    const isContextInvalidatedError = (error) => {
        const message = typeof error === "string" ? error : error?.message;
        return (
            typeof message === "string" &&
            message.includes("Extension context invalidated")
        );
    };

    const save = () => {
        if (!chrome.storage?.local?.set) return;
        try {
            chrome.storage.local.set({ cq: persistable() }, () => {
                const error = chrome.runtime?.lastError;
                if (error && !isContextInvalidatedError(error)) {
                    console.error("cq: failed to persist state", error);
                }
            });
        } catch (error) {
            if (isContextInvalidatedError(error)) return;
            console.error("cq: failed to persist state", error);
        }
    };
    const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            save();
        }, 150);
    };

    const load = () =>
        new Promise((resolve) => {
            const applyState = (cq) => {
                if (cq) {
                    STATE.running = false; // Always queue mode, never auto-send
                    STATE.queue = Array.isArray(cq.queue)
                        ? cq.queue.map((item) => normalizeEntry(item))
                        : [];
                    STATE.collapsed =
                        typeof cq.collapsed === "boolean"
                            ? cq.collapsed
                            : false;
                    STATE.paused =
                        typeof cq.paused === "boolean" ? cq.paused : false;
                    STATE.pauseReason =
                        typeof cq.pauseReason === "string"
                            ? cq.pauseReason
                            : "";
                    STATE.pausedAt =
                        typeof cq.pausedAt === "number" ? cq.pausedAt : null;
                }
                refreshAll();
                hydrated = true;
                refreshVisibility();
                resolve();
            };

            if (chrome.storage?.local?.get) {
                try {
                    chrome.storage.local.get(["cq"], ({ cq }) => {
                        const error = chrome.runtime?.lastError;
                        if (error) {
                            if (!isContextInvalidatedError(error)) {
                                console.error(
                                    "cq: failed to load persisted state",
                                    error,
                                );
                            }
                            applyState(null);
                            return;
                        }
                        applyState(cq);
                    });
                } catch (error) {
                    if (isContextInvalidatedError(error)) {
                        applyState(null);
                    } else {
                        console.error(
                            "cq: failed to load persisted state",
                            error,
                        );
                        applyState(null);
                    }
                }
            } else {
                applyState(null);
            }
        });

    // DOM helpers ---------------------------------------------------------------
    const q = (selector, root = document) => {
        if (!root || typeof root.querySelector !== "function") return null;
        try {
            return root.querySelector(selector);
        } catch (_) {
            return null;
        }
    };
    const isVisible = (node) =>
        node instanceof HTMLElement && node.offsetParent !== null;
    const findSendButton = (root) => {
        if (!root) return null;
        const candidates = root.querySelectorAll(SEL.send);
        for (const candidate of candidates) {
            if (candidate instanceof HTMLElement && isVisible(candidate))
                return candidate;
        }
        const fallback = candidates[0];
        return fallback instanceof HTMLElement ? fallback : null;
    };
    const composer = () => {
        const preset = q(SEL.composer);
        if (preset) return preset;
        const sendButton = q(SEL.send);
        if (sendButton) {
            const scoped = sendButton.closest(
                "form, [data-testid], [data-type], [class]",
            );
            if (scoped) return scoped;
        }
        const ed = findEditor();
        return ed?.closest("form, [data-testid], [data-type], [class]") || null;
    };
    const isGenerating = () => !!q(SEL.stop, composer());

    function findEditor() {
        return q(SEL.editor);
    }

    function editorView() {
        const ed = findEditor();
        if (!ed) return null;
        return ed.pmViewDesc?.editorView || ed._pmViewDesc?.editorView || null;
    }

    function setPrompt(text) {
        return new Promise((resolve) => {
            const onMsg = (e) => {
                if (
                    e.source === window &&
                    e.data &&
                    e.data.type === "CQ_SET_PROMPT_DONE"
                ) {
                    window.removeEventListener("message", onMsg);
                    resolve(true);
                }
            };
            window.addEventListener("message", onMsg);
            window.postMessage({ type: "CQ_SET_PROMPT", text }, "*");

            // safety timeout
            setTimeout(() => {
                window.removeEventListener("message", onMsg);
                resolve(false);
            }, 1500);
        });
    }

    function clickStop() {
        const button = q(SEL.stop, composer());
        if (button) button.click();
    }

    function clickSend() {
        const button = q(SEL.send, composer());
        if (button) button.click();
    }

    async function applyAttachments(attachments) {
        if (!attachments || attachments.length === 0) return true;
        if (typeof DataTransfer === "undefined") return false;
        const root = composer();
        if (!root) return false;
        const inputSelector =
            'input[type="file"][accept*="image"], input[type="file"][accept*="png"], input[type="file"][accept*="jpg"], input[type="file"][accept*="jpeg"], input[type="file"][accept*="webp"], input[type="file"]';
        let input = root.querySelector(inputSelector);
        if (!input) {
            const trigger = root.querySelector(
                'button[data-testid="file-upload-button"], button[aria-label="Upload files"], button[aria-label="Add file"], button[aria-label="Add files"], button[data-testid="upload-button"]',
            );
            if (trigger) {
                trigger.click();
                await sleep(60);
                input = root.querySelector(inputSelector);
            }
        }
        if (!input) return false;

        const baseCount = countComposerAttachments(root);
        const dataTransfer = new DataTransfer();
        for (const attachment of attachments) {
            const file = await attachmentToFile(attachment);
            if (file) dataTransfer.items.add(file);
        }
        if (dataTransfer.items.length === 0) return true;

        try {
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            await waitForAttachmentsReady(
                root,
                baseCount,
                dataTransfer.items.length,
            );
            await sleep(120);
            return true;
        } catch (error) {
            return false;
        }
    }

    function refreshControls(generatingOverride) {
        const generating =
            typeof generatingOverride === "boolean"
                ? generatingOverride
                : isGenerating();
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
        if (!composerQueueButton || !composerQueueButton.isConnected) {
            composerQueueButton = null;
        }
        if (!composerHoldButton || !composerHoldButton.isConnected) {
            composerHoldButton = null;
        }
        ensureComposerControls();
        const promptHasContent = hasComposerPrompt();
        const hasQueueItems = STATE.queue.length > 0;
        const showComposerGroup = !promptHasContent || !hasQueueItems;
        if (composerControlGroup) {
            composerControlGroup.hidden = false;
        }
        if (composerQueueButton) {
            composerQueueButton.disabled = !promptHasContent;
        }
        if (composerHoldButton) {
            const showHold = promptHasContent && !hasQueueItems;
            composerHoldButton.hidden = !showHold;
            composerHoldButton.disabled = !promptHasContent;
        }
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
            pauseToggle.title = `${STATE.paused ? "Resume" : "Pause"} queue (${PAUSE_SHORTCUT_LABEL})`;
        }
        if (pauseLabel) {
            pauseLabel.textContent = STATE.paused
                ? "Resume queue"
                : "Pause queue";
        }
        ui.classList.toggle("is-busy", STATE.busy);
        ui.classList.toggle("is-paused", STATE.paused);
        if (list) {
            list.querySelectorAll('button[data-action="send"]').forEach(
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
    }

    function refreshVisibility() {
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
        if (collapseToggle?.parentElement?.classList.contains("cq-inline-meta")) {
            const header = collapseToggle.closest(".cq-inline-header");
            if (header) {
                header.classList.toggle("is-collapsed", STATE.collapsed);
            }
        }
        if (list) {
            list.classList.toggle("is-collapsed", STATE.collapsed);
            list.setAttribute(
                "aria-hidden",
                STATE.collapsed ? "true" : "false",
            );
        }
    }

    function setCollapsed(collapsed, persist = true) {
        STATE.collapsed = !!collapsed;
        refreshVisibility();
        refreshControls();
        if (persist) save();
    }

    const normalizePauseReason = (value) =>
        typeof value === "string" ? value.trim() : "";

    function setPaused(next, { reason } = {}) {
        const target = !!next;
        const normalizedReason = target ? normalizePauseReason(reason) : "";
        const alreadyMatched =
            STATE.paused === target &&
            (target ? STATE.pauseReason === normalizedReason : true);
        if (alreadyMatched) return;
        STATE.paused = target;
        if (STATE.paused) {
            STATE.pauseReason = normalizedReason;
            STATE.pausedAt = Date.now();
            cancelAutoDispatch();
        } else {
            STATE.pauseReason = "";
            STATE.pausedAt = null;
        }
        refreshControls();
        save();
        if (!STATE.paused) {
            maybeAutoDispatch(120);
        }
    }

    function togglePaused(reason) {
        if (!hydrated) return;
        setPaused(!STATE.paused, { reason });
    }

    function autoSize(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) return;
        textarea.style.height = "auto";
        const height = Math.min(200, textarea.scrollHeight || 24);
        textarea.style.height = `${height}px`;
    }

    function insertTextAtCursor(textarea, text) {
        if (!textarea || typeof text !== "string" || text.length === 0) return;
        const { selectionStart, selectionEnd, value } = textarea;
        const before = value.slice(0, selectionStart);
        const after = value.slice(selectionEnd);
        const nextValue = `${before}${text}${after}`;
        const cursor = before.length + text.length;
        textarea.value = nextValue;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    let controlRefreshPending = false;
    function scheduleControlRefresh() {
        if (controlRefreshPending) return;
        controlRefreshPending = true;
        requestAnimationFrame(() => {
            controlRefreshPending = false;
            refreshControls();
        });
    }

    let autoDispatchTimer = null;
    let pendingManualSend = null;

    function shouldAutoDispatch() {
        if (pendingManualSend) return false;
        if (STATE.busy) return false;
        if (STATE.paused) return false;
        if (isGenerating()) return false;
        if (STATE.queue.length === 0) return false;
        if (!composer()) return false;
        if (hasComposerPrompt()) return false;
        return true;
    }

    function cancelAutoDispatch() {
        if (autoDispatchTimer) {
            clearTimeout(autoDispatchTimer);
            autoDispatchTimer = null;
        }
    }

    function maybeAutoDispatch(delay = 120) {
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
    }

    function requestSend(index, { manual = false } = {}) {
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
    }
    function ensureMounted() {
        const root = composer();
        if (!root) return;
        ensureComposerControls(root);
        ensureComposerInputListeners(root);
        let container = root.closest("#thread-bottom-container");
        if (!container) {
            // walk up until we hit something that looks like the prompt container
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
        let anchor = container.querySelector("#thread-bottom");
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
            return;
        }
        if (
            ui.parentElement !== container ||
            ui.nextElementSibling !== anchor
        ) {
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

    function deriveQueueButtonClasses(sendButton) {
        const baseTokens = new Set([
            "cq-composer-queue-btn",
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
        if (sendButton instanceof HTMLElement) {
            (sendButton.className || "").split(/\s+/).forEach((token) => {
                if (!token) return;
                if (
                    token.startsWith("dark:") ||
                    token.startsWith("light:") ||
                    token.startsWith("focus-visible:")
                ) {
                    baseTokens.add(token);
                }
            });
        }
        return Array.from(baseTokens).join(" ");
    }

    function ensureComposerControls(rootParam) {
        const root = rootParam || composer();
        if (!root) return;
        const sendButton = findSendButton(root);
        const voiceButton = q(SEL.voice, root);

        const resolveAnchor = (node) => {
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
        if (
            parent instanceof HTMLElement &&
            parent.getAttribute("data-testid") ===
                "composer-speech-button-container"
        ) {
            anchor = parent;
            parent = parent.parentElement;
        }
        if (!parent) {
            const candidate = root.querySelector(
                '[data-testid="composer-speech-button-container"], [data-testid="composer-actions"], [data-testid="composer-toolbar"], [data-testid="composer-bottom-buttons"], [data-testid="composer-controls"]',
            );
            if (candidate instanceof HTMLElement) {
                parent = candidate;
                anchor =
                    Array.from(candidate.children).find(
                        (node) => node instanceof HTMLElement,
                    ) || null;
            }
        }
        if (!(parent instanceof HTMLElement)) return;
        if (!composerControlGroup || !composerControlGroup.isConnected) {
            composerControlGroup = document.createElement("div");
            composerControlGroup.id = "cq-composer-controls";
            composerControlGroup.className = "cq-composer-controls";
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
        <span class="cq-composer-queue-btn__icon" aria-hidden="true">
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
                queueFromComposer();
            });
            composerQueueButton = queueBtn;
        }

        if (!composerHoldButton) {
            const pauseBtn = document.createElement("button");
            pauseBtn.type = "button";
            pauseBtn.id = "cq-composer-hold-btn";
            pauseBtn.className = "cq-composer-hold-btn";
            pauseBtn.setAttribute(
                "aria-label",
                "Add to queue and pause queue",
            );
            pauseBtn.title = "Add to queue and pause";
            pauseBtn.innerHTML = `
        <span class="cq-composer-hold-btn__icon" aria-hidden="true">
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
                queueFromComposer({ hold: true });
            });
            pauseBtn.hidden = true;
            composerHoldButton = pauseBtn;
        }

        const classSource =
            (sendButton instanceof HTMLElement && sendButton) ||
            (voiceButton instanceof HTMLElement && voiceButton) ||
            (anchor instanceof HTMLElement ? anchor : null);
        const sharedClasses = deriveQueueButtonClasses(classSource);
        composerQueueButton.className = sharedClasses;
        composerHoldButton.className = `${sharedClasses} cq-composer-hold-btn`;

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
    }

    function ensureComposerInputListeners(rootParam) {
        const root = rootParam || composer();
        if (!root) return;
        const ed = findEditor();
        if (!ed || ed.dataset.cqQueueBound === "true") return;
        const notify = () => scheduleControlRefresh();
        ["input", "keyup", "paste", "cut", "compositionend"].forEach(
            (eventName) => {
                ed.addEventListener(eventName, notify);
            },
        );
        ed.dataset.cqQueueBound = "true";
    }

    if (collapseToggle) {
        collapseToggle.addEventListener("click", (event) => {
            event.preventDefault();
            setCollapsed(!STATE.collapsed);
        });
    }

    if (inlineHeader) {
        inlineHeader.addEventListener("click", (event) => {
            if (event.target !== inlineHeader) return;
            setCollapsed(!STATE.collapsed);
        });
    }

    if (pauseToggle) {
        pauseToggle.addEventListener("click", (event) => {
            event.preventDefault();
            togglePaused();
        });
    }


    function addAttachmentsToEntry(index, attachments) {
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
        refreshAll();
    }

    function removeEntryAttachment(index, id) {
        const entry = STATE.queue[index];
        if (!entry || !Array.isArray(entry.attachments)) return;
        const next = entry.attachments.filter(
            (attachment) => attachment.id !== id,
        );
        if (next.length !== entry.attachments.length) {
            entry.attachments = next;
            save();
            refreshAll();
        }
    }

    function createAttachmentNode(attachment, { entryIndex } = {}) {
        const wrapper = document.createElement("div");
        wrapper.className = "cq-media";
        wrapper.dataset.attachmentId = attachment.id;
        if (typeof entryIndex === "number")
            wrapper.dataset.entryIndex = String(entryIndex);

        const thumb = document.createElement("img");
        thumb.className = "cq-media__thumb";
        thumb.src = attachment.dataUrl;
        thumb.alt = attachment.name || "Image attachment";
        thumb.loading = "lazy";
        wrapper.appendChild(thumb);

        const meta = document.createElement("div");
        meta.className = "cq-media__meta";
        meta.textContent = attachment.name || "Image";
        meta.title = attachment.name || "";
        wrapper.appendChild(meta);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "cq-media__remove";
        remove.dataset.attachmentRemove = attachment.id;
        if (typeof entryIndex === "number") {
            remove.dataset.entryIndex = String(entryIndex);
        }
        remove.textContent = "Remove";
        wrapper.appendChild(remove);

        return wrapper;
    }

    function handleAttachmentPaste(event, { type, index, textarea }) {
        const dataTransfer = event.clipboardData;
        if (!hasImagesInDataTransfer(dataTransfer)) return;
        event.preventDefault();
        const plain = dataTransfer?.getData?.("text/plain") || "";
        if (plain && textarea) {
            insertTextAtCursor(textarea, plain);
        }
        collectImagesFromDataTransfer(dataTransfer)
            .then((attachments) => {
                if (!attachments.length) return;
                if (type === "entry" && typeof index === "number") {
                    addAttachmentsToEntry(index, attachments);
                }
            })
            .catch(() => {});
    }

    function renderQueue(generatingOverride) {
        const generating =
            typeof generatingOverride === "boolean"
                ? generatingOverride
                : isGenerating();
        const canManualSend = !STATE.running && !STATE.busy && !STATE.paused;
        list.textContent = "";
        if (STATE.queue.length === 0) {
            return;
        }

        // Render queue in reverse order (next item at bottom)
        const reversedQueue = [...STATE.queue].reverse();
        const textareasToSize = [];
        reversedQueue.forEach((entry, reversedIndex) => {
            const index = STATE.queue.length - 1 - reversedIndex;
            const row = document.createElement("div");
            row.className = "cq-row";
            row.classList.add("shadow-short");
            row.dataset.index = String(index);
            if (index === STATE.queue.length - 1)
                row.classList.add("cq-row--next");
            row.draggable = true;

            const indicator = document.createElement("input");
            indicator.type = "text";
            indicator.inputMode = "numeric";
            indicator.enterKeyHint = "done";
            indicator.autocomplete = "off";
            indicator.spellcheck = false;
            indicator.className = "cq-row-indicator";
            indicator.value = String(index + 1);
            indicator.setAttribute(
                "aria-label",
                "Move follow-up to new position",
            );
            indicator.title = "Reorder follow-up";
            indicator.draggable = false;

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
            row.appendChild(indicator);

            const body = document.createElement("div");
            body.className = "cq-row-body";

            const textarea = document.createElement("textarea");
            textarea.className = "cq-row-text";
            textarea.value = entry.text;
            textarea.placeholder = "Empty follow-up";
            textarea.spellcheck = true;
            textarea.draggable = false;
            textarea.rows = 1;
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
            body.appendChild(textarea);
            textareasToSize.push(textarea);

            if (entry.attachments.length) {
                const mediaWrap = document.createElement("div");
                mediaWrap.className = "cq-row-media";
                mediaWrap.dataset.entryIndex = String(index);
                entry.attachments.forEach((attachment) => {
                    const mediaNode = createAttachmentNode(attachment, {
                        entryIndex: index,
                    });
                    mediaWrap.appendChild(mediaNode);
                });
                body.appendChild(mediaWrap);
            }

            row.appendChild(body);

            const actions = document.createElement("div");
            actions.className = "cq-row-actions";

            const sendButton = document.createElement("button");
            sendButton.type = "button";
            sendButton.className = "cq-icon-btn cq-icon-btn--send";
            sendButton.dataset.action = "send";
            sendButton.dataset.index = String(index);
            sendButton.setAttribute("aria-label", "Send now");
            sendButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z"></path>
        </svg>`;
            if (!canManualSend) {
                sendButton.disabled = true;
                sendButton.title = STATE.paused
                    ? "Resume queue to send"
                    : "Queue busy";
            } else {
                sendButton.title = "Send now";
            }
            actions.appendChild(sendButton);

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "cq-icon-btn cq-icon-btn--delete";
            deleteButton.dataset.action = "delete";
            deleteButton.dataset.index = String(index);
            deleteButton.setAttribute("aria-label", "Remove follow-up");
            deleteButton.title = "Remove follow-up";
            deleteButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M10.6299 1.33496C12.0335 1.33496 13.2695 2.25996 13.666 3.60645L13.8809 4.33496H17L17.1338 4.34863C17.4369 4.41057 17.665 4.67858 17.665 5C17.665 5.32142 17.4369 5.58943 17.1338 5.65137L17 5.66504H16.6543L15.8574 14.9912C15.7177 16.629 14.3478 17.8877 12.7041 17.8877H7.2959C5.75502 17.8877 4.45439 16.7815 4.18262 15.2939L4.14258 14.9912L3.34668 5.66504H3C2.63273 5.66504 2.33496 5.36727 2.33496 5C2.33496 4.63273 2.63273 4.33496 3 4.33496H6.11914L6.33398 3.60645L6.41797 3.3584C6.88565 2.14747 8.05427 1.33496 9.37012 1.33496H10.6299ZM5.46777 14.8779L5.49121 15.0537C5.64881 15.9161 6.40256 16.5576 7.2959 16.5576H12.7041C13.6571 16.5576 14.4512 15.8275 14.5322 14.8779L15.3193 5.66504H4.68164L5.46777 14.8779ZM7.66797 12.8271V8.66016C7.66797 8.29299 7.96588 7.99528 8.33301 7.99512C8.70028 7.99512 8.99805 8.29289 8.99805 8.66016V12.8271C8.99779 13.1942 8.70012 13.4912 8.33301 13.4912C7.96604 13.491 7.66823 13.1941 7.66797 12.8271ZM11.002 12.8271V8.66016C11.002 8.29289 11.2997 7.99512 11.667 7.99512C12.0341 7.9953 12.332 8.293 12.332 8.66016V12.8271C12.3318 13.1941 12.0339 13.491 11.667 13.4912C11.2999 13.4912 11.0022 13.1942 11.002 12.8271ZM9.37012 2.66504C8.60726 2.66504 7.92938 3.13589 7.6582 3.83789L7.60938 3.98145L7.50586 4.33496H12.4941L12.3906 3.98145C12.1607 3.20084 11.4437 2.66504 10.6299 2.66504H9.37012Z"></path>
        </svg>`;
            actions.appendChild(deleteButton);

            row.appendChild(actions);
            list.appendChild(row);
        });
        if (textareasToSize.length) {
            requestAnimationFrame(() => {
                textareasToSize.forEach((area) => autoSize(area));
            });
        }
    }

    function refreshAll() {
        const generating = isGenerating();
        refreshControls(generating);
        renderQueue(generating);
        refreshVisibility();
    }

    async function waitUntilIdle(timeoutMs = 120000) {
        const root = composer();
        if (!root) return false;

        return new Promise((resolve) => {
            let finished = false;
            let observer;
            let timer;
            const done = () => {
                if (finished) return;
                finished = true;
                observer?.disconnect();
                if (timer !== undefined) clearTimeout(timer);
                setTimeout(() => resolve(true), STATE.cooldownMs);
            };
            const isIdle = () => {
                const stopBtn = q(SEL.stop, root);
                if (
                    stopBtn &&
                    !stopBtn.disabled &&
                    stopBtn.offsetParent !== null
                )
                    return false;
                const sendBtn = q(SEL.send, root);
                if (
                    sendBtn &&
                    !sendBtn.disabled &&
                    sendBtn.offsetParent !== null
                )
                    return true;
                const voiceBtn = q(SEL.voice, root);
                if (
                    voiceBtn &&
                    !voiceBtn.disabled &&
                    voiceBtn.offsetParent !== null
                )
                    return true;
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
    }

    async function waitForSendReady(timeoutMs = 5000) {
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
    }

    async function waitForSendLaunch(timeoutMs = 8000) {
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
            if (
                button.disabled ||
                button.getAttribute("aria-disabled") === "true"
            ) {
                return true;
            }
            await sleep(60);
        }
        return false;
    }

    async function sendFromQueue(index, { allowWhilePaused = false } = {}) {
        if (STATE.busy) return false;
        if (STATE.paused && !allowWhilePaused) return false;
        if (STATE.queue.length === 0) return false;

        // Stop any ongoing generation first
        if (isGenerating()) {
            clickStop();
            // Wait until generation stops before proceeding
            await waitUntilIdle();
        }

        const root = composer();
        if (!root) return false;

        const entry = STATE.queue[index];
        if (!entry) return false;
        const promptText = typeof entry.text === "string" ? entry.text : "";
        const attachments = Array.isArray(entry.attachments)
            ? entry.attachments.slice()
            : [];
        const desiredModel = entry.model || null;

        const [removed] = STATE.queue.splice(index, 1);
        STATE.busy = true;
        STATE.phase = "sending";
        save();
        refreshAll();

        if (desiredModel) {
            const modelApplied = await ensureModel(desiredModel);
            if (!modelApplied) {
                STATE.busy = false;
                STATE.phase = "idle";
                STATE.queue.splice(index, 0, removed);
                refreshAll();
                save();
                return false;
            }
        }

        const textSet = await setPrompt(promptText);
        if (!textSet) {
            STATE.busy = false;
            STATE.phase = "idle";
            STATE.queue.splice(index, 0, removed);
            refreshAll();
            save();
            return false;
        }

        const attachmentsApplied = await applyAttachments(attachments);
        if (!attachmentsApplied) {
            STATE.busy = false;
            STATE.phase = "idle";
            STATE.queue.splice(index, 0, removed);
            refreshAll();
            save();
            return false;
        }

        const readyToSend = await waitForSendReady();
        if (!readyToSend) {
            STATE.busy = false;
            STATE.phase = "idle";
            STATE.queue.splice(index, 0, removed);
            refreshAll();
            save();
            return false;
        }

        clickSend();
        STATE.phase = "waiting";
        refreshControls(true);

        const launched = await waitForSendLaunch();
        if (!launched) {
            STATE.busy = false;
            STATE.phase = "idle";
            STATE.queue.splice(index, 0, removed);
            refreshAll();
            save();
            return false;
        }

        await waitUntilIdle();

        STATE.busy = false;
        STATE.phase = "idle";
        refreshControls();
        save();
        if (STATE.queue.length === 0) {
            cancelAutoDispatch();
        }
        return true;
    }

    function moveItem(from, to) {
        if (to < 0 || to >= STATE.queue.length || from === to) return;
        const [entry] = STATE.queue.splice(from, 1);
        STATE.queue.splice(to, 0, entry);
        save();
        refreshAll();
    }

    function clearDragIndicator() {
        if (dragOverItem) {
            dragOverItem.classList.remove(
                "cq-row--drop-before",
                "cq-row--drop-after",
            );
        }
        dragOverItem = null;
        dragOverPosition = null;
    }

    function getComposerPromptText() {
        const ed = findEditor();
        if (!ed) return "";
        const text = ed.innerText || "";
        return text.replace(/[\u200b\u200c\u200d\uFEFF]/g, "").trim();
    }

    const composerHasAttachments = () => {
        const root = composer();
        return countComposerAttachments(root) > 0;
    };

    function hasComposerPrompt() {
        return getComposerPromptText().length > 0 || composerHasAttachments();
    }

    async function queueComposerInput() {
        const ed = findEditor();
        if (!ed) return false;
        const root = composer();
        if (!root) return false;
        const text = getComposerPromptText();
        const attachmentCount = countComposerAttachments(root);
        const hadAttachments = attachmentCount > 0;
        const attachments = hadAttachments
            ? await gatherComposerAttachments(root)
            : [];
        if (!text && attachments.length === 0) return false;
        if (hadAttachments && attachments.length === 0) {
            console.warn(
                "[cq] Unable to capture composer attachments; queue aborted.",
            );
            return false;
        }
        const modelId = currentModelId || null;
        const modelLabel = modelId
            ? labelForModel(modelId, currentModelLabel)
            : null;
        STATE.queue.push({
            text,
            attachments: attachments.map((attachment) =>
                cloneAttachment(attachment),
            ),
            model: modelId,
            modelLabel,
        });
        if (attachments.length) {
            clearComposerAttachments(root);
        }
        ed.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
        ed.dispatchEvent(new Event("input", { bubbles: true }));
        save();
        refreshAll();
        requestAnimationFrame(() => {
            list.scrollTop = list.scrollHeight;
        });
        ed.focus?.({ preventScroll: true });
        scheduleControlRefresh();
        return true;
    }

    async function queueFromComposer({ hold = false } = {}) {
        const added = await queueComposerInput();
        if (!added) return false;
        if (hold) setPaused(true);
        return true;
    }

    list.addEventListener("click", (event) => {
        const target =
            event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;
        const attachmentBtn = target.closest("button[data-attachment-remove]");
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
        const button = target.closest("button[data-action]");
        if (!button) return;
        const index = Number(button.dataset.index);
        if (!Number.isInteger(index)) return;

        const action = button.dataset.action;
        if (action === "delete") {
            STATE.queue.splice(index, 1);
            save();
            refreshAll();
        } else if (action === "send") {
            requestSend(index, { manual: true });
        }
    });

    list.addEventListener("dragstart", (event) => {
        const target =
            event.target instanceof HTMLElement
                ? event.target.closest(".cq-row")
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
        target.classList.add("cq-row--dragging");
    });

    list.addEventListener("dragend", () => {
        list.querySelector(".cq-row--dragging")?.classList.remove(
            "cq-row--dragging",
        );
        dragIndex = null;
        clearDragIndicator();
    });

    list.addEventListener("dragover", (event) => {
        if (dragIndex === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const item =
            event.target instanceof HTMLElement
                ? event.target.closest(".cq-row")
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
                    ? "cq-row--drop-before"
                    : "cq-row--drop-after",
            );
        }
    });

    list.addEventListener("dragleave", (event) => {
        const item =
            event.target instanceof HTMLElement
                ? event.target.closest(".cq-row")
                : null;
        if (item && item === dragOverItem) clearDragIndicator();
    });

    list.addEventListener("drop", (event) => {
        if (dragIndex === null) return;
        event.preventDefault();
        let newIndex = dragIndex;
        const item =
            event.target instanceof HTMLElement
                ? event.target.closest(".cq-row")
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
    });

    const matchesPauseShortcut = (event) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.shiftKey) return false;
        if (event.altKey) return false;
        const key = event.key.toLowerCase();
        if (key !== "p") return false;
        if (isApplePlatform) {
            return event.metaKey && !event.ctrlKey;
        }
        return event.ctrlKey && !event.metaKey;
    };

    const matchesQueueToggleShortcut = (event) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.shiftKey) return false;
        if (event.altKey) return false;
        const key = event.key;
        const code = event.code;
        const isPeriodKey = key === "." || key === ">" || code === "Period";
        if (!isPeriodKey) return false;
        if (isApplePlatform) {
            return event.metaKey && !event.ctrlKey;
        }
        return event.ctrlKey && !event.metaKey;
    };

    const matchesHoldShortcut = (event) => {
        if (!event || typeof event.key !== "string") return false;
        if (event.key !== "Enter") return false;
        const hasAlt = event.altKey;
        const hasMeta = event.metaKey;
        const hasCtrl = event.ctrlKey;
        if (isApplePlatform) {
            return hasAlt && hasMeta && !hasCtrl;
        }
        return hasAlt && hasCtrl && !hasMeta;
    };

    const matchesShortcutPopoverToggle = (event) => {
        if (!event || typeof event.key !== "string") return false;
        const normalized = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (normalized !== "/" && normalized !== "?") return false;
        if (isApplePlatform) {
            return event.metaKey && !event.ctrlKey && !event.altKey;
        }
        return event.ctrlKey && !event.metaKey && !event.altKey;
    };

    const matchesQueueNavigationShortcut = (event) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.altKey) return false;
        if (event.ctrlKey || event.metaKey || event.shiftKey) return false;
        return event.key === "ArrowDown" || event.key === "ArrowUp";
    };

    document.addEventListener(
        "keydown",
        (event) => {
            if (matchesPauseShortcut(event)) {
                event.preventDefault();
                togglePaused();
                return;
            }
            if (matchesQueueToggleShortcut(event)) {
                event.preventDefault();
                setCollapsed(!STATE.collapsed);
            }
        },
        true,
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (!matchesQueueNavigationShortcut(event)) return;
            if (!STATE.queue.length) return;
            const rows = getQueueRows();
            if (!rows.length) return;
            const activeElement = document.activeElement;
            const composerNode = composer();
            const activeRow =
                activeElement instanceof HTMLElement
                    ? activeElement.closest(".cq-row")
                    : null;
            const withinComposer =
                composerNode instanceof HTMLElement &&
                composerNode.contains(activeElement);
            if (!activeRow && !withinComposer) return;
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            if (!activeRow) {
                const targetIndex = direction > 0 ? 0 : rows.length - 1;
                focusQueueRow(rows[targetIndex]);
                return;
            }
            const currentIndex = rows.indexOf(activeRow);
            if (currentIndex === -1) return;
            const nextIndex = currentIndex + direction;
            if (nextIndex < 0 || nextIndex >= rows.length) {
                focusComposerEditor();
                return;
            }
            focusQueueRow(rows[nextIndex]);
        },
        true,
    );

    document.addEventListener("keyup", (event) => {
        if (event.repeat) return;
        if (!matchesShortcutPopoverToggle(event)) return;
        scheduleShortcutPopoverRefreshBurst();
    });

    // Shortcut inside page -----------------------------------------------------
    document.addEventListener(
        "keydown",
        (event) => {
            if (matchesHoldShortcut(event)) {
                event.preventDefault();
                queueFromComposer({ hold: true });
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
            void queueComposerInput();
        },
        true,
    );

    // Commands from background --------------------------------------------------
    chrome.runtime?.onMessage.addListener((msg) => {
        if (msg?.type === "queue-from-shortcut") void queueComposerInput();
        if (msg?.type === "toggle-ui") {
            setCollapsed(false);
        }
        if (msg?.type === "show-ui") {
            setCollapsed(false);
        }
    });

    // Handle SPA changes and rerenders -----------------------------------------
    const rootObserver = new MutationObserver(() => {
        scheduleControlRefresh();
        ensureMounted();
        refreshKeyboardShortcutPopover();
    });
    rootObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
    });

    ensureMounted();
    refreshKeyboardShortcutPopover();
    refreshVisibility();
    load()
        .then(() => ensureModelOptions())
        .catch(() => {});
})();
