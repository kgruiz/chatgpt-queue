import { deriveModelMenuLayout } from "../src/lib/models/menu";
import type { QueueModelDefinition, QueueModelGroupMeta } from "../src/lib/types";

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

const sampleGroupMeta: Record<string, QueueModelGroupMeta> = {
  advanced: { label: "Advanced", order: 50 },
};

const sampleModels: QueueModelDefinition[] = [
  { id: "gpt-5-1", label: "Auto", description: "Decides how long to think", section: "GPT-5.1", order: 0, selected: true },
  { id: "gpt-5-1-instant", label: "Instant", description: "Answers right away", section: "GPT-5.1", order: 1 },
  { id: "gpt-5-1-thinking", label: "Thinking", description: "Thinks longer", section: "GPT-5.1", order: 2 },
  { id: "gpt-4o", label: "GPT-4o", section: "GPT-4", order: 10 },
  { id: "gpt-4o-mini", label: "GPT-4o mini", section: "GPT-4", order: 11 },
  { id: "canvas", label: "Canvas", group: "advanced", groupLabel: "Advanced tools", order: 100 },
  { id: "realtime", label: "Realtime", group: "advanced", order: 110 },
];

const layout = deriveModelMenuLayout(sampleModels, {
  normalizeModelId,
  dedupeModels: dedupeModelsForDisplay,
  resolveModelOrder,
  resolveHeading,
  getGroupMeta: (groupId) => sampleGroupMeta[groupId],
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
