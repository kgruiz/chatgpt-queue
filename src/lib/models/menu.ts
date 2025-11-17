import type { QueueModelDefinition, QueueModelGroupMeta } from "../types";

export const MODEL_DROPDOWN_ID = "cq-model-dropdown";

const MODEL_DESCRIPTION_MAP: Record<string, string> = {
  auto: "Decides how long to think",
  instant: "Answers right away",
  "t-mini": "Thinks quickly",
  mini: "Thinks quickly",
  thinking: "Thinks longer for better answers",
  pro: "Research-grade intelligence",
};

const describeModel = (model: QueueModelDefinition): string => {
  const slug = String(model?.id || "").toLowerCase();
  if (!slug) return "";
  for (const key of Object.keys(MODEL_DESCRIPTION_MAP)) {
    if (slug.includes(key)) {
      return MODEL_DESCRIPTION_MAP[key];
    }
  }
  return slug;
};

export interface ModelMenuSection {
  name: string | null;
  models: QueueModelDefinition[];
}

export interface ModelMenuGroupLayout {
  key: string;
  label: string;
  order: number;
  models: QueueModelDefinition[];
}

export interface ModelMenuLayout {
  heading: string;
  sections: ModelMenuSection[];
  groups: ModelMenuGroupLayout[];
  normalizedSelectedId: string;
}

export interface ModelMenuLayoutOptions {
  normalizeModelId: (value: string) => string;
  dedupeModels: (models: QueueModelDefinition[]) => QueueModelDefinition[];
  resolveModelOrder: (model: QueueModelDefinition) => number;
  resolveHeading: (
    models: QueueModelDefinition[],
    selectedModelId?: string | null,
  ) => string;
  getGroupMeta?: (groupId: string) => QueueModelGroupMeta | undefined;
  selectedModelId?: string | null;
}

