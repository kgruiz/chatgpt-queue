import { h } from "./template";
import type { TemplateChild } from "./template";

export interface ModalElements {
  root: HTMLDivElement;
  overlay: HTMLDivElement;
  container: HTMLDivElement;
  dialog: HTMLDivElement;
}

export interface ConfirmModalOptions {
  title: string;
  body: TemplateChild | TemplateChild[];
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: string;
  testId?: string;
  confirmTestId?: string;
}

export interface ConfirmModalElements extends ModalElements {
  header: HTMLElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
}

const wrapLabel = (text: string): HTMLDivElement =>
  h(
    "div",
    {
      className: "flex items-center justify-center",
      text,
    },
  ) as HTMLDivElement;

export const createConfirmModal = (
  options: ConfirmModalOptions,
): ConfirmModalElements => {
  const root = h("div", {
    className: "absolute inset-0",
    dataset: {
      cqModal: "true",
      testid: options.testId,
    },
  }) as HTMLDivElement;

  const overlay = h("div", {
    className:
      "fixed inset-0 z-50 before:starting:backdrop-blur-0 before:absolute before:inset-0 before:bg-gray-200/50 before:backdrop-blur-[1px] before:transition before:duration-250 dark:before:bg-black/50 before:starting:opacity-0",
    dataset: {
      state: "open",
      modalLayer: "overlay",
    },
  }) as HTMLDivElement;
  overlay.style.pointerEvents = "auto";

  const container = h("div", {
    className:
      "z-50 h-full w-full overflow-y-auto grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,0.8fr)_auto_minmax(20px,1fr)]",
  }) as HTMLDivElement;

  const dialog = h("div", {
    className:
      "popover bg-token-bg-primary relative col-auto col-start-2 row-auto row-start-2 h-full w-full text-start start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-long flex flex-col focus:outline-hidden max-w-md overflow-hidden",
    attrs: {
      role: "dialog",
      "aria-modal": "true",
    },
    dataset: {
      modalLayer: "content",
      state: "open",
    },
  }) as HTMLDivElement;
  dialog.tabIndex = -1;
  dialog.style.pointerEvents = "auto";

  const header = h("header", {
    className: "min-h-header-height flex justify-between p-2.5 ps-4 select-none",
  });
  const headerWrap = h("div", { className: "flex max-w-full items-center" });
  const headerTextWrap = h("div", {
    className: "flex max-w-full min-w-0 grow flex-col",
  });
  const heading = h("h2", {
    className: "text-token-text-primary text-lg font-normal",
    text: options.title,
  });
  headerTextWrap.appendChild(heading);
  headerWrap.appendChild(headerTextWrap);
  const headerActions = h("div", {
    className: "flex h-[max-content] items-center gap-2",
  });
  header.append(headerWrap, headerActions);

  const body = h("div", {
    className: "grow overflow-y-auto p-4 pt-1",
  }, options.body) as HTMLDivElement;

  const footer = h("div", {
    className:
      "grow overflow-y-auto p-4 pt-1 flex flex-col justify-end text-sm select-none",
  }) as HTMLDivElement;
  const footerInner = h("div", {
    className: "flex w-full flex-row items-center justify-end",
  });
  const buttonRow = h("div", {
    className:
      "flex flex-col gap-3 sm:flex-row-reverse mt-5 sm:mt-4 flex w-full flex-row-reverse",
  });

  const confirmButton = h("button", {
    className: `btn relative ${options.confirmVariant || "btn-danger"}`,
    attrs: { type: "button" },
    dataset: options.confirmTestId
      ? { testid: options.confirmTestId }
      : undefined,
  }, wrapLabel(options.confirmLabel || "Delete")) as HTMLButtonElement;

  const cancelButton = h("button", {
    className: "btn relative btn-secondary",
    attrs: { type: "button" },
  }, wrapLabel(options.cancelLabel || "Cancel")) as HTMLButtonElement;

  buttonRow.append(confirmButton, cancelButton);
  footerInner.appendChild(buttonRow);
  footer.appendChild(footerInner);

  dialog.append(header, body, footer);
  container.appendChild(dialog);
  overlay.appendChild(container);
  root.appendChild(overlay);

  return {
    root,
    overlay,
    container,
    dialog,
    header,
    body,
    footer,
    confirmButton,
    cancelButton,
  };
};
