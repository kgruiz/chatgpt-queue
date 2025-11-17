# Modularization & Type Safety Roadmap

> Note: keep committing every change except for this TODO.md file, and check these boxes the moment a task is done.

## Storage & Persistence
- [x] Extract chrome.storage load/save/migrate logic into `src/lib/storage-manager.ts` with typed interfaces.
- [x] Replace inline persistence functions in `content.ts` to use the new manager; add error handling hooks.
- [x] Add unit-style harness (even a simple script) to validate migration edge cases.

## State & Queue Management
- [x] Move queue mutation helpers (enqueue, delete, reorder, pause) into a dedicated `src/lib/state/queue.ts` module.
- [x] Implement an event emitter or observer pattern so UI rendering reacts to state changes instead of manual refresh calls.
- [x] Add type-safe definitions for `STATE.phase`, `models`, and `modelGroups`.

## UI & Rendering
- [x] Split DOM templating (queue header, cards, modals) into separate modules/components (e.g., `ui/header`, `ui/rows`).
- [x] Introduce a minimal virtual-DOM or templating helper to avoid manual `document.createElement` chains.
- [x] Ensure CSS classes referenced in JS are centralized (constants or a typed map) to avoid typos.

## Model/Thinking Controls
- [x] Extract model menu logic (open/close, submenu positioning) into `src/lib/models/menu.ts` with clear APIs.
- [x] Define TypeScript types for model entries, thinking options, and menu actions.
- [x] Add debug utilities/tests for the model picker to ensure future UI changes are easier to track.

## Attachments & Composer Interop
- [x] Migrate any remaining composer-specific helpers out of `content.ts` into `src/lib/attachments` (e.g., `countFilesInInputs` usage).
- [x] Add throttling/debouncing utilities for attachment polling to reduce MutationObserver load.
- [x] Build a small test harness to simulate DataTransfer inputs for regression testing.

## Typing & Tooling
- [x] Remove `// @ts-nocheck` by incrementally typing the remaining sections (UI, events, DOM lookups).
- [x] Tighten tsconfig (enable `strict: true`, `noImplicitAny`, etc.) once type coverage is sufficient.
- [x] Add ESLint/Prettier (or Biome) configs aligned with AGENTS.md conventions for ongoing linting.

## Testing & DX
- [x] Add `pnpm test` placeholder that runs typecheck + a future test suite.
- [x] Configure `pnpm dev` to surface overlay errors (Vite overlay) when TypeScript fails.
- [x] Document contributor workflow (how to add entrypoints/modules) in `CONTRIBUTING.md`.
