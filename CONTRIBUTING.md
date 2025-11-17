# Contributing

## Prerequisites
- Install pnpm (preferred) and Node.js 20+.
- Have Chrome or Firefox available for running the extension in dev mode.

## Setup
- Install dependencies: `pnpm install`.
- Start a dev session: `pnpm dev` (or `pnpm dev:firefox`). TypeScript errors surface in the browser overlay via `vite-plugin-checker`.
- Build packages when ready: `pnpm build` (or `pnpm build:firefox`) and `pnpm zip` to generate uploadable archives.

## Expectations
- Follow the spacing, naming, and commenting rules in `AGENTS.md` (blank lines around control flow, PascalCase functions, camelCase variables, etc.).
- Keep TypeScript strict; avoid `ts-ignore` unless documented. Prefer typed helpers in `src/lib` over inline DOM lookups.
- Use the provided utilities: state lives in `src/lib/state`, queue helpers in `src/lib/state/queue`, storage in `src/lib/storage-manager`, and UI pieces under `src/lib/ui`.

## Linting, formatting, and tests
- Run `pnpm lint` and `pnpm typecheck` (or `pnpm check`) before committing.
- Format with `pnpm format`; Prettier is configured via `.prettierrc.json` and `.prettierignore` to stay within the project’s conventions.
- `pnpm test` currently runs type checks plus harness scripts for storage, model menus, and attachments. Extend these harnesses when adding features.

## Adding entrypoints or modules
- Place new extension entrypoints in `src/entrypoints/` using WXT helpers like `defineContentScript` or `defineBackground`. WXT will include them automatically; adjust `wxt.config.ts` if custom manifest fields are needed.
- Add shared logic under `src/lib/` (for example, new UI templates in `src/lib/ui/` or queue/state helpers in `src/lib/state/`).
- Keep DOM class names centralized in `src/lib/ui/classes.ts` and state events typed in `src/lib/state/events.ts` to avoid drift.

## Content architecture
- `src/entrypoints/content.ts` only registers the content script and imports CSS. All runtime setup happens in `src/runtime/content-runtime.ts` via `bootstrapContent`.
- `content-runtime` builds a `Context` (state, event emitter, storage manager, queue helpers, platform flags, dispatch helpers, composer root reference, logger), hydrates the conversation snapshot, mounts UI, and installs SPA observers plus a `beforeunload` cleanup that calls each controller’s `dispose`.
- Controllers live in `src/runtime/*-controller.ts` and share types from `src/runtime/types.ts`. Each `init*Controller` returns a `dispose()` and only receives dependencies through the `Context`.
- Responsibilities: `composer-controller` handles composer discovery, queueing, attachments, and thinking/model selection; `model-controller` syncs the ChatGPT model switcher and renders the debug popup; `queue-controller` renders queue UI, drag/reorder, pause/collapse, and per-entry controls; `shortcuts` wires keyboard accelerators and integrates with the ChatGPT shortcut helper; `dom-adapters` centralize selectors, visibility checks, and composer lookup.
- When touching controller boundaries, update the harnesses in `scripts/*-harness.ts` so init/teardown paths keep working.

## Submitting changes
- Use Conventional Commits and keep commits atomic (one logical change per commit).
- Do not commit generated artifacts (`dist`, `.output`, `node_modules`, zips). The `.prettierignore` and `.gitignore` files already exclude them.
