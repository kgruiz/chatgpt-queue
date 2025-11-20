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
    className: "cq-keys-group",
  });
  tokens.forEach((token) => {
    const { glyph, aria } = resolveKeyDisplay(token, isApplePlatform);
    const kbd = h("kbd", {
      attrs: { "aria-label": aria },
      className: "cq-key",
    });
    const span = h("span", {
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
    confirmLabel: "",
    confirmVariant: "btn-text",
    cancelLabel: undefined,
    testId: "settings-modal",
  });

  modal.body.classList.add("cq-settings-body");
  // Give the settings modal more horizontal room so grids can form columns.
  modal.dialog.style.maxWidth = "900px";
  modal.dialog.style.width = "min(900px, calc(100vw - 32px))";
  modal.dialog.classList.add("cq-settings-dialog");

  const shell = h("div", { className: "cq-settings-shell" });

  const nav = h("nav", {
    className: "cq-settings-nav",
    attrs: { role: "tablist", "aria-orientation": "vertical" },
  });
  const navClose = h("button", {
    className: "cq-settings-close",
    attrs: { type: "button", "aria-label": "Close settings" },
  });
  navClose.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon">
      <path d="M14.2548 4.75488C14.5282 4.48152 14.9717 4.48152 15.2451 4.75488C15.5184 5.02825 15.5184 5.47175 15.2451 5.74512L10.9902 10L15.2451 14.2549L15.3349 14.3652C15.514 14.6369 15.4841 15.006 15.2451 15.2451C15.006 15.4842 14.6368 15.5141 14.3652 15.335L14.2548 15.2451L9.99995 10.9902L5.74506 15.2451C5.4717 15.5185 5.0282 15.5185 4.75483 15.2451C4.48146 14.9718 4.48146 14.5282 4.75483 14.2549L9.00971 10L4.75483 5.74512L4.66499 5.63477C4.48589 5.3631 4.51575 4.99396 4.75483 4.75488C4.99391 4.51581 5.36305 4.48594 5.63471 4.66504L5.74506 4.75488L9.99995 9.00977L14.2548 4.75488Z"></path>
    </svg>
  `;
  navClose.addEventListener("click", () => modal.root.remove());
  const navCloseWrap = h("div", { className: "cq-settings-nav-close" });
  navCloseWrap.appendChild(navClose);
  nav.appendChild(navCloseWrap);

  let searchQuery = "";

  const searchInput = h("input", {
    className: "cq-settings-search",
    attrs: {
      type: "search",
      placeholder: "Search shortcuts",
      spellcheck: "false",
    },
  }) as HTMLInputElement;

  const contentColumn = h("div", { className: "cq-settings-content" });

  const shortcutsList = h("div", {
    className: "cq-settings-list cq-settings-grid",
  });

  let activeSectionId: string | null = null;

  const groupShortcuts = (entries: KeyboardShortcutEntry[]) => {
    const sections: { title: string; entries: KeyboardShortcutEntry[] }[] = [
      { title: "Queue", entries: [] },
      { title: "Navigation", entries: [] },
      { title: "Models", entries: [] },
      { title: "Thinking", entries: [] },
      { title: "Other", entries: [] },
    ];

    entries.forEach((entry) => {
      if (entry.id.startsWith("queue-focus")) {
        sections[1].entries.push(entry);
        return;
      }
      if (entry.id.startsWith("queue-")) {
        sections[0].entries.push(entry);
        return;
      }
      if (entry.id.startsWith("model-select")) {
        sections[2].entries.push(entry);
        return;
      }
      if (entry.id.startsWith("thinking-")) {
        sections[3].entries.push(entry);
        return;
      }
      sections[4].entries.push(entry);
    });

    return sections.filter((section) => section.entries.length > 0);
  };

  const renderShortcutRow = (entry: KeyboardShortcutEntry) => {
    const row = h("div", {
      className: "cq-settings-row",
    });

    const labelCol = h("div", {
      className: "cq-settings-label",
      text: entry.label,
    });

    const keysCol = h("div", {
      className: "cq-settings-actions",
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
      className: "cq-btn cq-btn-record",
      text: "Edit",
      attrs: { type: "button" },
    });

    let recordingCleanup: (() => void) | null = null;
    let recordingState = false;

    const updateRecordingState = (isRecording: boolean) => {
      recordingState = isRecording;
      if (isRecording) {
        recordButton.textContent = "Press keys...";
        recordButton.classList.add("is-recording");
        recordButton.disabled = true;
      } else {
        recordButton.textContent = "Edit";
        recordButton.classList.remove("is-recording");
        recordButton.disabled = false;
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
      className: "cq-btn cq-btn-reset",
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
      className: "cq-btn-group",
    });

    // Only show reset if custom
    if (customShortcut) {
      buttonGroup.appendChild(resetButton);
    }
    buttonGroup.appendChild(recordButton);

    keysCol.appendChild(buttonGroup);
    row.appendChild(labelCol);
    row.appendChild(keysCol);

    return row;
  };

  const renderAllShortcuts = () => {
    shortcutsList.textContent = "";
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? ctx.allShortcuts.filter((entry) =>
          entry.label.toLowerCase().includes(query),
        )
      : ctx.allShortcuts;

    const sections = groupShortcuts(filtered);

    nav.textContent = "";
    const emptyNav = h("div", {
      className: "cq-settings-empty",
      text: "No shortcuts",
    });

    if (!sections.length) {
      shortcutsList.textContent = "";
      shortcutsList.appendChild(
        h("div", {
          className: "cq-settings-empty",
          text: "No shortcuts match your search.",
        }),
      );
      nav.appendChild(emptyNav);
      return;
    }

    sections.forEach((section, index) => {
      const sectionId = `shortcut-section-${section.title.toLowerCase().replace(/\s+/g, "-")}`;
      const navBtn = h("button", {
        className: `cq-settings-nav-btn${index === 0 ? " is-active" : ""}`,
        attrs: {
          type: "button",
          role: "tab",
          "aria-controls": sectionId,
        },
        text: section.title,
      });
      navBtn.addEventListener("click", () => {
        activeSectionId = sectionId;
        nav.querySelectorAll<HTMLButtonElement>(".cq-settings-nav-btn").forEach((btn) =>
          btn.classList.toggle("is-active", btn === navBtn),
        );
        const target = shortcutsList.querySelector<HTMLElement>(`#${sectionId}`);
        shortcutsList.querySelectorAll<HTMLElement>(".cq-settings-section").forEach((panel) => {
          const isActive = panel.id === sectionId;
          panel.hidden = !isActive;
          panel.dataset.active = isActive ? "true" : "false";
        });
        target?.focus?.({ preventScroll: true });
      });
      nav.appendChild(navBtn);
    });

    shortcutsList.textContent = "";

    sections.forEach((section) => {
      const sectionId = `shortcut-section-${section.title.toLowerCase().replace(/\s+/g, "-")}`;
      const sectionEl = h("div", {
        className: "cq-settings-section",
        attrs: { id: sectionId, role: "tabpanel", tabindex: "-1" },
      });
      const heading = h("div", {
        className: "cq-settings-section-title",
        text: section.title,
      });
      const list = h("div", { className: "cq-settings-list cq-settings-grid" });
      section.entries.forEach((entry) => {
        const row = renderShortcutRow(entry);
        list.appendChild(row);
      });
      sectionEl.append(heading, list);
      sectionEl.dataset.active = sectionId === activeSectionId ? "true" : "false";
      sectionEl.hidden = sectionId !== activeSectionId;
      shortcutsList.appendChild(sectionEl);
    });
  };

  renderAllShortcuts();
  // Ensure an initial active section
  if (!activeSectionId) {
    const firstSection = shortcutsList.querySelector<HTMLElement>(".cq-settings-section");
    activeSectionId = firstSection?.id || null;
    if (activeSectionId) {
      shortcutsList.querySelectorAll<HTMLElement>(".cq-settings-section").forEach((panel) => {
        const isActive = panel.id === activeSectionId;
        panel.hidden = !isActive;
        panel.dataset.active = isActive ? "true" : "false";
      });
      nav.querySelectorAll<HTMLButtonElement>(".cq-settings-nav-btn").forEach((btn) => {
        const controls = btn.getAttribute("aria-controls");
        btn.classList.toggle("is-active", controls === activeSectionId);
      });
    }
  }

  const searchWrap = h("div", { className: "cq-settings-search-wrap" });
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value || "";
    renderAllShortcuts();
  });
  searchWrap.appendChild(searchInput);

  contentColumn.append(searchWrap, shortcutsList);
  shell.append(nav, contentColumn);

  modal.body.textContent = "";
  modal.body.appendChild(shell);

  // Hide the cancel button as it is not needed
  modal.cancelButton.style.display = "none";
  modal.footer.style.display = "none";
  modal.confirmButton.style.display = "none";

  // Use confirm button as close
  const closeModal = () => {
    modal.root.remove();
  };
  modal.confirmButton.addEventListener("click", closeModal);
  modal.overlay.addEventListener("click", (event) => {
    if (event.target === modal.overlay || event.target === modal.container) {
      closeModal();
    }
  });
  modal.dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  });

  return {
    ...modal,
    shortcutsList,
  };
};
