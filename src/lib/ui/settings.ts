import { createConfirmModal, type ModalElements } from "./modal";
import { h } from "./template";
import type { KeyboardShortcutEntry, ShortcutConfig, ShortcutKeyToken } from "../types";

export interface SettingsModalContext {
  getState: () => { shortcuts: ShortcutConfig };
  isApplePlatform: boolean;
  allShortcuts: KeyboardShortcutEntry[];
  onSave: (shortcuts: ShortcutConfig) => void;
}

export interface SettingsModalElements extends ModalElements {
  body: HTMLDivElement;
  shortcutsList: HTMLDivElement;
}

const KEY_DISPLAY_MAP: Record<string, { glyph: string; aria: string }> = {
  option: { glyph: "⌥", aria: "Option" },
  command: { glyph: "⌘", aria: "Command" },
  meta: { glyph: "⌘", aria: "Command" },
  shift: { glyph: "⇧", aria: "Shift" },
  control: { glyph: "⌃", aria: "Control" },
  ctrl: { glyph: "⌃", aria: "Control" },
  alt: { glyph: "Alt", aria: "Alt" },
  enter: { glyph: "⏎", aria: "Enter" },
  return: { glyph: "⏎", aria: "Return" },
  delete: { glyph: "⌫", aria: "Delete" },
  p: { glyph: "P", aria: "P" },
  period: { glyph: ".", aria: "Period" },
  arrowup: { glyph: "↑", aria: "Arrow Up" },
  arrowdown: { glyph: "↓", aria: "Arrow Down" },
};

const resolveKeyDisplay = (token: ShortcutKeyToken, isApplePlatform: boolean) => {
  if (typeof token !== "string") {
    return { glyph: "?", aria: "Key" };
  }

  const normalized = token.toLowerCase();

  if (KEY_DISPLAY_MAP[normalized]) {
    const display = KEY_DISPLAY_MAP[normalized];
    if (normalized === "control" || normalized === "ctrl") {
      return {
        glyph: isApplePlatform ? "⌃" : "Ctrl",
        aria: display.aria,
      };
    }
    return display;
  }

  const label = token.length === 1 ? token.toUpperCase() : token;

  return { glyph: label, aria: label };
};

const buildShortcutKeyGroup = (
  tokens: ShortcutKeyToken[],
  isApplePlatform: boolean,
): HTMLDivElement => {
  const wrapper = h("div", {
    className: "inline-flex whitespace-pre *:inline-flex *:font-sans gap-1",
  });
  tokens.forEach((token) => {
    const { glyph, aria } = resolveKeyDisplay(token, isApplePlatform);
    const kbd = h("kbd", {
      attrs: { "aria-label": aria },
      className: "px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs",
    });
    const span = h("span", {
      className: "min-w-[1em]",
      text: glyph,
    });
    kbd.appendChild(span);
    wrapper.appendChild(kbd);
  });
  return wrapper;
};

const normalizeKeyFromEvent = (event: KeyboardEvent): ShortcutKeyToken | null => {
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();

  if (key === "meta" || key === "cmd") return "command";
  if (key === "control" || key === "ctrl") return "control";
  if (key === "alt") return event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT ? "option" : "alt";
  if (key === "shift") return "shift";

  if (code.startsWith("arrow")) {
    return code.replace("arrow", "arrow") as ShortcutKeyToken;
  }

  if (key === "enter" || key === "return") return "enter";
  if (key === "backspace" || key === "delete") return "delete";
  if (key === "." || code === "period") return "period";
  if (key === "?" || key === "/") return key as ShortcutKeyToken;

  if (key.length === 1 && /[a-z0-9?/]/.test(key)) {
    return key as ShortcutKeyToken;
  }

  return null;
};

