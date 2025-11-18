import type { QueueModelDefinition, ThinkingOption } from "../types";

export const USER_PLANS = ["free", "plus", "go", "team", "pro", "enterprise"] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const STATIC_MODEL_DEFINITIONS: QueueModelDefinition[] = [
    {
        id: "gpt-5-1",
        label: "Auto",
        description: "Decides how long to think",
        section: "GPT-5.1",
        tiers: ["Free"],
    },
    {
        id: "gpt-5-1-instant",
        label: "Instant",
        description: "Answers right away",
        section: "GPT-5.1",
        tiers: ["Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-1-thinking",
        label: "Thinking",
        description: "Thinks longer for better answers",
        section: "GPT-5.1",
        tiers: ["Plus", "Pro", "Team", "Enterprise"],
    },
    {
        id: "gpt-5-pro",
        label: "Pro",
        description: "Research-grade intelligence",
        section: "GPT-5",
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
