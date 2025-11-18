import assert from "node:assert";
import { createInitialState } from "../src/lib/state";
import { initComposerController } from "../src/runtime/composer-controller";
import { initModelController } from "../src/runtime/model-controller";
import { initQueueController } from "../src/runtime/queue-controller";
import { buildComposerDom, ensureModelSwitcherButton, sampleGroupMeta, sampleModels, setupHappyDom } from "./harness-env";

const noop = () => {};
const dispatchPointer = () => true;

const env = setupHappyDom();
const composerFixture = buildComposerDom(document);
ensureModelSwitcherButton(document);

const state = createInitialState();
state.models = sampleModels;
state.modelGroups = sampleGroupMeta;

const modelController = initModelController({
  state,
  emitStateChange: noop,
  refreshControls: noop,
  saveState: noop,
  dispatchPointerAndMousePress: dispatchPointer,
  dispatchKeyboardEnterPress: dispatchPointer,
});

const queueController = initQueueController({
  state,
  emitStateChange: noop,
  saveState: noop,
  scheduleSaveState: noop,
  modelController,
  pauseShortcutLabel: "Ctrl+Shift+P",
});

const composerController = initComposerController({
  state,
  emitStateChange: noop,
  saveState: noop,
  refreshControls: queueController.refreshControls,
  scheduleControlRefresh: queueController.scheduleControlRefresh,
  setPaused: queueController.setPaused,
  labelForModel: modelController.labelForModel,
  supportsThinkingForModel: modelController.supportsThinkingForModel,
  getCurrentModelId: modelController.getCurrentModelId,
  getCurrentModelLabel: modelController.getCurrentModelLabel,
  ensureModel: modelController.ensureModel,
  markModelSelected: modelController.markModelSelected,
  openModelDropdownForAnchor: modelController.openModelDropdownForAnchor,
  modelMenuController: modelController.modelMenuController,
  activateMenuItem: modelController.activateMenuItem,
  dispatchPointerAndMousePress: dispatchPointer,
  queueList: queueController.list,
  applyModelSelectionToEntry: queueController.applyModelSelectionToEntry,
  setEntryThinkingOption: queueController.setEntryThinkingOption,
  resolveQueueEntryThinkingLabel: queueController.resolveQueueEntryThinkingLabel,
  addAttachmentsToEntry: queueController.addAttachmentsToEntry,
  getUserPlan: modelController.detectUserPlan,
});

queueController.attachComposerController(composerController);
queueController.ensureMounted();
composerController.ensureComposerControls(composerFixture.root);
composerController.ensureComposerInputListeners(composerFixture.root);
queueController.refreshAll();

assert(modelController.getCurrentModelId() === null, "model controller should start without selection");

composerController.dispose();
queueController.dispose();
modelController.dispose();
env.cleanup();

console.log("controller harness passed");
