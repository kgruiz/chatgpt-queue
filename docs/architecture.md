# Architecture

## Runtime flow
- `content.ts` registers the WXT content script and imports styles. It calls `bootstrapContent` from `content-runtime.ts`.
- `bootstrapContent` builds a `Context` with queue state, the event emitter, storage manager, queue helpers, platform flags, DOM dispatch helpers, a composer root handle, and a logger.
- The runtime hydrates the per-conversation snapshot from `chrome.storage.local`, mounts the queue UI, wires keyboard shortcuts, and installs SPA mutation observers.
- Teardown runs on `beforeunload` and when the observers detect a full page swap. Each controller exposes `dispose()` so cleanup stays scoped.

## Controllers and boundaries
- `composer-controller` discovers the ChatGPT composer, queues prompts, reapplies attachments, and drives thinking/model selection for composer and queue entries.
- `model-controller` syncs the built-in model switcher, supports dropdown activation for queue rows, and owns the optional model debug popup.
- `queue-controller` renders the queue shell, row list, drag-and-drop, pause/auto-dispatch toggles, collapse controls, and per-entry model/thinking/attachment hooks.
- `shortcuts` registers keyboard accelerators and injects them into ChatGPT’s shortcut helper so the inline cheat sheet stays accurate.
- `dom-adapters` centralize selectors and visibility checks and expose typed helpers to find the composer, editor, and send/stop controls.

## Data and event paths
```
chrome.storage.local (per conversation snapshots)
        ^
        | save/load via storage manager
        |
Queue state + event emitter (src/lib/state)
        ^              ^
        | emit updates | listen
        |              |
  Controllers (model | composer | queue | shortcuts)
        |
        v
  DOM adapters -> ChatGPT DOM (composer, dropdowns, queue shell)
```

- Only `content-runtime` talks to storage and platform detection; controllers act on the `Context` they receive.
- State mutations broadcast through the queue event emitter, and the UI refresh logic in controllers subscribes rather than pulling globals.
- UI affordances use the typed DOM helpers so selectors and focus/visibility checks stay consistent across controllers.

## Background & messaging

- `background.ts` relays Chrome commands to the active ChatGPT tab; `queue-from-shortcut` queues the current composer input, and the action icon sends `toggle-ui` so the panel re-expands when it has been collapsed.
- The content runtime listens for those messages via `chrome.runtime.onMessage`, expands the queue when `toggle-ui`/`show-ui` arrives, and defers to the composer controller for queuing work.

## Composer bridge

- `bridge.ts` ships as an unlisted script that listens for `CQ_SET_PROMPT` window messages from the content runtime.
- When a message arrives it writes the text into the ProseMirror editor through the page’s `editorView` when present, falls back to an HTML rewrite when it is not, and replies with `CQ_SET_PROMPT_DONE` so the dispatcher knows the write completed.
