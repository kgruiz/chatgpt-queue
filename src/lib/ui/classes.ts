export const UI_CLASS = {
  shell: "cq-shell",
  inlineHeader: "cq-inline-header",
  inlineMeta: "cq-inline-meta",
  collapseToggle: "cq-collapse-toggle",
  collapseToggleIcon: "cq-collapse-toggle__icon",
  label: "cq-label",
  state: "cq-state",
  inlineActions: "cq-inline-actions",
  pauseToggle: "cq-pause-toggle",
  pauseToggleIcon: "cq-pause-toggle__icon",
  pauseToggleIconState: "cq-pause-toggle__icon-state",
  pauseToggleIconStatePause: "cq-pause-toggle__icon-state--pause",
  pauseToggleIconStateResume: "cq-pause-toggle__icon-state--resume",
  pauseToggleLabel: "cq-pause-toggle__label",
  queueList: "cq-queue",
  row: "cq-row",
  rowNext: "cq-row--next",
  rowIndicator: "cq-row-indicator",
  rowBody: "cq-row-body",
  rowTextarea: "cq-row-text",
  rowMedia: "cq-row-media",
  rowActions: "cq-row-actions",
  mediaWrapper: "cq-media",
  mediaThumb: "cq-media__thumb",
  mediaMeta: "cq-media__meta",
  mediaRemove: "cq-media__remove",
} as const;

export type UIClassKey = keyof typeof UI_CLASS;
export type UIClassValue = (typeof UI_CLASS)[UIClassKey];

export const uiClass = (key: UIClassKey): UIClassValue => UI_CLASS[key];