const captureShortcut = (
  isApplePlatform: boolean,
  callback: (macKeys: ShortcutKeyToken[], otherKeys: ShortcutKeyToken[]) => void,
): (() => void) => {
  let captured = false;
  const macKeys: ShortcutKeyToken[] = [];
  const otherKeys: ShortcutKeyToken[] = [];

  const handleKeyDown = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (captured) return;
    captured = true;

    const modifiers: ShortcutKeyToken[] = [];
    if (event.metaKey) modifiers.push("command");
    if (event.ctrlKey) modifiers.push("control");
    if (event.altKey) {
      modifiers.push(isApplePlatform ? "option" : "alt");
    }
    if (event.shiftKey) modifiers.push("shift");

    const key = normalizeKeyFromEvent(event);
    if (!key) {
      captured = false;
      return;
    }

    if (modifiers.length === 0 && key !== "enter" && key !== "delete") {
      captured = false;
      return;
    }

    const allKeys = [...modifiers, key];

    if (isApplePlatform) {
      macKeys.push(...allKeys);
      const otherModifiers = modifiers.map((m) => {
        if (m === "command") return "control";
        if (m === "option") return "alt";
        return m;
      });
      otherKeys.push(...otherModifiers, key);
    } else {
      otherKeys.push(...allKeys);
      const macModifiers = modifiers.map((m) => {
        if (m === "control") return "command";
        if (m === "alt") return "option";
        return m;
      });
      macKeys.push(...macModifiers, key);
    }

    callback(macKeys, otherKeys);
    cleanup();
  };

  const cleanup = () => {
    document.removeEventListener("keydown", handleKeyDown, true);
  };

  document.addEventListener("keydown", handleKeyDown, true);

  return cleanup;
};

export const createSettingsModal = (
  ctx: SettingsModalContext,
): SettingsModalElements => {
  const modal = createConfirmModal({
    title: "Keyboard Shortcuts",
    body: [],
    confirmLabel: "Close",
    cancelLabel: undefined,
    testId: "settings-modal",
  });

  const shortcutsList = h("div", {
    className: "flex flex-col gap-4",
  });

  const renderShortcutRow = (entry: KeyboardShortcutEntry) => {
    const row = h("div", {
      className: "flex items-center justify-between gap-4 py-2 border-b border-gray-200 dark:border-gray-700",
    });

    const labelCol = h("div", {
      className: "flex-1",
      text: entry.label,
    });

    const keysCol = h("div", {
      className: "flex items-center gap-2",
    });

    const customShortcut = ctx.getState().shortcuts[entry.id];
    const displayKeys = customShortcut
      ? ctx.isApplePlatform
        ? customShortcut.macKeys
        : customShortcut.otherKeys
      : ctx.isApplePlatform
        ? entry.macKeys
        : entry.otherKeys;

    const keysDisplay = buildShortcutKeyGroup(displayKeys, ctx.isApplePlatform);
    keysCol.appendChild(keysDisplay);

    const recordButton = h("button", {
      className: "px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
      text: "Record",
      attrs: { type: "button" },
    });

    let recordingCleanup: (() => void) | null = null;
    let recordingState = false;

    const updateRecordingState = (isRecording: boolean) => {
      recordingState = isRecording;
      if (isRecording) {
        recordButton.textContent = "Press keys...";
        recordButton.disabled = true;
        recordButton.className = "px-3 py-1 text-xs border border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded";
      } else {
        recordButton.textContent = "Record";
        recordButton.disabled = false;
        recordButton.className = "px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800";
      }
    };

    recordButton.addEventListener("click", () => {
      if (recordingState) {
        if (recordingCleanup) {
          recordingCleanup();
          recordingCleanup = null;
        }
        updateRecordingState(false);
        return;
      }

      updateRecordingState(true);

      recordingCleanup = captureShortcut(ctx.isApplePlatform, (macKeys, otherKeys) => {
        const currentState = ctx.getState();
        const newShortcuts = {
          ...currentState.shortcuts,
          [entry.id]: { macKeys, otherKeys },
        };
        ctx.onSave(newShortcuts);
        updateRecordingState(false);
        renderAllShortcuts();
      });
    });

    const resetButton = h("button", {
      className: "px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
      text: "Reset",
      attrs: { type: "button" },
    });

    resetButton.addEventListener("click", () => {
      const currentState = ctx.getState();
      const newShortcuts = { ...currentState.shortcuts };
      delete newShortcuts[entry.id];
      ctx.onSave(newShortcuts);
      renderAllShortcuts();
    });

    const buttonGroup = h("div", {
      className: "flex gap-2",
    });
    buttonGroup.appendChild(recordButton);
    if (customShortcut) {
      buttonGroup.appendChild(resetButton);
    }

    keysCol.appendChild(buttonGroup);
    row.appendChild(labelCol);
    row.appendChild(keysCol);

    return row;
  };

  const renderAllShortcuts = () => {
    shortcutsList.textContent = "";
    ctx.allShortcuts.forEach((entry) => {
      const row = renderShortcutRow(entry);
      shortcutsList.appendChild(row);
    });
  };

  renderAllShortcuts();

  modal.body.appendChild(shortcutsList);

  modal.cancelButton.style.display = "none";
  modal.confirmButton.addEventListener("click", () => {
    modal.root.remove();
  });

  return {
    ...modal,
    shortcutsList,
  };
};