export const deriveModelMenuLayout = (
  models: QueueModelDefinition[],
  options: ModelMenuLayoutOptions,
): ModelMenuLayout => {
  const deduped = options.dedupeModels(models);
  const normalizedSelectedId = options.normalizeModelId(
    options.selectedModelId || "",
  );
  const inlineModels = deduped
    .filter((model) => !model.group)
    .sort((a, b) => options.resolveModelOrder(a) - options.resolveModelOrder(b));
  const sections: ModelMenuSection[] = [];
  inlineModels.forEach((model) => {
    const sectionName = String(model?.section || "").trim() || null;
    let section = sections.find((entry) => entry.name === sectionName);
    if (!section) {
      section = { name: sectionName, models: [] };
      sections.push(section);
    }
    section.models.push(model);
  });

  const groupedModels = deduped.filter((model) => !!model.group);
  const groupedMap = new Map<string, ModelMenuGroupLayout>();
  groupedModels.forEach((model) => {
    const key = model.group;
    if (!key) return;
    const existing = groupedMap.get(key);
    const fallbackMeta = options.getGroupMeta?.(key);
    const baseOrder = options.resolveModelOrder(model);
    if (existing) {
      existing.models.push(model);
      if (!existing.label && model.groupLabel) {
        existing.label = model.groupLabel;
      }
      if (!Number.isFinite(existing.order)) {
        existing.order = fallbackMeta?.order ?? baseOrder;
      }
      return;
    }
    groupedMap.set(key, {
      key,
      label: model.groupLabel || fallbackMeta?.label || "More models",
      order: fallbackMeta?.order ?? baseOrder,
      models: [model],
    });
  });

  const groups = Array.from(groupedMap.values())
    .map((group) => ({
      ...group,
      models: group.models.sort(
        (a, b) => options.resolveModelOrder(a) - options.resolveModelOrder(b),
      ),
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const heading = options.resolveHeading(deduped, options.selectedModelId);

  return {
    heading,
    sections,
    groups,
    normalizedSelectedId,
  };
};

export interface ModelMenuControllerOptions
  extends ModelMenuLayoutOptions {
  document?: Document;
  window?: Window;
  dropdownId?: string;
  log?: (event: string, payload?: Record<string, unknown>) => void;
}

export interface ModelMenuOpenOptions {
  anchor: HTMLElement;
  models: QueueModelDefinition[];
  selectedModelId?: string | null;
  onSelect?: (model: QueueModelDefinition) => void | Promise<void>;
}

export interface ModelMenuController {
  open(options: ModelMenuOpenOptions): void;
  toggle(options: ModelMenuOpenOptions): void;
  close(): void;
  contains(target: EventTarget | null): boolean;
}

const createMenuSectionLabel = (doc: Document, text: string | null) => {
  const label = doc.createElement("div");
  label.className = "__menu-label mb-0";
  label.textContent = String(text || "").trim();
  return label;
};

const createMenuSeparator = (doc: Document) => {
  const separator = doc.createElement("div");
  separator.setAttribute("role", "separator");
  separator.setAttribute("aria-orientation", "horizontal");
  separator.className = "bg-token-border-default h-px mx-4 my-1";
  return separator;
};

const createCheckIcon = (doc: Document) => {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  svg.classList.add("icon-sm");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M12.0961 2.91371C12.3297 2.68688 12.6984 2.64794 12.9779 2.83852C13.2571 3.02905 13.3554 3.38601 13.2299 3.68618L13.1615 3.81118L6.91152 12.9772C6.79412 13.1494 6.60631 13.2604 6.39882 13.2799C6.19137 13.2994 5.98565 13.226 5.83828 13.0788L2.08828 9.32875L1.99843 9.2184C1.81921 8.94677 1.84928 8.57767 2.08828 8.33852C2.3274 8.0994 2.69648 8.06947 2.96816 8.24868L3.07851 8.33852L6.23085 11.4909L12.0053 3.02211L12.0961 2.91371Z",
  );
  svg.appendChild(path);
  return svg;
};

const createSubmenuArrowIcon = (doc: Document) => {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  svg.classList.add("icon-sm", "-me-0.25");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M6.02925 3.02929C6.25652 2.80202 6.60803 2.77382 6.86616 2.94433L6.97065 3.02929L11.4707 7.52929C11.7304 7.78899 11.7304 8.211 11.4707 8.4707L6.97065 12.9707C6.71095 13.2304 6.28895 13.2304 6.02925 12.9707C5.76955 12.711 5.76955 12.289 6.02925 12.0293L10.0585 7.99999L6.02925 3.9707L5.94429 3.8662C5.77378 3.60807 5.80198 3.25656 6.02925 3.02929Z",
  );
  svg.appendChild(path);
  return svg;
};

const createModelDropdownItem = (
  doc: Document,
  model: QueueModelDefinition,
  selected: boolean,
  selectionHandler?: (model: QueueModelDefinition) => void | Promise<void>,
) => {
  const item = doc.createElement("div");
  item.className = "group __menu-item hoverable";
  item.setAttribute("role", "menuitem");
  item.tabIndex = 0;
  item.dataset.orientation = "vertical";
  item.dataset.radixCollectionItem = "";
  if (model?.id) {
    item.dataset.testid = `model-switcher-${model.id}`;
  }
  const body = doc.createElement("div");
  body.className = "min-w-0";
  const label = doc.createElement("span");
  label.className = "flex items-center gap-1";
  label.textContent = model?.label || model?.id || "Unknown model";
  const description = doc.createElement("div");
  description.className =
    "not-group-data-disabled:text-token-text-tertiary leading-dense mb-0.5 text-xs group-data-sheet-item:mt-0.5 group-data-sheet-item:mb-0";
  const descriptionText = String(
    (model?.description || "").trim() || describeModel(model),
  );
  description.textContent = descriptionText;
  if (!descriptionText) {
    description.hidden = true;
  }
  body.append(label, description);

  const trailing = doc.createElement("div");
  trailing.className = "trailing";
  if (selected) {
    trailing.appendChild(createCheckIcon(doc));
  } else {
    const span = doc.createElement("span");
    span.className = "icon";
    trailing.appendChild(span);
  }

  item.append(body, trailing);
  const triggerSelection = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    const result = selectionHandler?.(model);
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

export const createModelMenuController = (
  options: ModelMenuControllerOptions,
): ModelMenuController => {
  const doc = options.document ?? document;
  const win = options.window ?? window;
  const dropdownId = options.dropdownId || MODEL_DROPDOWN_ID;
  const log = options.log;

  let dropdown: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;
  let cleanup: Array<() => void> = [];
  let activeSubmenu: HTMLElement | null = null;
  let activeSubmenuTrigger: HTMLElement | null = null;
  let submenuCloseTimer: number | null = null;

  const registerCleanup = (
    target: EventTarget,
    evt: string,
    handler: EventListenerOrEventListenerObject,
    opts?: AddEventListenerOptions | boolean,
  ) => {
    if (!target || !(target as HTMLElement).addEventListener) return;
    (target as HTMLElement).addEventListener(evt, handler, opts);
    cleanup.push(() => {
      try {
        (target as HTMLElement).removeEventListener(evt, handler, opts);
      } catch (_) {
        /* noop */
      }
    });
  };

  const closeActiveModelSubmenu = () => {
    if (activeSubmenu?.parentNode) {
      activeSubmenu.parentNode.removeChild(activeSubmenu);
    }
    if (activeSubmenuTrigger instanceof HTMLElement) {
      activeSubmenuTrigger.dataset.state = "closed";
      activeSubmenuTrigger.setAttribute("aria-expanded", "false");
    }
    activeSubmenu = null;
    activeSubmenuTrigger = null;
  };

  const cancelModelSubmenuClose = () => {
    if (submenuCloseTimer) {
      win.clearTimeout(submenuCloseTimer);
      submenuCloseTimer = null;
    }
  };

  const scheduleModelSubmenuClose = () => {
    cancelModelSubmenuClose();
    submenuCloseTimer = win.setTimeout(() => {
      closeActiveModelSubmenu();
    }, 100);
  };

  const positionModelSubmenu = (wrapper: HTMLElement, trigger: HTMLElement) => {
    const triggerRect = trigger.getBoundingClientRect();
    const menu = wrapper.querySelector("[data-radix-menu-content]");
    if (!(menu instanceof HTMLElement)) return;
    const menuRect = menu.getBoundingClientRect();
    const gutter = 12;
    let left = triggerRect.right + gutter;
    let top = triggerRect.top;
    const maxLeft = win.innerWidth - menuRect.width - 8;
    if (left > maxLeft) {
      left = Math.max(8, triggerRect.left - menuRect.width - gutter);
    }
    if (top + menuRect.height > win.innerHeight - 8) {
      top = Math.max(8, win.innerHeight - menuRect.height - 8);
    }
    wrapper.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };

  const positionActiveModelSubmenu = () => {
    if (!activeSubmenu || !activeSubmenuTrigger) return;
    positionModelSubmenu(activeSubmenu, activeSubmenuTrigger);
  };

  const openModelSubmenuPanel = (
    trigger: HTMLElement,
    models: QueueModelDefinition[],
    selectionHandler: ((model: QueueModelDefinition) => void) | undefined,
    selectedModelId: string,
  ) => {
    if (!Array.isArray(models) || !models.length) return;
    if (activeSubmenuTrigger === trigger && activeSubmenu) {
      cancelModelSubmenuClose();
      positionActiveModelSubmenu();
      return;
    }
    closeActiveModelSubmenu();
    const wrapper = doc.createElement("div");
    wrapper.dataset.radixPopperContentWrapper = "";
    wrapper.style.position = "fixed";
    wrapper.style.left = "0px";
    wrapper.style.top = "0px";
    wrapper.style.transform = "translate(0px, 0px)";
    wrapper.style.minWidth = "max-content";
    wrapper.style.zIndex = "2147480000";
    wrapper.style.pointerEvents = "none";

    const menu = doc.createElement("div");
    menu.dataset.radixMenuContent = "";
    menu.dataset.side = "right";
    menu.dataset.align = "start";
    menu.dataset.orientation = "vertical";
    menu.dataset.state = "open";
    menu.setAttribute("role", "menu");
    menu.tabIndex = -1;
    menu.className =
      "z-50 max-w-xs rounded-2xl popover bg-token-main-surface-primary dark:bg-[#353535] shadow-long will-change-[opacity,transform] radix-side-bottom:animate-slideUpAndFade radix-side-left:animate-slideRightAndFade radix-side-right:animate-slideLeftAndFade radix-side-top:animate-slideDownAndFade py-1.5 select-none data-[unbound-width]:min-w-[unset] data-[custom-padding]:py-0 mt-2 max-h-[calc(100vh-300px)] min-w-[100px] overflow-auto";
    menu.style.pointerEvents = "auto";
    models.forEach((model) => {
      const selected =
        options.normalizeModelId(model?.id || "") === selectedModelId;
      menu.appendChild(
        createModelDropdownItem(doc, model, selected, selectionHandler),
      );
    });
    menu.addEventListener("pointerenter", cancelModelSubmenuClose);
    menu.addEventListener("pointerleave", scheduleModelSubmenuClose);
    wrapper.appendChild(menu);
    doc.body.appendChild(wrapper);
    activeSubmenu = wrapper;
    activeSubmenuTrigger = trigger;
    trigger.dataset.state = "open";
    trigger.setAttribute("aria-expanded", "true");
    positionModelSubmenu(wrapper, trigger);
  };

  const buildDropdown = (
    layout: ModelMenuLayout,
    selectionHandler?: (model: QueueModelDefinition) => void | Promise<void>,
  ) => {
    const wrapper = doc.createElement("div");
    wrapper.id = dropdownId;
    wrapper.dataset.radixPopperContentWrapper = "";
    wrapper.style.position = "fixed";
    wrapper.style.left = "0px";
    wrapper.style.top = "0px";
    wrapper.style.transform = "translate(0px, 0px)";
    wrapper.style.minWidth = "max-content";
    wrapper.style.zIndex = "2147480000";
    wrapper.style.pointerEvents = "none";

    const menu = doc.createElement("div");
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
    const heading = doc.createElement("div");
    heading.className = "__menu-label mb-0";
    heading.textContent = layout.heading;
    menu.appendChild(heading);

    let lastSection: string | null = null;
    layout.sections.forEach((section) => {
      const shouldSkipLabel =
        !lastSection &&
        section.name &&
        layout.heading &&
        section.name.toLowerCase() === layout.heading.toLowerCase();
      if (section.name) {
        if (!shouldSkipLabel) {
          menu.appendChild(createMenuSectionLabel(doc, section.name));
          log?.("composer dropdown section", {
            section: section.name,
            previous: lastSection,
          });
        }
        lastSection = section.name;
      } else if (!section.name) {
        log?.("composer dropdown section missing", {});
      }
      section.models.forEach((model) => {
        const selected = layout.normalizedSelectedId
          ? options.normalizeModelId(model?.id || "") ===
            layout.normalizedSelectedId
          : !!model?.selected;
        menu.appendChild(
          createModelDropdownItem(doc, model, selected, selectionHandler),
        );
      });
    });

    if (layout.groups.length && layout.sections.length) {
      menu.appendChild(createMenuSeparator(doc));
    }

    layout.groups.forEach((group) => {
      const trigger = doc.createElement("button");
      trigger.type = "button";
      trigger.className =
        "group __menu-item hoverable flex w-full items-center justify-between";
      trigger.dataset.state = "closed";
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.textContent = group.label || group.key;
      trigger.appendChild(createSubmenuArrowIcon(doc));
      trigger.addEventListener("pointerenter", () => {
        openModelSubmenuPanel(
          trigger,
          group.models,
          selectionHandler as (model: QueueModelDefinition) => void,
          layout.normalizedSelectedId,
        );
      });
      trigger.addEventListener("focus", () => {
        openModelSubmenuPanel(
          trigger,
          group.models,
          selectionHandler as (model: QueueModelDefinition) => void,
          layout.normalizedSelectedId,
        );
      });
      trigger.addEventListener("pointerleave", () => {
        scheduleModelSubmenuClose();
      });
      trigger.addEventListener("keydown", (event) => {
        const key = event.key || "";
        if (key === "ArrowRight" || key === "Enter") {
          openModelSubmenuPanel(
            trigger,
            group.models,
            selectionHandler as (model: QueueModelDefinition) => void,
            layout.normalizedSelectedId,
          );
        }
      });
      menu.appendChild(trigger);
    });

    wrapper.appendChild(menu);
    return wrapper;
  };

  const positionDropdown = () => {
    if (!dropdown || !anchor || !anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const dropdownRect = dropdown.getBoundingClientRect();
    const offset = 6;
    let top = rect.bottom + offset;
    let side: "top" | "bottom" = "bottom";
    if (top + dropdownRect.height > win.innerHeight - 8) {
      top = Math.max(8, rect.top - dropdownRect.height - offset);
      side = "top";
    }
    let left = rect.left;
    const maxLeft = win.innerWidth - dropdownRect.width - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    if (left < 8) left = 8;
    dropdown.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    const menu = dropdown.querySelector("[data-radix-menu-content]");
    if (menu instanceof HTMLElement) {
      menu.dataset.side = side;
    }
    positionActiveModelSubmenu();
  };

  const close = () => {
    closeActiveModelSubmenu();
    cleanup.forEach((fn) => {
      try {
        fn();
      } catch (_) {
        /* noop */
      }
    });
    cleanup = [];
    if (dropdown?.parentNode) {
      dropdown.parentNode.removeChild(dropdown);
    }
    dropdown = null;
    anchor = null;
  };

  const contains = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return false;
    if (dropdown?.contains(target)) return true;
    if (activeSubmenu?.contains(target)) return true;
    return false;
  };

  const open = ({ anchor: nextAnchor, models, selectedModelId, onSelect }: ModelMenuOpenOptions) => {
    if (!(nextAnchor instanceof HTMLElement)) return;
    if (!Array.isArray(models) || !models.length) return;
    const layout = deriveModelMenuLayout(models, {
      ...options,
      selectedModelId,
    });
    log?.("composer dropdown models", {
      count: models.length,
      heading: layout.heading,
    });

    const dropdownNode = buildDropdown(layout, (model) => {
      const result = onSelect?.(model);
      if (result instanceof Promise) {
        void result.finally(() => close());
      } else {
        close();
      }
    });
    close();
    dropdown = dropdownNode;
    anchor = nextAnchor;
    doc.body.appendChild(dropdownNode);
    positionDropdown();

    const handleClickOutside = (event: Event) => {
      if (contains(event.target)) return;
      if (anchor?.contains(event.target as Node)) return;
      close();
    };
    const handleEscape = (event: Event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Escape") {
        event.preventDefault();
        close();
        anchor?.focus?.();
      }
    };
    const handleViewportChange = () => positionDropdown();

    registerCleanup(doc, "mousedown", handleClickOutside, true);
    registerCleanup(doc, "keydown", handleEscape, true);
    registerCleanup(win, "resize", handleViewportChange);
    registerCleanup(win, "scroll", handleViewportChange, true);
  };

  const toggle = (optionsParam: ModelMenuOpenOptions) => {
    if (dropdown && anchor === optionsParam.anchor) {
      close();
      return;
    }
    open(optionsParam);
  };

  return { open, toggle, close, contains };
};
