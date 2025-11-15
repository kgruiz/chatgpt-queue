import { UI_CLASS } from "./classes";
import { h, svg } from "./template";

export interface QueueShellElements {
  root: HTMLDivElement;
  shell: HTMLDivElement;
  inlineHeader: HTMLDivElement;
  queueList: HTMLDivElement;
  collapseToggle: HTMLButtonElement;
  pauseToggle: HTMLButtonElement;
  pauseLabel: HTMLSpanElement;
  queueLabel: HTMLSpanElement;
  stateLabel: HTMLSpanElement;
}

const createChevronIcon = () => {
  return svg("svg", {
    attrs: {
      width: 16,
      height: 16,
      viewBox: "0 0 16 16",
      fill: "currentColor",
      xmlns: "http://www.w3.org/2000/svg",
      focusable: "false",
    },
  },
  svg("path", {
    attrs: {
      d: "M12.1338 5.94433C12.3919 5.77382 12.7434 5.80202 12.9707 6.02929C13.1979 6.25656 13.2261 6.60807 13.0556 6.8662L12.9707 6.9707L8.47067 11.4707C8.21097 11.7304 7.78896 11.7304 7.52926 11.4707L3.02926 6.9707L2.9443 6.8662C2.77379 6.60807 2.80199 6.25656 3.02926 6.02929C3.25653 5.80202 3.60804 5.77382 3.86617 5.94433L3.97067 6.02929L7.99996 10.0586L12.0293 6.02929L12.1338 5.94433Z",
    },
  }));
};

const createPauseIcon = () => {
  const pauseState = svg("svg", {
    classes: [UI_CLASS.pauseToggleIconState, UI_CLASS.pauseToggleIconStatePause],
    attrs: {
      width: 16,
      height: 16,
      viewBox: "0 0 16 16",
      fill: "currentColor",
      xmlns: "http://www.w3.org/2000/svg",
      focusable: "false",
    },
  },
  svg("path", {
    attrs: {
      d: "M5 3.25C4.58579 3.25 4.25 3.58579 4.25 4V12C4.25 12.4142 4.58579 12.75 5 12.75H6.5C6.91421 12.75 7.25 12.4142 7.25 12V4C7.25 3.58579 6.91421 3.25 6.5 3.25H5ZM9.5 3.25C9.08579 3.25 8.75 3.58579 8.75 4V12C8.75 12.4142 9.08579 12.75 9.5 12.75H11C11.4142 12.75 11.75 12.4142 11.75 12V4C11.75 3.58579 11.4142 3.25 11 3.25H9.5Z",
    },
  }));

  const resumeState = svg("svg", {
    classes: [UI_CLASS.pauseToggleIconState, UI_CLASS.pauseToggleIconStateResume],
    attrs: {
      width: 16,
      height: 16,
      viewBox: "0 0 16 16",
      fill: "currentColor",
      xmlns: "http://www.w3.org/2000/svg",
      focusable: "false",
    },
  },
  svg("path", {
    attrs: {
      d: "M4.5 3.5C4.5 3.08579 4.83579 2.75 5.25 2.75C5.37798 2.75 5.50362 2.78404 5.61394 2.84837L12.1139 6.34837C12.4517 6.54208 12.5663 6.97906 12.3726 7.3169C12.3077 7.42946 12.2139 7.52332 12.1013 7.58826L5.60134 11.3383C5.2645 11.532 4.82752 11.4174 4.63381 11.0805C4.56948 10.9702 4.53544 10.8446 4.53544 10.7166V3.5H4.5Z",
    },
  }));

  return h("span", {
    classes: [UI_CLASS.pauseToggleIcon],
    attrs: { "aria-hidden": "true" },
  }, pauseState, resumeState);
};

export const createQueueShell = (): QueueShellElements => {
  const queueLabel = h("span", {
    classes: [UI_CLASS.label],
    attrs: { id: "cq-label", "aria-live": "polite" },
    text: "0 follow-ups",
  }) as HTMLSpanElement;

  const collapseIcon = h("span", {
    classes: [UI_CLASS.collapseToggleIcon],
    attrs: { "aria-hidden": "true" },
  }, createChevronIcon());

  const collapseToggle = h("button", {
    classes: [UI_CLASS.collapseToggle],
    attrs: {
      id: "cq-collapse-toggle",
      type: "button",
      "aria-label": "Collapse queue",
      "aria-expanded": "true",
    },
  }, collapseIcon, queueLabel) as HTMLButtonElement;

  const stateLabel = h("span", {
    classes: [UI_CLASS.state],
    attrs: { id: "cq-state", "aria-live": "polite" },
    text: "Idle",
  }) as HTMLSpanElement;

  const pauseLabel = h("span", {
    classes: [UI_CLASS.pauseToggleLabel],
    attrs: { id: "cq-pause-label" },
    text: "Pause queue",
  }) as HTMLSpanElement;

  const pauseToggle = h("button", {
    classes: [UI_CLASS.pauseToggle],
    attrs: {
      id: "cq-pause-toggle",
      type: "button",
      "aria-pressed": "false",
      "aria-label": "Pause queue",
    },
    dataset: { state: "active" },
  }, createPauseIcon(), pauseLabel) as HTMLButtonElement;

  const inlineMeta = h("div", { classes: [UI_CLASS.inlineMeta] }, collapseToggle, stateLabel) as HTMLDivElement;
  const inlineActions = h("div", { classes: [UI_CLASS.inlineActions] }, pauseToggle) as HTMLDivElement;

  const inlineHeader = h(
    "div",
    { classes: [UI_CLASS.inlineHeader] },
    inlineMeta,
    inlineActions,
  ) as HTMLDivElement;

  const queueList = h("div", {
    classes: [UI_CLASS.queueList],
    attrs: {
      id: "cq-list",
      "aria-label": "Queued prompts",
    },
  }) as HTMLDivElement;

  const shell = h(
    "div",
    { classes: [UI_CLASS.shell] },
    inlineHeader,
    queueList,
  ) as HTMLDivElement;

  const root = h("div", {
    attrs: { id: "cq-ui", "aria-hidden": "true" },
  }, shell) as HTMLDivElement;

  return {
    root,
    shell,
    inlineHeader,
    queueList,
    collapseToggle,
    pauseToggle,
    pauseLabel,
    queueLabel,
    stateLabel,
  };
};
