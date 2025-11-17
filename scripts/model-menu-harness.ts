import assert from "node:assert";
import { deriveModelMenuLayout } from "../src/lib/models/menu";
import { createInitialState } from "../src/lib/state";
import type { QueueModelDefinition, QueueModelGroupMeta } from "../src/lib/types";
import { initModelController } from "../src/runtime/model-controller";
import { ensureModelSwitcherButton, sampleGroupMeta, sampleModels, setupHappyDom } from "./harness-env";

const normalizeModelId = (value: string | null | undefined): string =>
  String(value || "")
    .trim()
    .toLowerCase();

const resolveModelOrder = (model: QueueModelDefinition): number =>
  Number.isFinite(model?.order) ? Number(model.order) : Number.MAX_SAFE_INTEGER;

const dedupeModelsForDisplay = (models: QueueModelDefinition[]): QueueModelDefinition[] => {
  const map = new Map<string, QueueModelDefinition>();
  models.forEach((model) => {
    if (!model?.id) return;
    const key = normalizeModelId(model.id);
    if (!key) return;
    if (!map.has(key) || model.selected) {
      map.set(key, model);
    }
  });
  return Array.from(map.values());
};

const resolveHeading = (
  models: QueueModelDefinition[],
  preferredId: string | null = null,
): string => {
  const base = preferredId || models.find((model) => model.selected)?.id || models[0]?.id || "Models";
  return String(base).toUpperCase();
};

const layout = deriveModelMenuLayout(sampleModels, {
  normalizeModelId,
  dedupeModels: dedupeModelsForDisplay,
  resolveModelOrder,
  resolveHeading,
  getGroupMeta: (groupId: string): QueueModelGroupMeta | undefined => sampleGroupMeta[groupId],
  selectedModelId: "gpt-5-1",
});

const divider = "-".repeat(40);
console.log("Model Menu Layout Preview");
console.log(divider);
console.log("Heading:", layout.heading);
console.log("Sections:");
layout.sections.forEach((section) => {
  console.log(`  • ${section.name || "General"} (${section.models.length})`);
  section.models.forEach((model) => {
    console.log(`      - ${model.label || model.id}`);
  });
});
console.log("Groups:");
layout.groups.forEach((group) => {
  console.log(`  • ${group.label} (${group.models.length})`);
  group.models.forEach((model) => {
    console.log(`      - ${model.label || model.id}`);
  });
});

const env = setupHappyDom();
ensureModelSwitcherButton(document);

const state = createInitialState();
state.models = sampleModels;
state.modelGroups = sampleGroupMeta;

const noop = () => {};
const dispatchPointer = () => true;

const controller = initModelController({
  state,
  emitStateChange: noop,
  refreshControls: noop,
  saveState: noop,
  dispatchPointerAndMousePress: dispatchPointer,
  dispatchKeyboardEnterPress: dispatchPointer,
});

const controllerLayout = deriveModelMenuLayout(sampleModels, {
  normalizeModelId: controller.normalizeModelId,
  dedupeModels: controller.dedupeModelsForDisplay,
  resolveModelOrder: controller.resolveModelOrder,
  resolveHeading,
  getGroupMeta: (groupId: string) => sampleGroupMeta[groupId],
  selectedModelId: "gpt-5-1",
});

assert.strictEqual(controllerLayout.heading, layout.heading, "model heading should remain stable");
assert.strictEqual(controllerLayout.sections.length, layout.sections.length, "section count should match reference");
assert.strictEqual(controllerLayout.groups.length, layout.groups.length, "group count should match reference");

controller.dispose();
env.cleanup();

console.log("model menu harness passed");
