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
    const QUEUE_VIEWPORT_MAX_HEIGHT = 220;
    const QUEUE_COLLAPSE_DURATION_MS = 620;
    const QUEUE_COLLAPSE_EASING = "cubic-bezier(0.3, 1, 0.6, 1)";
    const QUEUE_CONTENT_FADE_DURATION_MS = 300;
    const CAN_USE_WEB_ANIMATIONS =
        typeof Element !== "undefined" &&
        typeof Element.prototype?.animate === "function";

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
    const MODEL_LIST_SHORTCUT_LABEL = isApplePlatform
        ? "⌘⇧H"
        : "Ctrl+Shift+H";
    const MODEL_BUTTON_FALLBACK_LABEL = "Detecting…";
    const MODEL_DROPDOWN_ID = "cq-model-dropdown";
    const THINKING_DROPDOWN_ID = "cq-thinking-dropdown";
    const MODEL_SHORTCUT_KEY_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    const MODEL_SHORTCUT_COUNT = MODEL_SHORTCUT_KEY_ORDER.length;
    const THINKING_TIME_OPTIONS = [
        { id: "light", label: "Light", digit: "1" },
        { id: "standard", label: "Standard", digit: "2" },
        { id: "extended", label: "Extended", digit: "3" },
        { id: "heavy", label: "Heavy", digit: "4" },
    ];
    const THINKING_OPTION_MAP = THINKING_TIME_OPTIONS.reduce((map, option) => {
        map[option.id] = option;
        return map;
    }, {});
    const DEFAULT_THINKING_BUTTON_LABEL = "Thinking level";
    const DEFAULT_THINKING_OPTION_LABEL = "Use current thinking";
    const THINKING_OPTION_ID_SET = new Set(
        THINKING_TIME_OPTIONS.map((option) => option.id),
    );

    const THINKING_OPTION_ICONS = {
        light: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.0837 0.00494385C12.4509 0.00511975 12.7488 0.302822 12.7488 0.669983C12.7488 1.03714 12.4509 1.33485 12.0837 1.33502H7.91675C7.54948 1.33502 7.25171 1.03725 7.25171 0.669983C7.25171 0.302714 7.54948 0.00494385 7.91675 0.00494385H12.0837Z"></path>
          <path d="M10 2.08494C11.3849 2.08494 12.7458 2.44817 13.9463 3.13865C14.2646 3.32174 14.3744 3.72852 14.1914 4.04686C14.0083 4.36522 13.6016 4.47509 13.2832 4.29198C12.2844 3.71745 11.1523 3.41502 10 3.41502C9.63273 3.41502 9.33496 3.11725 9.33496 2.74998C9.33496 2.38271 9.63273 2.08494 10 2.08494Z"></path>
          <path d="M11.2992 10.75C10.8849 11.4675 9.96756 11.7133 9.25012 11.2991C8.53268 10.8849 8.28687 9.96747 8.70108 9.25003C9.45108 7.95099 12.0671 5.4199 12.5001 5.6699C12.9331 5.9199 12.0492 9.45099 11.2992 10.75Z"></path>
          <path opacity="0.2" d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"></path>
        </svg>`,
        standard: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 2.08496C14.3713 2.085 17.915 5.62869 17.915 10C17.915 11.2108 17.6427 12.3599 17.1553 13.3877C16.9979 13.7194 16.6013 13.8612 16.2695 13.7041C15.9378 13.5467 15.7959 13.1501 15.9531 12.8184C16.358 11.9648 16.585 11.0097 16.585 10C16.585 6.36323 13.6368 3.41508 10 3.41504C9.63276 3.415 9.33496 3.11725 9.33496 2.75C9.33496 2.38275 9.63276 2.085 10 2.08496Z"></path>
          <path d="M8.70117 9.25C9.1154 8.5326 10.0326 8.28697 10.75 8.70117C12.049 9.45122 14.5799 12.0669 14.3301 12.5C14.0796 12.9328 10.549 12.0488 9.25 11.2988C8.53268 10.8846 8.28699 9.96739 8.70117 9.25Z"></path>
          <path d="M12.084 0.00488281C12.451 0.00519055 12.749 0.302842 12.749 0.669922C12.749 1.037 12.451 1.33465 12.084 1.33496H7.91699C7.54972 1.33496 7.25195 1.03719 7.25195 0.669922C7.25195 0.302653 7.54972 0.00488281 7.91699 0.00488281H12.084Z"></path>
          <path opacity="0.2" d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"></path>
        </svg>`,
        extended: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M10.0007 2.08496C14.3717 2.08536 17.9158 5.62891 17.9158 10C17.9158 14.3711 14.3717 17.9146 10.0007 17.915C5.81265 17.915 2.38471 14.6622 2.10425 10.5449C2.07943 10.1786 2.35612 9.86191 2.72241 9.83691C3.08857 9.8123 3.40547 10.0889 3.43042 10.4551C3.66379 13.8792 6.51699 16.5849 10.0007 16.585C13.6372 16.5846 16.5857 13.6365 16.5857 10C16.5857 6.36345 13.6372 3.41544 10.0007 3.41504C9.6335 3.41499 9.33569 3.11724 9.33569 2.75C9.33569 2.38276 9.6335 2.08501 10.0007 2.08496ZM10.0007 8.5C10.8288 8.50042 11.5007 9.17183 11.5007 10C11.5007 10.8282 10.8288 11.4996 10.0007 11.5C8.50073 11.5 5.00073 10.5 5.00073 10C5.00073 9.5 8.50073 8.5 10.0007 8.5ZM12.0837 0.00488281C12.4508 0.00510456 12.7488 0.302789 12.7488 0.669922C12.7488 1.03705 12.4508 1.33474 12.0837 1.33496H7.91675C7.54948 1.33496 7.25171 1.03719 7.25171 0.669922C7.25171 0.302653 7.54948 0.00488281 7.91675 0.00488281H12.0837Z"></path>
          <path opacity="0.2" d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"></path>
        </svg>`,
        heavy: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 7.24208 3.49633 4.81441 5.63281 3.39844C5.93895 3.19555 6.3518 3.27882 6.55469 3.58496C6.75745 3.89109 6.67328 4.30398 6.36719 4.50684C4.58671 5.68693 3.41504 7.70677 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C9.63273 3.41504 9.33496 3.11727 9.33496 2.75C9.33496 2.38273 9.63273 2.08496 10 2.08496ZM7.5 5.66992C7.93301 5.41993 10.5488 7.95095 11.2988 9.25C11.713 9.96741 11.4674 10.8846 10.75 11.2988C10.0326 11.713 9.11542 11.4673 8.70117 10.75C7.95118 9.45097 7.06701 5.91997 7.5 5.66992ZM12.084 0.00488281C12.451 0.00519055 12.749 0.302842 12.749 0.669922C12.749 1.037 12.451 1.33465 12.084 1.33496H7.91699C7.54972 1.33496 7.25195 1.03719 7.25195 0.669922C7.25195 0.302653 7.54972 0.00488281 7.91699 0.00488281H12.084Z"></path>
          <path opacity="0.2" d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 13.6368 6.3632 16.585 10 16.585C13.6368 16.585 16.585 13.6368 16.585 10ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10Z"></path>
        </svg>`,
    };

    const normalizeThinkingOptionId = (value) => {
        if (typeof value !== "string") return null;
        const normalized = value.trim().toLowerCase();
        if (!THINKING_OPTION_ID_SET.has(normalized)) return null;
        return normalized;
    };

    const labelForThinkingOption = (id, fallback = DEFAULT_THINKING_OPTION_LABEL) => {
        const normalized = normalizeThinkingOptionId(id);
        if (!normalized) return fallback;
        return THINKING_OPTION_MAP[normalized]?.label || fallback;
    };


    const KEYBOARD_SHORTCUT_SECTION_LABEL = "Queue, models & thinking";
    const SHORTCUT_POPOVER_REFRESH_DELAYS = [0, 160, 360, 640];
    const MODEL_SHORTCUT_ENTRIES = MODEL_SHORTCUT_KEY_ORDER.map((key, index) => {
        const number = index === MODEL_SHORTCUT_KEY_ORDER.length - 1 ? 10 : index + 1;
        const label = `Select model ${number}`;
        const macKeys = ["command", "option", key];
        const otherKeys = ["control", "alt", key];
        return {
            id: `model-select-${number}`,
            label,
            macKeys,
            otherKeys,
        };
    });
    const THINKING_SHORTCUT_ENTRIES = THINKING_TIME_OPTIONS.map((option) => ({
        id: `thinking-${option.id}`,
        label: `Set thinking time: ${option.label}`,
        macKeys: ["command", "control", option.digit],
        otherKeys: ["control", "alt", option.digit],
    }));
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
        delete: { glyph: "⌫", aria: "Delete" },
        p: { glyph: "P", aria: "P" },
        period: { glyph: ".", aria: "Period" },
        arrowup: { glyph: "↑", aria: "Arrow Up" },
        arrowdown: { glyph: "↓", aria: "Arrow Down" },
    };

    const LEGACY_STORAGE_KEY = "cq";
    const STORAGE_PREFIX = "cq:";
    const CONVERSATION_ID_REGEX = /\/c\/([0-9a-f-]+)/i;

    const hostToken = () => {
        if (
            typeof location === "object" &&
            typeof location.host === "string" &&
            location.host
        ) {
            return location.host.toLowerCase();
        }
        return "chatgpt.com";
    };

    const encodePathForStorage = (value) => {
        if (typeof value !== "string" || value.length === 0) return "%2F";
        return encodeURIComponent(value);
    };

    const resolveConversationIdentifier = () => {
        const host = hostToken();
        const pathname =
            typeof location === "object" &&
            typeof location.pathname === "string" &&
            location.pathname.length
                ? location.pathname
                : "/";
        const match = pathname.match(CONVERSATION_ID_REGEX);
        if (match && match[1]) {
            return `${host}::chat::${match[1].toLowerCase()}`;
        }
        return `${host}::path::${encodePathForStorage(pathname)}`;
    };

    const storageKeyForIdentifier = (identifier) =>
        `${STORAGE_PREFIX}${identifier || "global"}`;

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

    function widenShortcutPopover(list) {
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

    function ensureShortcutColumns(list) {
        if (!(list instanceof HTMLDListElement)) return null;
        const popover = list.closest(".popover");
        if (!(popover instanceof HTMLElement)) return null;
        let wrapper = popover.querySelector("[data-cq-shortcut-wrapper]");
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
        let queueColumn = wrapper.querySelector("[data-cq-queue-column]");
        if (!queueColumn) {
            queueColumn = document.createElement("div");
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

    function injectQueueShortcutsIntoList(list) {
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
                thinking: null,
            };
        if (!entry || typeof entry !== "object")
            return {
                text: String(entry ?? ""),
                attachments: [],
                model: null,
                modelLabel: null,
                thinking: null,
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
        const thinking = normalizeThinkingOptionId(entry.thinking);
        return { text, attachments, model, modelLabel, thinking };
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
        thinking: normalizeThinkingOptionId(entry.thinking) || null,
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

    const DATA_OR_BLOB_URL = /^(data|blob):/i;

    const mimeFromDataUrl = (dataUrl) => {
        if (typeof dataUrl !== "string") return "image/png";
        const match = dataUrl.match(/^data:([^;,]+)/i);
        return match?.[1] || "image/png";
    };

    const createAttachmentFromDataUrl = (dataUrl) => {
        if (typeof dataUrl !== "string" || dataUrl.length === 0)
            return null;
        const mime = mimeFromDataUrl(dataUrl);
        const extension = mime.split("/")[1] || "png";
        return normalizeAttachment({
            id: makeId(),
            name: `image-${makeId()}.${extension}`,
            mime,
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

    const ATTACHMENT_REMOVE_SELECTORS = [
        'button[data-testid="attachment-item-remove"]',
        'button[data-testid="composer-upload-item-remove"]',
        'button[aria-label^="Remove"]',
        'button[aria-label^="Delete"]',
    ];

    const countFilesInInputs = (root) => {
        if (!root) return 0;
        return Array.from(root.querySelectorAll('input[type="file"]')).reduce(
            (total, input) => {
                if (!(input instanceof HTMLInputElement)) return total;
                const count = input.files?.length || 0;
                return total + count;
            },
            0,
        );
    };

    const countComposerAttachments = (root) => {
        if (!root) return 0;
        for (const selector of ATTACHMENT_SELECTORS) {
            const nodes = root.querySelectorAll(selector);
            if (nodes.length) return nodes.length;
        }
        const removeQuery = ATTACHMENT_REMOVE_SELECTORS.join(',');
        if (removeQuery) {
            const removalNodes = root.querySelectorAll(removeQuery);
            if (removalNodes.length) return removalNodes.length;
        }
        const fallback = root.querySelectorAll(
            'img[src^="blob:"], img[src^="data:"]',
        );
        if (fallback.length) return fallback.length;
        return countFilesInInputs(root);
    };

    const extractUrlsFromStyleValue = (value) => {
        if (typeof value !== "string" || value.toLowerCase() === "none")
            return [];
        const urls = [];
        const regex = /url\(([^)]+)\)/gi;
        let match;
        while ((match = regex.exec(value))) {
            const raw = match[1]?.trim();
            if (!raw) continue;
            const normalized = raw.replace(/^['"]|['"]$/g, "");
            if (DATA_OR_BLOB_URL.test(normalized)) urls.push(normalized);
        }
        return urls;
    };

    const collectPreviewDataUrls = (root) => {
        if (!root) return [];
        const urls = new Set();
        const addUrl = (value) => {
            if (typeof value !== "string") return;
            const trimmed = value.trim();
            if (!trimmed || !DATA_OR_BLOB_URL.test(trimmed)) return;
            urls.add(trimmed);
        };
        const inspectElement = (element) => {
            if (!(element instanceof HTMLElement)) return;
            if (element instanceof HTMLImageElement) {
                const src = element.getAttribute("src");
                if (src) addUrl(src);
            }
            extractUrlsFromStyleValue(element.style?.backgroundImage || "").forEach(
                (url) => addUrl(url),
            );
            if (typeof getComputedStyle === "function") {
                try {
                    const computed = getComputedStyle(element);
                    extractUrlsFromStyleValue(
                        computed?.backgroundImage || "",
                    ).forEach((url) => addUrl(url));
                } catch (_) {
                    /* noop */
                }
            }
        };
        ATTACHMENT_SELECTORS.forEach((selector) => {
            root.querySelectorAll(selector).forEach((node) => {
                if (!(node instanceof HTMLElement)) return;
                inspectElement(node);
                node.querySelectorAll("img").forEach((img) => inspectElement(img));
                node.querySelectorAll("*").forEach((child) =>
                    inspectElement(child),
                );
            });
        });
        return Array.from(urls);
    };

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
        const previewUrls = collectPreviewDataUrls(root);
        for (const url of previewUrls) {
            if (!url || seenDataUrls.has(url)) continue;
            if (/^data:/i.test(url)) {
                const attachment = createAttachmentFromDataUrl(url);
                if (attachment) {
                    attachments.push(attachment);
                    seenDataUrls.add(attachment.dataUrl);
                }
                continue;
            }
            if (/^blob:/i.test(url)) {
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const mime = blob.type || "image/png";
                    const extension = mime.split("/")[1] || "png";
                    const file = new File(
                        [blob],
                        `image-${makeId()}.${extension}`,
                        { type: mime },
                    );
                    const attachment = await createAttachmentFromFile(file);
                    if (attachment) {
                        attachments.push(attachment);
                        seenDataUrls.add(attachment.dataUrl);
                    }
                } catch (_) {
                    /* noop */
                }
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

    const MODEL_ID_ALIASES = {
        auto: "gpt-5-1",
        "gpt5": "gpt-5-1",
        "gpt-5": "gpt-5-1",
        "gpt-5-mini": "gpt-5-t-mini",
        "gpt5-mini": "gpt-5-t-mini",
    };

    const MODEL_LIST_CACHE_MAX_MS = 90 * 1000;
    let lastModelFetchAt = 0;
    let lastModelFetchSource = null;

    const isModelDebugEnabled = () => {
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

    const logModelDebug = (...parts) => {
        if (!isModelDebugEnabled()) return;
        try {
            if (typeof console === "object" && typeof console.info === "function") {
                console.info("[cq][models]", ...parts);
            }
        } catch (_) {
            /* ignored */
        }
    };

    const isElementVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return false;
        }
        if (style.pointerEvents === "none") return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    const hasDisabledPointerEvents = (element) => {
        let node = element;
        while (node instanceof HTMLElement) {
            const style = window.getComputedStyle(node);
            if (style.pointerEvents === "none") return true;
            node = node.parentElement;
        }
        return false;
    };

    const isElementInteractable = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (!isElementVisible(element)) return false;
        if (element.matches?.(":disabled")) return false;
        if (element.getAttribute("aria-disabled") === "true") return false;
        if (hasDisabledPointerEvents(element)) return false;
        return true;
    };

    const waitForElementInteractable = async (element, timeoutMs = 3000) => {
        if (!(element instanceof HTMLElement)) return false;
        const deadline = performance.now() + timeoutMs;
        while (performance.now() < deadline) {
            if (isElementInteractable(element)) return true;
            await sleep(60);
        }
        return isElementInteractable(element);
    };

    const queryModelSwitcherButtons = () =>
        Array.from(
            document.querySelectorAll(
                'button[data-testid="model-switcher-dropdown-button"]',
            ),
        );

    const findPreferredModelSwitcherButton = () => {
        const buttons = queryModelSwitcherButtons();
        if (!buttons.length) {
            logModelDebug("model switcher button missing", {
                timestamp: Date.now(),
            });
            return null;
        }
        const visible = buttons.filter((btn) => isElementVisible(btn));
        if (visible.length) return visible[0];
        return buttons[0];
    };

    const applyModelIdAlias = (value) => {
        const normalized = normalizeModelId(value);
        return MODEL_ID_ALIASES[normalized] || value;
    };

    const supportsThinkingForModel = (modelId, label = "") => {
        const canonical = modelId
            ? normalizeModelId(applyModelIdAlias(modelId))
            : "";
        const canonicalMatches = canonical.includes("thinking");
        const labelMatches = typeof label === "string"
            ? label.toLowerCase().includes("thinking")
            : false;
        return canonicalMatches || labelMatches;
    };

    let currentModelId = null;
    let currentModelLabel = "";
    let modelsPromise = null;
    let composerControlGroup = null;
    let composerQueueButton = null;
    let composerHoldButton = null;
    let composerModelLabelButton = null;
    let composerModelLabelButtonValue = null;
    let composerModelLabelPlacement = null;
    let modelDropdown = null;
    let modelDropdownAnchor = null;
    let modelDropdownCleanup = [];
    let thinkingDropdown = null;
    let thinkingDropdownAnchor = null;
    let thinkingDropdownCleanup = [];
    let composerModelSelectionPending = false;

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
            if (root.id === MODEL_DROPDOWN_ID || root.closest(`#${MODEL_DROPDOWN_ID}`)) {
                continue;
            }
            if (root.querySelector('[data-testid^="model-switcher-"]'))
                return root;
        }
        return null;
    };

    const waitForModelMenu = (timeoutMs = 1500) =>
        new Promise((resolve) => {
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

    const useModelMenu = async (operation) => {
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
        let openedByUs = false;
        if (!wasOpen) {
            const interactable = await waitForElementInteractable(button, 3500);
            if (!interactable) {
                logModelDebug("useModelMenu:button-not-interactable", {
                    pointerEvents: window.getComputedStyle(button).pointerEvents,
                    disabled: button.matches?.(":disabled") || false,
                    ariaDisabled: button.getAttribute("aria-disabled") || null,
                });
                return null;
            }
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
        let result;
        try {
            result = await operation(menu, button);
        } finally {
            if (!wasOpen && openedByUs) {
                logModelDebug("useModelMenu:closing-menu");
                setModelSwitcherOpenState(button, false);
            }
        }
        return result;
    };

    const waitForElementById = (id, timeoutMs = 1000) =>
        new Promise((resolve) => {
            if (!id) {
                resolve(null);
                return;
            }
            const existing = document.getElementById(id);
            if (existing) {
                resolve(existing);
                return;
            }
            let done = false;
            const finish = (value) => {
                if (done) return;
                done = true;
                observer.disconnect();
                clearTimeout(timer);
                resolve(value);
            };
            const observer = new MutationObserver(() => {
                const node = document.getElementById(id);
                if (node) finish(node);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            const timer = setTimeout(() => finish(null), timeoutMs);
        });

    const lookupMenuItemAcrossRoots = (modelId) => {
        const selector = `[role="menuitem"][data-testid="model-switcher-${escapeCss(modelId)}"]`;
        for (const root of document.querySelectorAll("[data-radix-menu-content]")) {
            if (
                root instanceof HTMLElement &&
                (root.id === MODEL_DROPDOWN_ID || root.closest(`#${MODEL_DROPDOWN_ID}`))
            ) {
                continue;
            }
            const match = root.querySelector(selector);
            if (match) return match;
        }
        return null;
    };

    const findClosedSubmenuTrigger = (visited) => {
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

    const openSubmenuTrigger = async (trigger) => {
        if (!(trigger instanceof HTMLElement)) return false;
        const alreadyOpen = trigger.getAttribute("aria-expanded") === "true";
        const controlsId = trigger.getAttribute("aria-controls") || "";
        if (!alreadyOpen) {
            dispatchHoverSequence(trigger);
            await sleep(80);
            if (trigger.getAttribute("aria-expanded") !== "true") {
                dispatchPointerAndMousePress(trigger);
                await sleep(80);
            }
        }
        if (trigger.getAttribute("aria-expanded") === "true") return true;
        await waitForElementById(controlsId, 600);
        return trigger.getAttribute("aria-expanded") === "true";
    };

    const waitForModelMenuItem = async (menu, modelId, timeoutMs = 2000) => {
        const deadline = performance.now() + timeoutMs;
        const visitedSubmenus = new Set();
        while (performance.now() < deadline) {
            const existing =
                findModelMenuItem(menu, modelId) ||
                lookupMenuItemAcrossRoots(modelId);
            if (existing) {
                return existing;
            }
            const submenuTrigger = findClosedSubmenuTrigger(visitedSubmenus);
            if (submenuTrigger) {
                visitedSubmenus.add(submenuTrigger);
                const opened = await openSubmenuTrigger(submenuTrigger);
                continue;
            }
            await sleep(80);
        }
        return null;
    };

    const isModelSwitcherOpen = (button) =>
        button?.getAttribute("aria-expanded") === "true" ||
        button?.dataset.state === "open";

    const dispatchPointerAndMousePress = (target) => {
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

    const dispatchHoverSequence = (target) => {
        if (!(target instanceof HTMLElement)) return false;
        const rect = target.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const common = {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
        };
        try {
            if (typeof PointerEvent === "function") {
                target.dispatchEvent(new PointerEvent("pointerover", { ...common, pointerId: 1, pointerType: "mouse" }));
                target.dispatchEvent(new PointerEvent("pointerenter", { ...common, pointerId: 1, pointerType: "mouse" }));
                target.dispatchEvent(new PointerEvent("pointermove", { ...common, pointerId: 1, pointerType: "mouse" }));
            }
        } catch (_) {
            /* ignore pointer issues */
        }
        target.dispatchEvent(new MouseEvent("mouseover", common));
        target.dispatchEvent(new MouseEvent("mouseenter", { ...common, bubbles: false }));
        target.dispatchEvent(new MouseEvent("mousemove", common));
        return true;
    };

    const dispatchKeyboardEnterPress = (target) => {
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

    const isDropdownVisiblyOpen = (button) =>
        isModelSwitcherOpen(button) || !!findModelMenuRoot();

    const setModelSwitcherOpenState = (button, shouldOpen = true) => {
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
            dispatchPointerAndMousePress(button);
            if (attempt()) return true;
            dispatchKeyboardEnterPress(button);
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

    const openModelSwitcherDropdown = () => {
        closeModelDropdown();
        const button = findPreferredModelSwitcherButton();
        if (!(button instanceof HTMLElement)) return false;
        const opened = setModelSwitcherOpenState(button, true);
        if (!opened) return false;
        button.focus?.({ preventScroll: false });
        return true;
    };

    const activateMenuItem = (item) => {
        if (!(item instanceof HTMLElement)) return false;
        item.focus?.({ preventScroll: true });
        dispatchPointerAndMousePress(item);
        if (!item.isConnected) return true;
        dispatchKeyboardEnterPress(item);
        if (!item.isConnected) return true;
        item.click();
        return true;
    };

    const THINKING_MENU_LABEL = "thinking time";

    const normalizeThinkingText = (value = "") =>
        String(value || "").trim().toLowerCase();

    const THINKING_OPTION_LABEL_MAP = THINKING_TIME_OPTIONS.reduce(
        (map, option) => {
            map[option.id] = normalizeThinkingText(option.label);
            return map;
        },
        {},
    );

    const resolveThinkingOptionFromText = (value = "") => {
        const normalized = normalizeThinkingText(value);
        if (!normalized) return null;
        for (const [id, label] of Object.entries(THINKING_OPTION_LABEL_MAP)) {
            if (label && normalized.includes(label)) return id;
        }
        return null;
    };

    const findThinkingChipButton = () => {
        const selector = "button.__composer-pill";
        for (const button of document.querySelectorAll(selector)) {
            if (!(button instanceof HTMLElement)) continue;
            const text = button.textContent || "";
            if (normalizeThinkingText(text).includes("thinking")) {
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
        if (match) return normalizeThinkingOptionId(match);
        const title = button.getAttribute("title") || "";
        match = resolveThinkingOptionFromText(title);
        if (match) return normalizeThinkingOptionId(match);
        const text = button.textContent || "";
        match = resolveThinkingOptionFromText(text);
        if (match) return normalizeThinkingOptionId(match);
        return null;
    };

    const findThinkingMenuRoot = () => {
        const menus = document.querySelectorAll(
            '[role="menu"][data-radix-menu-content]'
        );
        for (const menu of menus) {
            if (!(menu instanceof HTMLElement)) continue;
            const heading = menu.querySelector(".__menu-label");
            const label = normalizeThinkingText(heading?.textContent || "");
            if (label === THINKING_MENU_LABEL) {
                return menu;
            }
        }
        return null;
    };

    const isThinkingMenuOpen = () => !!findThinkingMenuRoot();

    const waitForThinkingMenu = (timeoutMs = 1200) =>
        new Promise((resolve) => {
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

    const useThinkingMenu = async (operation) => {
        const button = findThinkingChipButton();
        if (!(button instanceof HTMLElement)) return null;
        const wasOpen = isThinkingMenuOpen();
        if (!wasOpen) {
            dispatchPointerAndMousePress(button);
        }
        const menu = wasOpen ? findThinkingMenuRoot() : await waitForThinkingMenu();
        if (!(menu instanceof HTMLElement)) {
            if (!wasOpen) {
                button.click();
            }
            return null;
        }
        let result;
        try {
            result = await operation(menu, button);
        } finally {
            if (!wasOpen && isThinkingMenuOpen()) {
                button.click();
            }
        }
        return result;
    };

    const findThinkingMenuItem = (menu, optionId) => {
        if (!(menu instanceof HTMLElement)) return null;
        const desired = THINKING_OPTION_LABEL_MAP[optionId];
        if (!desired) return null;
        const items = menu.querySelectorAll('[role="menuitemradio"]');
        for (const item of items) {
            if (!(item instanceof HTMLElement)) continue;
            const text = normalizeThinkingText(item.textContent || "");
            if (text === desired) {
                return item;
            }
        }
        return null;
    };

    const selectThinkingTimeOption = async (optionId) => {
        if (!THINKING_OPTION_LABEL_MAP[optionId]) return false;
        const result = await useThinkingMenu(async (menu) => {
            const item = findThinkingMenuItem(menu, optionId);
            if (!item) return false;
            activateMenuItem(item);
            return true;
        });
        return !!result;
    };

    const setComposerModelSelectionBusy = (isBusy) => {
        if (!(composerModelLabelButton instanceof HTMLElement)) return;
        if (isBusy) {
            composerModelLabelButton.dataset.cqModelSelecting = "true";
            composerModelLabelButton.setAttribute("aria-busy", "true");
        } else {
            delete composerModelLabelButton.dataset.cqModelSelecting;
            composerModelLabelButton.removeAttribute("aria-busy");
        }
    };

    const handleComposerModelSelection = async (model) => {
        if (!model || !model.id || composerModelSelectionPending) return false;
        composerModelSelectionPending = true;
        closeModelDropdown();
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

    const MODEL_DESCRIPTION_MAP = {
        auto: "Decides how long to think",
        instant: "Answers right away",
        "t-mini": "Thinks quickly",
        mini: "Thinks quickly",
        thinking: "Thinks longer for better answers",
        pro: "Research-grade intelligence",
    };

    const describeModel = (model) => {
        const slug = String(model?.id || "").toLowerCase();
        if (!slug) return "";
        for (const key of Object.keys(MODEL_DESCRIPTION_MAP)) {
            if (slug.includes(key)) {
                return MODEL_DESCRIPTION_MAP[key];
            }
        }
        return slug;
    };

    const resolveModelDropdownHeading = (
        models = STATE.models,
        preferredId = null,
    ) => {
        const slugCandidate =
            preferredId ||
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

    const HEADER_LABEL_ALIASES = [
        {
            test: (value) => /^5$/i.test(value),
            display: "Auto",
        },
    ];

    const applyHeaderLabelAliases = (label) => {
        const trimmed = String(label || "").trim();
        if (!trimmed) return "";
        const alias = HEADER_LABEL_ALIASES.find((entry) =>
            entry.test(trimmed),
        );
        if (alias) return alias.display;
        return trimmed;
    };

    const readCurrentModelLabelFromHeader = () => {
        const button = findPreferredModelSwitcherButton();
        if (!(button instanceof HTMLElement)) return "";
        const aria = button.getAttribute("aria-label") || "";
        const ariaMatch = aria.match(/current model is (.+)$/i);
        if (ariaMatch && ariaMatch[1]) {
            return ariaMatch[1].trim();
        }
        const highlight = button.querySelector(
            ".text-token-text-tertiary, span[class*='text-token-text-tertiary']",
        );
        if (highlight && highlight.textContent) {
            return highlight.textContent.trim();
        }
        const text = button.textContent || "";
        const stripped = text.replace(/chatgpt/i, "").trim();
        return stripped;
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

    const registerModelDropdownCleanup = (target, event, handler, options) => {
        if (!target || typeof target.addEventListener !== "function") return;
        target.addEventListener(event, handler, options);
        modelDropdownCleanup.push(() => {
            target.removeEventListener(event, handler, options);
        });
    };

    const closeModelDropdown = () => {
        modelDropdownCleanup.forEach((cleanup) => {
            try {
                cleanup();
            } catch (_) {
                /* noop */
            }
        });
        modelDropdownCleanup = [];
        if (modelDropdown?.parentNode) {
            modelDropdown.parentNode.removeChild(modelDropdown);
        }
        modelDropdown = null;
        modelDropdownAnchor = null;
    };

    const positionModelDropdown = () => {
        if (
            !modelDropdown ||
            !modelDropdownAnchor ||
            !document.body.contains(modelDropdownAnchor)
        )
            return;
        const rect = modelDropdownAnchor.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        const dropdownRect = modelDropdown.getBoundingClientRect();
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
        modelDropdown.style.transform = `translate(${Math.round(
            left,
        )}px, ${Math.round(top)}px)`;
        const menu = modelDropdown.querySelector(
            "[data-radix-menu-content]",
        );
        if (menu instanceof HTMLElement) {
            menu.dataset.side = side;
        }
    };

    const normalizeModelLabelText = (value) =>
        String(value || "")
            .trim()
            .replace(/chatgpt/gi, "")
            .replace(/gpt[\s-]*/gi, "")
            .replace(/^-+/, "")
            .replace(/-+$/, "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");

    const createModelDropdownItem = (
        model,
        selected = false,
        selectionHandler,
    ) => {
        const item = document.createElement("div");
        item.className = "group __menu-item hoverable";
        item.setAttribute("role", "menuitem");
        item.tabIndex = 0;
        item.dataset.orientation = "vertical";
        item.dataset.radixCollectionItem = "";
        if (model?.id) {
            item.dataset.testid = `model-switcher-${model.id}`;
        }
        const body = document.createElement("div");
        body.className = "min-w-0";
        const label = document.createElement("span");
        label.className = "flex items-center gap-1";
        label.textContent = model?.label || model?.id || "Unknown model";
        const description = document.createElement("div");
        description.className =
            "not-group-data-disabled:text-token-text-tertiary leading-dense mb-0.5 text-xs group-data-sheet-item:mt-0.5 group-data-sheet-item:mb-0";
        description.textContent = describeModel(model);
        body.append(label, description);

        const trailing = document.createElement("div");
        trailing.className = "trailing";
        if (selected) {
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("width", "16");
            svg.setAttribute("height", "16");
            svg.setAttribute("viewBox", "0 0 16 16");
            svg.setAttribute("fill", "currentColor");
            svg.setAttribute("xmlns", svgNS);
            svg.classList.add("icon-sm");
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute(
                "d",
                "M12.0961 2.91371C12.3297 2.68688 12.6984 2.64794 12.9779 2.83852C13.2571 3.02905 13.3554 3.38601 13.2299 3.68618L13.1615 3.81118L6.91152 12.9772C6.79412 13.1494 6.60631 13.2604 6.39882 13.2799C6.19137 13.2994 5.98565 13.226 5.83828 13.0788L2.08828 9.32875L1.99843 9.2184C1.81921 8.94677 1.84928 8.57767 2.08828 8.33852C2.3274 8.0994 2.69648 8.06947 2.96816 8.24868L3.07851 8.33852L6.23085 11.4909L12.0053 3.02211L12.0961 2.91371Z",
            );
            svg.appendChild(path);
            trailing.appendChild(svg);
        } else {
            const span = document.createElement("span");
            span.className = "icon";
            trailing.appendChild(span);
        }

        item.append(body, trailing);
        const triggerSelection = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const handler =
                typeof selectionHandler === "function"
                    ? selectionHandler
                    : (payload) => handleComposerModelSelection(payload);
            const result = handler(model);
            if (result instanceof Promise) {
                void result;
            }
        };
        item.addEventListener("click", triggerSelection);
        item.addEventListener("keydown", (event) => {
            const key = event.key || "";
            if (key === "Enter" || key === " " || key === "Spacebar") {
                triggerSelection(event);
            }
        });
        return item;
    };

    const dedupeModelsForDisplay = (models) => {
        const map = new Map();
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

    const THINKING_DIGIT_OPTION_MAP = THINKING_TIME_OPTIONS.reduce(
        (map, option) => {
            if (option?.digit) {
                map[String(option.digit)] = option.id;
            }
            return map;
        },
        {},
    );

    const normalizeShortcutDigit = (value) => {
        if (typeof value !== "string" || !value.length) return null;
        const digit = value.slice(-1);
        if (!/^[0-9]$/.test(digit)) return null;
        if (digit === "0") return MODEL_SHORTCUT_COUNT;
        const numeric = Number.parseInt(digit, 10);
        if (!Number.isInteger(numeric) || numeric < 1) return null;
        return numeric;
    };

    const resolveModelShortcutIndex = (event) => {
        if (!event) return null;
        if (event.shiftKey) return null;
        const directKey =
            typeof event.key === "string" && event.key.length === 1
                ? event.key.toLowerCase()
                : typeof event.key === "string"
                  ? event.key.toLowerCase()
                  : "";
        let index = normalizeShortcutDigit(directKey);
        if (!index) {
            const code = typeof event.code === "string" ? event.code.toLowerCase() : "";
            if (code.startsWith("digit")) {
                index = normalizeShortcutDigit(code.slice(5));
            } else if (code.startsWith("numpad")) {
                index = normalizeShortcutDigit(code.slice(6));
            }
        }
        if (!index) return null;
        const requiresMeta = isApplePlatform;
        const hasMeta = event.metaKey;
        const hasCtrl = event.ctrlKey;
        const hasAlt = event.altKey;
        if (requiresMeta) {
            if (!hasMeta || !hasAlt || hasCtrl) return null;
        } else {
            if (!hasCtrl || !hasAlt || hasMeta) return null;
        }
        return index;
    };

    const getModelForShortcutIndex = (index, models = STATE.models) => {
        if (!Number.isInteger(index)) return null;
        if (index < 1 || index > MODEL_SHORTCUT_COUNT) return null;
        const displayModels = dedupeModelsForDisplay(models);
        if (!displayModels.length) return null;
        return displayModels[index - 1] || null;
    };

    const resolveThinkingShortcut = (event) => {
        if (!event) return null;
        if (event.shiftKey) return null;
        let digit = null;
        const key = typeof event.key === "string" ? event.key : "";
        if (key && key.length === 1 && /[0-9]/.test(key)) {
            digit = key;
        } else {
            const code = typeof event.code === "string" ? event.code.toLowerCase() : "";
            if (code.startsWith("digit")) {
                digit = code.slice(5);
            } else if (code.startsWith("numpad")) {
                digit = code.slice(6);
            }
        }
        if (!digit || !THINKING_DIGIT_OPTION_MAP[digit]) return null;
        if (isApplePlatform) {
            if (!event.metaKey || !event.ctrlKey) return null;
            if (event.altKey) return null;
        } else {
            if (!event.ctrlKey || !event.altKey) return null;
            if (event.metaKey) return null;
        }
        return THINKING_DIGIT_OPTION_MAP[digit];
    };

    const handleModelShortcut = async (index) => {
        if (!Number.isInteger(index)) return false;
        try {
            const models = await ensureModelOptions();
            const model = getModelForShortcutIndex(index, models);
            if (!model?.id) return false;
            const matchesCurrent =
                normalizeModelId(model.id) === normalizeModelId(currentModelId);
            if (matchesCurrent) return true;
            return await handleComposerModelSelection(model);
        } catch (error) {
            console.warn("[cq] Failed to apply model shortcut", error);
            return false;
        }
    };

    const handleThinkingShortcut = async (optionId) => {
        if (!optionId) return false;
        try {
            const applied = await selectThinkingTimeOption(optionId);
            if (!applied) {
                console.info("[cq] Failed to apply thinking shortcut", optionId);
            }
            return applied;
        } catch (error) {
            console.info("[cq] Thinking shortcut error", optionId, error);
            return false;
        }
    };

    const buildModelDropdown = (models, options = {}) => {
        const { selectedModelId = null, onSelect } = options;
        const displayModels = dedupeModelsForDisplay(models);
        logModelDebug("composer dropdown models", {
            count: displayModels.length,
            models: displayModels.map((model) => ({
                id: model.id,
                label: model.label || model.id,
            })),
        });
        const wrapper = document.createElement("div");
        wrapper.id = MODEL_DROPDOWN_ID;
        wrapper.dataset.radixPopperContentWrapper = "";
        wrapper.style.position = "fixed";
        wrapper.style.left = "0px";
        wrapper.style.top = "0px";
        wrapper.style.transform = "translate(0px, 0px)";
        wrapper.style.minWidth = "max-content";
        wrapper.style.zIndex = "2147480000";
        wrapper.style.pointerEvents = "none";

        const menu = document.createElement("div");
        menu.dataset.radixMenuContent = "";
        menu.dataset.side = "bottom";
        menu.dataset.align = "start";
        menu.dataset.orientation = "vertical";
        menu.dataset.state = "open";
        menu.setAttribute("role", "menu");
        menu.tabIndex = -1;
        menu.className =
            "z-50 max-w-xs rounded-2xl popover bg-token-main-surface-primary dark:bg-[#353535] shadow-long will-change-[opacity,transform] py-1.5 min-w-[max(var(--trigger-width),min(125px,95vw))] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto select-none";
        menu.style.pointerEvents = "auto";
        const heading = document.createElement("div");
        heading.className = "__menu-label mb-0";
        heading.textContent = resolveModelDropdownHeading(models, selectedModelId);
        menu.appendChild(heading);
        const headerLabelSource = selectedModelId
            ? labelForModel(selectedModelId, selectedModelId)
            : readCurrentModelLabelFromHeader();
        const headerLabel = applyHeaderLabelAliases(headerLabelSource);
        const normalizedHeaderLabel = normalizeModelLabelText(headerLabel);
        const normalizedHeaderSlug = headerLabel
            ? normalizeModelId(headerLabel)
            : "";
        const normalizedSelectedId = normalizeModelId(
            selectedModelId || "",
        );
        const matchesHeader = (model) => {
            const displayValue = model?.label || model?.id || "";
            const normalizedDisplay = normalizeModelLabelText(displayValue);
            const normalizedId = normalizeModelId(model?.id || "");
            const headerMatchesLabel =
                normalizedHeaderLabel &&
                normalizedHeaderLabel.length > 0 &&
                normalizedDisplay === normalizedHeaderLabel;
            const headerMatchesId =
                normalizedHeaderSlug &&
                normalizedHeaderSlug.length > 0 &&
                normalizedHeaderSlug === normalizedId;
            return headerMatchesLabel || headerMatchesId;
        };
        const hasHeaderMatch = normalizedHeaderLabel
            ? models.some((model) => matchesHeader(model))
            : false;
        const matchesSelectedId = (model) => {
            if (!normalizedSelectedId) return false;
            return normalizeModelId(model?.id || "") === normalizedSelectedId;
        };
        const selectionHandler =
            typeof onSelect === "function"
                ? onSelect
                : (model) => handleComposerModelSelection(model);
        displayModels.forEach((model) => {
            const selected = normalizedSelectedId
                ? matchesSelectedId(model)
                : hasHeaderMatch
                  ? matchesHeader(model)
                  : !!model?.selected;
            menu.appendChild(
                createModelDropdownItem(model, selected, selectionHandler),
            );
        });
        wrapper.appendChild(menu);
        return wrapper;
    };

    const openModelDropdownForAnchor = async (
        anchor,
        { selectedModelId = null, onSelect } = {},
    ) => {
        if (!(anchor instanceof HTMLElement)) return;
        try {
            const models = await ensureModelOptions();
            if (!Array.isArray(models) || !models.length) return;
            if (modelDropdown && modelDropdownAnchor === anchor) {
                closeModelDropdown();
                return;
            }
            closeModelDropdown();
            modelDropdownAnchor = anchor;
            modelDropdown = buildModelDropdown(models, {
                selectedModelId,
                onSelect,
            });
            document.body.appendChild(modelDropdown);
            positionModelDropdown();
            const handleClickOutside = (event) => {
                if (!modelDropdown || modelDropdown.contains(event.target)) {
                    return;
                }
                if (anchor.contains(event.target)) return;
                closeModelDropdown();
            };
            const handleEscape = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    closeModelDropdown();
                    anchor.focus?.();
                }
            };
            const handleViewportChange = () => {
                positionModelDropdown();
            };
            registerModelDropdownCleanup(
                document,
                "mousedown",
                handleClickOutside,
                true,
            );
            registerModelDropdownCleanup(
                document,
                "keydown",
                handleEscape,
                true,
            );
            registerModelDropdownCleanup(
                window,
                "resize",
                handleViewportChange,
            );
            registerModelDropdownCleanup(
                window,
                "scroll",
                handleViewportChange,
                true,
            );
        } catch (error) {
            console.warn("[cq] Failed to open model dropdown", error);
            closeModelDropdown();
        }
    };

    const openComposerModelDropdown = async () => {
        if (!composerModelLabelButton) return;
        await openModelDropdownForAnchor(composerModelLabelButton, {
            selectedModelId: currentModelId,
        });
    };

    const registerThinkingDropdownCleanup = (
        target,
        event,
        handler,
        options,
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

    const buildThinkingDropdown = ({ selectedId = null, onSelect } = {}) => {
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
        const normalizedSelected =
            normalizeThinkingOptionId(selectedId) ||
            normalizeThinkingOptionId(getCurrentThinkingOption());
        const options = THINKING_TIME_OPTIONS.map((option) => ({
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
                const check = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "svg",
                );
                check.setAttribute("width", "16");
                check.setAttribute("height", "16");
                check.setAttribute("viewBox", "0 0 16 16");
                check.setAttribute("fill", "currentColor");
                check.classList.add("icon-sm");
                const path = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "path",
                );
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
            const triggerSelection = (event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelect?.(option.id);
            };
            item.addEventListener("click", triggerSelection);
            item.addEventListener("keydown", (event) => {
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

    const openQueueEntryThinkingDropdown = (index, anchor) => {
        if (!(anchor instanceof HTMLElement)) return;
        const entry = STATE.queue[index];
        if (
            !entry ||
            !supportsThinkingForModel(entry.model, entry.modelLabel)
        )
            return;
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
            },
        });
        document.body.appendChild(thinkingDropdown);
        positionThinkingDropdown();
        const handleClickOutside = (event) => {
            if (
                !thinkingDropdown ||
                thinkingDropdown.contains(event.target) ||
                anchor.contains(event.target)
            ) {
                return;
            }
            closeThinkingDropdown();
        };
        const handleEscape = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeThinkingDropdown();
                anchor.focus?.();
            }
        };
        const handleViewportChange = () => positionThinkingDropdown();
        registerThinkingDropdownCleanup(
            document,
            "mousedown",
            handleClickOutside,
            true,
        );
        registerThinkingDropdownCleanup(
            document,
            "keydown",
            handleEscape,
            true,
        );
        registerThinkingDropdownCleanup(window, "resize", handleViewportChange);
        registerThinkingDropdownCleanup(
            window,
            "scroll",
            handleViewportChange,
            true,
        );
    };

    const createQueueEntryThinkingPill = (entry, index) => {
        if (!supportsThinkingForModel(entry?.model, entry?.modelLabel))
            return null;
        const container = document.createElement("div");
        container.className = "cq-row-thinking __composer-pill-composite group relative";
        container.dataset.entryIndex = String(index);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "__composer-pill-remove cq-row-thinking-remove";
        removeBtn.setAttribute("aria-label", "Clear thinking level override");
        removeBtn.hidden = !entry.thinking;
        removeBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setEntryThinkingOption(index, "");
            applyModelSelectionToEntry(index, { id: "auto", label: "Auto" });
        });
        const pillButton = document.createElement("button");
        pillButton.type = "button";
        pillButton.className = "__composer-pill cq-row-thinking-pill group/pill";
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
        const iconId = entry?.thinking || getCurrentThinkingOption() || "extended";
        icon.innerHTML = THINKING_OPTION_ICONS[iconId] || THINKING_OPTION_ICONS.extended;
        const labelSpan = document.createElement("span");
        labelSpan.className = "max-w-40 truncate [[data-collapse-labels]_&]:sr-only";
        labelSpan.textContent = resolveQueueEntryThinkingLabel(entry);
        const caret = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        caret.setAttribute("width", "16");
        caret.setAttribute("height", "16");
        caret.setAttribute("viewBox", "0 0 16 16");
        caret.setAttribute("fill", "currentColor");
        caret.classList.add("icon-sm", "-me-0.5", "h-3.5", "w-3.5");
        const caretPath = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
        );
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

    const mountComposerModelLabelBeforeDictate = (root) => {
        if (!composerModelLabelButton) return false;
        const dictateButton = root.querySelector(
            'button[aria-label="Dictate button"]',
        );
        if (!(dictateButton instanceof HTMLElement)) return false;
        const dictateWrapper =
            dictateButton.closest("span") || dictateButton;
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

    const waitForMenuItems = async (menu, timeoutMs = 1500) => {
        if (!(menu instanceof HTMLElement)) return [];
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const items = parseModelItems(menu);
            if (items.length) return items;
            await sleep(60);
        }
        return [];
    };

    const collectModelMenuItems = async (menu, visitedMenus = new Set()) => {
        if (!(menu instanceof HTMLElement)) return [];
        if (visitedMenus.has(menu)) return [];
        visitedMenus.add(menu);
        logModelDebug("collecting models from menu", {
            menuId: menu.id || null,
            visited: visitedMenus.size,
        });
        let items = [...parseModelItems(menu)];
        if (!items.length) {
            logModelDebug("menu empty on first pass; waiting for items", {
                menuId: menu.id || null,
            });
            items = await waitForMenuItems(menu);
        }
        logModelDebug("parsed menu items", {
            menuId: menu.id || null,
            count: items.length,
        });
        const submenuTriggers = menu.querySelectorAll(
            '[role="menuitem"][data-testid$="-submenu"]',
        );
        for (const trigger of submenuTriggers) {
            if (!(trigger instanceof HTMLElement)) continue;
            const controlsId = trigger.getAttribute("aria-controls") || "";
            logModelDebug("opening submenu trigger", {
                testId: trigger.getAttribute("data-testid") || null,
                controlsId,
            });
            const opened = await openSubmenuTrigger(trigger);
            if (!opened && !controlsId) continue;
            const submenuRoot = controlsId
                ? await waitForElementById(controlsId, 800)
                : null;
            if (submenuRoot instanceof HTMLElement) {
                if (!submenuRoot.querySelector('[data-testid^="model-switcher-"]')) {
                    await waitForMenuItems(submenuRoot);
                }
                const nestedItems = await collectModelMenuItems(
                    submenuRoot,
                    visitedMenus,
                );
                logModelDebug("submenu parsed", {
                    menuId: submenuRoot.id || null,
                    count: nestedItems.length,
                });
                items.push(...nestedItems);
            }
        }
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

    const fetchModelOptionsFromMenu = async () => {
        logModelDebug("attempting menu scrape for models");
        const result = await useModelMenu(async (menu) =>
            collectModelMenuItems(menu),
        );
        if (!Array.isArray(result)) return [];
        logModelDebug("menu scrape result", {
            count: result.length,
            models: result.map((model) => ({
                id: model.id,
                label: model.label,
            })),
        });
        return mergeModelOptions(result);
    };

    const shouldUseCachedModelList = (options = {}) => {
        if (options.force) return false;
        if (!STATE.models.length) return false;
        if (!lastModelFetchAt) return false;
        if (lastModelFetchSource !== "menu") return false;
        const age = Date.now() - lastModelFetchAt;
        if (age < MODEL_LIST_CACHE_MAX_MS) {
            logModelDebug("cache hit", {
                source: lastModelFetchSource,
                age,
                count: STATE.models.length,
            });
            return true;
        }
        return false;
    };

    const ensureModelOptions = async (options = {}) => {
        if (shouldUseCachedModelList(options)) return STATE.models;
        if (modelsPromise) return modelsPromise;
        modelsPromise = (async () => {
            const models = await fetchModelOptionsFromMenu();
            modelsPromise = null;
            if (!models.length) {
                logModelDebug("menu scrape returned no models; keeping existing list", {
                    existingCount: STATE.models.length,
                });
                return STATE.models;
            }
            lastModelFetchSource = "menu";
            lastModelFetchAt = Date.now();
            logModelDebug("model list refreshed", {
                source: "menu",
                count: models.length,
                models: models.map((model) => ({
                    id: model.id,
                    label: model.label,
                })),
            });
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
            logModelDebug("model refresh error", error);
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
            const item = await waitForModelMenuItem(menu, targetModelId, 3000);
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

    const closeModelDebugPopup = () => {
        document.getElementById("cq-model-debug")?.remove();
    };

    const showModelDebugPopup = (models) => {
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
        panel.style.fontFamily = '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
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

    const listModelsForDebug = async ({ force = true } = {}) => {
        try {
            const models = await ensureModelOptions({ force });
            if (!models.length) {
                console.info("[cq] No models available to list yet.");
                showModelDebugPopup([]);
                return;
            }
            const printable = models.map((model) => ({
                id: model.id,
                label: model.label,
                selected: !!model.selected,
            }));
            if (typeof console.table === "function") {
                console.table(printable);
            } else {
                console.log("[cq] Models:", printable);
            }
            showModelDebugPopup(printable);
        } catch (error) {
            console.warn("[cq] Failed to list models", error);
        }
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
    let canvasModeActive = false;
    const queueLabel = $("#cq-label");
    ui.setAttribute("aria-hidden", "true");
    if (list) {
        list.style.setProperty(
            "--cq-queue-content-fade-duration",
            `${QUEUE_CONTENT_FADE_DURATION_MS}ms`,
        );
    }

    let queueHeightRaf = 0;
    let lastQueueExpandedHeight = "";
    let queueCollapseAnimation = null;
    let lastRenderedCollapsed = null;

    function setQueueExpandedHeight(value) {
        if (!(list instanceof HTMLElement)) return;
        if (lastQueueExpandedHeight === value) return;
        lastQueueExpandedHeight = value;
        list.style.setProperty("--cq-queue-expanded-height", value);
    }

    function measureQueueExpandedHeight() {
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
    }

    function scheduleQueueHeightSync() {
        if (queueHeightRaf) return;
        queueHeightRaf = requestAnimationFrame(() => {
            queueHeightRaf = 0;
            measureQueueExpandedHeight();
        });
    }

    function flushQueueHeightSync() {
        if (queueHeightRaf) {
            cancelAnimationFrame(queueHeightRaf);
            queueHeightRaf = 0;
        }
        measureQueueExpandedHeight();
    }

    const parsePxValue = (value) => {
        if (typeof value !== "string") return 0;
        const numeric = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
        return Number.isFinite(numeric) ? numeric : 0;
    };

    function getQueueExpandedHeightValue() {
        if (!(list instanceof HTMLElement)) return 0;
        const computed = window.getComputedStyle(list);
        const declared =
            computed.getPropertyValue("--cq-queue-expanded-height") ||
            computed.getPropertyValue("--cq-queue-max-height") ||
            "";
        const numeric = parsePxValue(declared);
        if (numeric > 0) return numeric;
        return list.scrollHeight || 0;
    }

    function setQueueAnimationState(state) {
        if (!(list instanceof HTMLElement)) return;
        if (state) {
            list.dataset.cqAnimState = state;
        } else {
            delete list.dataset.cqAnimState;
        }
    }

    function cancelQueueAnimation({ preserveVisualState = false } = {}) {
        if (!(list instanceof HTMLElement)) {
            queueCollapseAnimation = null;
            return null;
        }
        let preservedHeight = null;
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
    }

    function animateQueueContainer(targetCollapsed) {
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
    }

    measureQueueExpandedHeight();

    const THREAD_LAYOUT_VARS = [
        "--thread-content-margin",
        "--thread-content-max-width",
    ];
    let threadLayoutSignature = "";
    let threadLayoutRaf = 0;
    let threadLayoutObserver = null;
    let observedLayoutNode = null;

    const applyThreadLayoutVars = (source) => {
        if (!(source instanceof HTMLElement)) return;
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

    const scheduleThreadLayoutSync = (source) => {
        const target = source || observedLayoutNode || composer();
        if (!(target instanceof HTMLElement)) return;
        if (threadLayoutRaf) cancelAnimationFrame(threadLayoutRaf);
        threadLayoutRaf = requestAnimationFrame(() => {
            threadLayoutRaf = 0;
            applyThreadLayoutVars(target);
        });
    };

    const observeThreadLayoutSource = (node) => {
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

    window.addEventListener("resize", () => scheduleThreadLayoutSync());

    const locateCanvasPanel = () => {
        const marked = document.querySelector("[data-cq-canvas-panel='true']");
        if (marked) return marked;
        const candidate = document.querySelector(
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

    const syncCanvasMode = (force = false) => {
        const next = isCanvasWorkspaceOpen();
        if (!force && next === canvasModeActive) return;
        canvasModeActive = next;
        ui.classList.toggle("cq-canvas-mode", canvasModeActive);
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

    const entryPreviewText = (entry, index) => {
        const raw =
            (typeof entry?.text === "string" ? entry.text : "").trim() ||
            `Follow-up #${(index ?? 0) + 1}`;
        return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
    };

    const showDeleteConfirmDialog = (entry, index) =>
        new Promise((resolve) => {
            const title = "Delete follow-up?";
            const preview = entryPreviewText(entry, index);
            const previousActive = document.activeElement;

            const modalRoot = document.createElement("div");
            modalRoot.dataset.cqModal = "true";
            modalRoot.dataset.testid = "cq-delete-followup";
            modalRoot.className = "absolute inset-0";

            const overlay = document.createElement("div");
            overlay.dataset.state = "open";
            overlay.dataset.modalLayer = "overlay";
            overlay.style.pointerEvents = "auto";
            overlay.className =
                "fixed inset-0 z-50 before:starting:backdrop-blur-0 before:absolute before:inset-0 before:bg-gray-200/50 before:backdrop-blur-[1px] before:transition before:duration-250 dark:before:bg-black/50 before:starting:opacity-0";

            const grid = document.createElement("div");
            grid.className =
                "z-50 h-full w-full overflow-y-auto grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,0.8fr)_auto_minmax(20px,1fr)]";

            const dialog = document.createElement("div");
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            dialog.dataset.modalLayer = "content";
            dialog.dataset.state = "open";
            dialog.style.pointerEvents = "auto";
            dialog.className =
                "popover bg-token-bg-primary relative col-auto col-start-2 row-auto row-start-2 h-full w-full text-start start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-long flex flex-col focus:outline-hidden max-w-md overflow-hidden";
            dialog.tabIndex = -1;

            const header = document.createElement("header");
            header.className =
                "min-h-header-height flex justify-between p-2.5 ps-4 select-none";
            const headerWrap = document.createElement("div");
            headerWrap.className = "flex max-w-full items-center";
            const headerTextWrap = document.createElement("div");
            headerTextWrap.className = "flex max-w-full min-w-0 grow flex-col";
            const h2 = document.createElement("h2");
            h2.className = "text-token-text-primary text-lg font-normal";
            h2.textContent = title;
            headerTextWrap.appendChild(h2);
            headerWrap.appendChild(headerTextWrap);
            header.appendChild(headerWrap);
            const headerActions = document.createElement("div");
            headerActions.className = "flex h-[max-content] items-center gap-2";
            header.appendChild(headerActions);

            const body = document.createElement("div");
            body.className = "grow overflow-y-auto p-4 pt-1";
            const bodyLine = document.createElement("div");
            bodyLine.textContent = "This will delete ";
            const strong = document.createElement("strong");
            strong.textContent = preview;
            bodyLine.appendChild(strong);
            bodyLine.append(".");
            body.appendChild(bodyLine);

            const footer = document.createElement("div");
            footer.className =
                "grow overflow-y-auto p-4 pt-1 flex flex-col justify-end text-sm select-none";
            const footerInner = document.createElement("div");
            footerInner.className = "flex w-full flex-row items-center justify-end";
            const buttonRow = document.createElement("div");
            buttonRow.className =
                "flex flex-col gap-3 sm:flex-row-reverse mt-5 sm:mt-4 flex w-full flex-row-reverse";
            const confirmBtn = document.createElement("button");
            confirmBtn.className = "btn relative btn-danger";
            confirmBtn.type = "button";
            confirmBtn.dataset.testid = "cq-delete-queue-confirm";
            confirmBtn.innerHTML =
                '<div class="flex items-center justify-center">Delete</div>';
            const cancelBtn = document.createElement("button");
            cancelBtn.className = "btn relative btn-secondary";
            cancelBtn.type = "button";
            cancelBtn.innerHTML =
                '<div class="flex items-center justify-center">Cancel</div>';
            buttonRow.append(confirmBtn, cancelBtn);
            footerInner.appendChild(buttonRow);
            footer.appendChild(footerInner);

            dialog.append(header, body, footer);
            grid.appendChild(dialog);
            overlay.appendChild(grid);
            modalRoot.appendChild(overlay);

            const cleanup = (result) => {
                modalRoot.remove();
                document.removeEventListener("keydown", onKeyDown, true);
                previousActive?.focus?.({ preventScroll: true });
                resolve(result);
            };

            const onKeyDown = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    cleanup(false);
                }
            };

            overlay.addEventListener("click", (event) => {
                if (event.target === overlay || event.target === grid) {
                    cleanup(false);
                }
            });
            cancelBtn.addEventListener("click", () => cleanup(false));
            confirmBtn.addEventListener("click", () => cleanup(true));

            document.addEventListener("keydown", onKeyDown, true);
            document.body.appendChild(modalRoot);
            requestAnimationFrame(() => {
                confirmBtn.focus();
            });
        });

    const deleteQueueEntry = (index) => {
        if (!Number.isInteger(index)) return false;
        if (index < 0 || index >= STATE.queue.length) return false;
        STATE.queue.splice(index, 1);
        save();
        refreshAll();
        return true;
    };

    const focusAfterDeletion = (index) => {
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

    const requestDeleteEntry = (index, { skipConfirm = false } = {}) => {
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

    let saveTimer;
    let hydrated = false; // gate UI visibility until persisted state is loaded
    let legacyStateMigrated = false;
    let activeConversationIdentifier = resolveConversationIdentifier();
    let dragIndex = null;
    let dragOverItem = null;
    let dragOverPosition = null;

    // Persist ------------------------------------------------------------------
    const applyPersistedState = (snapshot) => {
        const cq =
            snapshot && typeof snapshot === "object" ? snapshot : null;
        STATE.running = false; // Always queue mode, never auto-send
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
        refreshAll();
        hydrated = true;
        refreshVisibility();
    };

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

    const save = (identifier = activeConversationIdentifier) => {
        if (!chrome.storage?.local?.set) return;
        const storageKey = storageKeyForIdentifier(identifier);
        const payload = persistable();
        try {
            chrome.storage.local.set({ [storageKey]: payload }, () => {
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

    const resolveQueueEntryModelLabel = (entry) => {
        if (!entry) return resolveCurrentModelButtonValue() || "Select model";
        if (entry.model) {
            return labelForModel(entry.model, entry.modelLabel || entry.model);
        }
        if (entry.modelLabel) return entry.modelLabel;
        if (currentModelId) {
            return labelForModel(
                currentModelId,
                currentModelLabel || currentModelId,
            );
        }
        return resolveCurrentModelButtonValue() || "Select model";
    };

    const resolveQueueEntryThinkingLabel = (entry) => {
        const sourceId = entry?.thinking || getCurrentThinkingOption();
        const normalized = normalizeThinkingOptionId(sourceId);
        if (!normalized) return DEFAULT_THINKING_BUTTON_LABEL;
        if (normalized === "standard") return "Thinking";
        const label = labelForThinkingOption(normalized, DEFAULT_THINKING_BUTTON_LABEL);
        if (!label) return DEFAULT_THINKING_BUTTON_LABEL;
        return `${label} thinking`;
    };

    const setEntryThinkingOption = (index, value) => {
        const entry = STATE.queue[index];
        if (!entry) return;
        if (!supportsThinkingForModel(entry.model, entry.modelLabel)) {
            if (entry.thinking) {
                entry.thinking = null;
                scheduleSave();
                refreshAll();
            }
            return;
        }
        const normalized = normalizeThinkingOptionId(value);
        const nextValue = normalized || null;
        if (entry.thinking === nextValue) return;
        entry.thinking = nextValue;
        scheduleSave();
        closeThinkingDropdown();
        refreshAll();
    };

    const applyModelSelectionToEntry = (index, model) => {
        if (!model?.id) return;
        const entry = STATE.queue[index];
        if (!entry) return;
        const canonicalId = applyModelIdAlias(model.id);
        entry.model = canonicalId;
        entry.modelLabel = model.label || canonicalId;
        if (!supportsThinkingForModel(entry.model, entry.modelLabel)) {
            entry.thinking = null;
        }
        refreshAll();
        scheduleSave();
    };

    const openQueueEntryModelDropdown = async (index, anchor) => {
        if (!Number.isInteger(index)) return;
        const entry = STATE.queue[index];
        if (!entry || !(anchor instanceof HTMLElement)) return;
        await openModelDropdownForAnchor(anchor, {
            selectedModelId: entry.model,
            onSelect: (model) => {
                closeModelDropdown();
                applyModelSelectionToEntry(index, model);
            },
        });
    };

    const persistActiveConversationState = () => {
        if (!hydrated) return;
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        save(activeConversationIdentifier);
    };

    const load = (identifier = activeConversationIdentifier) =>
        new Promise((resolve) => {
            const finish = (snapshot) => {
                applyPersistedState(snapshot);
                resolve();
            };

            if (!chrome.storage?.local?.get) {
                finish(null);
                return;
            }

            const storageKey = storageKeyForIdentifier(identifier);
            const keys = legacyStateMigrated
                ? [storageKey]
                : [storageKey, LEGACY_STORAGE_KEY];

            try {
                chrome.storage.local.get(keys, (result = {}) => {
                    const error = chrome.runtime?.lastError;
                    if (error && !isContextInvalidatedError(error)) {
                        console.error("cq: failed to load persisted state", error);
                    }
                    let snapshot = result[storageKey];
                    if (!legacyStateMigrated) {
                        const legacy = result[LEGACY_STORAGE_KEY];
                        if (legacy !== undefined) {
                            legacyStateMigrated = true;
                            if (!snapshot && legacy) {
                                snapshot = legacy;
                                if (chrome.storage?.local?.set) {
                                    try {
                                        chrome.storage.local.set(
                                            { [storageKey]: legacy },
                                            () => {
                                                chrome.storage?.local?.remove?.(
                                                    LEGACY_STORAGE_KEY,
                                                );
                                            },
                                        );
                                    } catch (setError) {
                                        if (
                                            !isContextInvalidatedError(setError)
                                        ) {
                                            console.error(
                                                "cq: failed to migrate legacy state",
                                                setError,
                                            );
                                        }
                                    }
                                } else {
                                    chrome.storage?.local?.remove?.(
                                        LEGACY_STORAGE_KEY,
                                    );
                                }
                            } else {
                                chrome.storage?.local?.remove?.(
                                    LEGACY_STORAGE_KEY,
                                );
                            }
                        } else {
                            legacyStateMigrated = true;
                        }
                    }
                    finish(snapshot || null);
                });
            } catch (error) {
                if (isContextInvalidatedError(error)) {
                    finish(null);
                } else {
                    console.error("cq: failed to load persisted state", error);
                    finish(null);
                }
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

    function refreshComposerModelLabelButton() {
        if (!composerModelLabelButton) return;
        if (
            composerModelLabelButtonValue &&
            !composerModelLabelButton.contains(composerModelLabelButtonValue)
        ) {
            composerModelLabelButtonValue = null;
        }
        if (!composerModelLabelButtonValue) {
            composerModelLabelButtonValue =
                composerModelLabelButton.querySelector(
                    ".cq-composer-models-btn__value",
                );
        }
        const label = resolveCurrentModelButtonValue();
        if (composerModelLabelButtonValue) {
            composerModelLabelButtonValue.textContent = label;
        }
        const tooltip = `Show available models. Current: ${label}`;
        composerModelLabelButton.setAttribute("aria-label", tooltip);
        composerModelLabelButton.title = tooltip;
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
        if (
            composerModelLabelButton &&
            !composerModelLabelButton.isConnected
        ) {
            composerModelLabelButton = null;
            composerModelLabelButtonValue = null;
            closeModelDropdown();
        }
        ensureComposerControls();
        refreshComposerModelLabelButton();
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
        refreshPauseLabel();
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
    }

    function setCollapsed(collapsed, persist = true) {
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
        scheduleQueueHeightSync();
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
        refreshAll();
    };

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
    const THREAD_HOST_SELECTOR = "[class*='thread-content']";

    const findThreadContentHost = (rootNode, container, anchor) => {
        if (rootNode instanceof HTMLElement) {
            const closestHost = rootNode.closest(THREAD_HOST_SELECTOR);
            if (closestHost) return closestHost;
        }
        const scopes = [];
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

    const firstNonQueueChild = (parent) => {
        if (!parent) return null;
        let child = parent.firstChild;
        while (child) {
            if (child !== ui) return child;
            child = child.nextSibling;
        }
        return null;
    };

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
        const SPEECH_BUTTON_CONTAINER_SELECTOR =
            '[data-testid="composer-speech-button-container"]';

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

        if (!composerModelLabelButton) {
            const button = document.createElement("button");
            button.type = "button";
            button.id = "cq-composer-models-btn";
            button.className = "cq-composer-models-btn";
            const value = document.createElement("span");
            value.className = "cq-composer-models-btn__value";
            value.textContent = resolveCurrentModelButtonValue();
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
        composerHoldButton.className = `${sharedClasses} cq-composer-hold-btn`;

        if (
            !mountComposerModelLabelBeforeDictate(root) &&
            mountComposerModelLabelInControls()
        ) {
            composerModelLabelPlacement = "controls";
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
        const notifyQueueSizeChange = () => scheduleQueueHeightSync();
        thumb.addEventListener("load", notifyQueueSizeChange);
        thumb.addEventListener("error", notifyQueueSizeChange);
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
        closeThinkingDropdown();
        list.textContent = "";
        if (STATE.queue.length === 0) {
            scheduleQueueHeightSync();
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

            const thinkingPill = createQueueEntryThinkingPill(entry, index);
            if (thinkingPill) {
                actions.appendChild(thinkingPill);
            }

            const modelButton = document.createElement("button");
            modelButton.type = "button";
            modelButton.className = "cq-composer-models-btn";
            modelButton.dataset.entryIndex = String(index);
            const modelValue = document.createElement("span");
            modelValue.className = "cq-composer-models-btn__value";
            modelValue.textContent = resolveQueueEntryModelLabel(entry);
            modelButton.appendChild(modelValue);
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
        const scheduleMeasureAfterAutosize = () => scheduleQueueHeightSync();
        if (textareasToSize.length) {
            requestAnimationFrame(() => {
                textareasToSize.forEach((area) => autoSize(area));
                scheduleMeasureAfterAutosize();
            });
        } else {
            scheduleMeasureAfterAutosize();
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
        const targetModelId = desiredModel || currentModelId;
        const targetModelLabel = desiredModel
            ? entry.modelLabel || labelForModel(desiredModel, desiredModel)
            : labelForModel(currentModelId, currentModelLabel);
        const desiredThinking =
            entry.thinking &&
            supportsThinkingForModel(targetModelId, targetModelLabel)
                ? entry.thinking
                : null;

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

        if (desiredThinking) {
            const thinkingApplied = await selectThinkingTimeOption(desiredThinking);
            if (!thinkingApplied) {
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
        if (!root) return false;
        if (countComposerAttachments(root) > 0) return true;
        return countFilesInInputs(root) > 0;
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
        const attachments = await gatherComposerAttachments(root);
        if (!text && attachments.length === 0) return false;
        if (attachmentCount > 0 && attachments.length === 0) {
            console.warn(
                "[cq] Unable to capture composer attachments; queue aborted.",
            );
            return false;
        }
        const modelId = currentModelId || null;
        const modelLabel = modelId
            ? labelForModel(modelId, currentModelLabel)
            : null;
        const thinking =
            modelId &&
            supportsThinkingForModel(modelId, modelLabel || currentModelLabel)
                ? getCurrentThinkingOption()
                : null;
        STATE.queue.push({
            text,
            attachments: attachments.map((attachment) =>
                cloneAttachment(attachment),
            ),
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
            const skipConfirm = !!event.altKey;
            requestDeleteEntry(index, { skipConfirm });
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

    const matchesModelListingShortcut = (event) => {
        if (!event || typeof event.key !== "string") return false;
        if (!event.shiftKey || event.altKey) return false;
        const normalized =
            event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (normalized !== "h") return false;
        const metaOnly = event.metaKey && !event.ctrlKey;
        const ctrlOnly = event.ctrlKey && !event.metaKey;
        return metaOnly || ctrlOnly;
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
                return;
            }
            if (matchesModelListingShortcut(event)) {
                event.preventDefault();
                openModelSwitcherDropdown();
                return;
            }
            const modelShortcutIndex = resolveModelShortcutIndex(event);
            if (modelShortcutIndex) {
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

    const handleConversationChangeIfNeeded = () => {
        const nextIdentifier = resolveConversationIdentifier();
        if (nextIdentifier === activeConversationIdentifier) return;
        persistActiveConversationState();
        activeConversationIdentifier = nextIdentifier;
        resetStateForNewConversation();
        load(nextIdentifier)
            .then(() => ensureModelOptions())
            .catch(() => {});
    };

    const conversationChangeInterval = window.setInterval(
        handleConversationChangeIfNeeded,
        800,
    );

    window.addEventListener("popstate", handleConversationChangeIfNeeded);
    window.addEventListener("hashchange", handleConversationChangeIfNeeded);

    if (typeof history === "object" && history) {
        ["pushState", "replaceState"].forEach((method) => {
            const original = history[method];
            if (typeof original !== "function") return;
            history[method] = function cqPatchedHistoryMethod(...args) {
                const result = original.apply(this, args);
                handleConversationChangeIfNeeded();
                return result;
            };
        });
    }

    window.addEventListener("beforeunload", () => {
        clearInterval(conversationChangeInterval);
        persistActiveConversationState();
    });

    // Handle SPA changes and rerenders -----------------------------------------
    const rootObserver = new MutationObserver(() => {
        scheduleControlRefresh();
        ensureMounted();
        refreshKeyboardShortcutPopover();
        handleConversationChangeIfNeeded();
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
