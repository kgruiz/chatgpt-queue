import type {
    QueueModelDefinition,
    ThinkingOption,
    ThinkingLevel,
} from "../types";

export const USER_PLANS = ["free", "plus", "go", "team", "pro", "enterprise"] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const STATIC_MODEL_DEFINITIONS: QueueModelDefinition[] = [
    {
        id: "gpt-5-1",
        label: "Auto",
        description: "Decides how long to think",
        section: "GPT-5.1",
        tiers: ["Free", "Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-1-instant",
        label: "Instant",
        description: "Answers right away",
        section: "GPT-5.1",
        tiers: ["Free", "Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-1-thinking",
        label: "Thinking",
        description: "Thinks longer for better answers",
        section: "GPT-5.1",
        tiers: ["Free", "Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-1-pro",
        label: "Pro",
        description: "Research-grade intelligence",
        section: "GPT-5.1",
        tiers: ["Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-pro",
        label: "Pro",
        description: "Research-grade intelligence",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-instant",
        label: "GPT-5 Instant",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Free", "Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-t-mini",
        label: "GPT-5 Thinking mini",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Free", "Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-thinking",
        label: "GPT-5 Thinking",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Free", "Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-4o",
        label: "GPT-4o",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-4-1",
        label: "GPT-4.1",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-4-5",
        label: "GPT-4.5",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Pro", "Enterprise"],
    },
    {
        id: "o3",
        label: "o3",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "o4-mini",
        label: "o4-mini",
        group: "legacy",
        groupLabel: "Legacy models",
        tiers: ["Plus", "Pro", "Team", "Enterprise"],
    },
];

export const THINKING_TIME_OPTIONS: ThinkingOption[] = [
    { id: "light", label: "Light", digit: "1" },
    { id: "standard", label: "Standard", digit: "2" },
    { id: "extended", label: "Extended", digit: "3" },
    { id: "heavy", label: "Heavy", digit: "4" },
];

export const MODELS_WITH_THINKING_TIME_SUPPORT: readonly string[] = [
    "gpt-5-1-thinking",
    "gpt-5-thinking",
] as const;

export const THINKING_LEVEL_TIERS: Record<ThinkingLevel, readonly UserPlan[]> = {
    light: ["pro", "enterprise"],
    standard: ["free", "go", "plus", "team", "pro", "enterprise"],
    extended: ["free", "go", "plus", "team", "pro", "enterprise"],
    heavy: ["pro", "enterprise"],
} as const;

export const isThinkingLevelAvailableForPlan = (
    plan: UserPlan,
    level: ThinkingLevel,
): boolean => {
    const allowedPlans = THINKING_LEVEL_TIERS[level] || [];
    return allowedPlans.includes(plan);
};

const normalizePlanLabel = (value: string): UserPlan | null => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "business") return "team";
    if (normalized === "team") return "team";
    if (normalized === "pro") return "pro";
    if (normalized === "plus") return "plus";
    if (normalized === "free") return "free";
    if (normalized === "go") return "go";
    if (normalized === "enterprise") return "enterprise";
    return null;
};

export const isModelAvailableForPlan = (
    model: QueueModelDefinition | null | undefined,
    plan: UserPlan,
): boolean => {
    if (!model?.tiers || !model.tiers.length) return true;
    const normalizedPlan = normalizePlanLabel(plan) || plan;
    return model.tiers.some((tier) => normalizePlanLabel(tier) === normalizedPlan);
};
