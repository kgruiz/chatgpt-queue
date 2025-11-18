# chatgpt-queue

Queue prompts for ChatGPT and let them auto-send as soon as the previous reply finishes. The extension keeps long follow-up chains moving without babysitting the UI and works on both `chatgpt.com` and `chat.openai.com`.

## Visual Preview

| Collapsed queue | Expanded queue |
| --- | --- |
| ![Collapsed queue screenshot showing inline status](docs/queue-collapsed.png) | ![Expanded queue screenshot with attachments and controls](docs/queue-expanded.png) |

## What It Does

- **Inline queue controls** - two buttons live next to the ChatGPT composer: *Add to queue* captures the current draft, while *Hold & queue* captures it and pauses the automation until you resume.
- **Attachment-aware entries** - when you queue something that contains pasted images or uploaded files, those attachments stay with the follow-up, display in the queue, and are re-applied before the item sends.
- **Model locking** - each queued follow-up remembers the ChatGPT model that was selected when it was captured, so mixed runs (e.g., GPT-4o followed by GPT-4.1) are replayed on the right model automatically.
- **Per-item model & thinking controls** - every queue card now exposes the same model dropdown that lives in the composer, letting you retarget individual follow-ups and, when you're on GPT-5 thinking models, pre-select the Light/Standard/Extended/Heavy level they'll use at send time.
- **Keyboard-first editing** - navigate with Option/Alt+Arrow keys, send with Enter, delete with Shift+Delete, or reorder via drag-and-drop or by typing a new queue position.
- **Chat-scoped, persistent state** - every conversation gets its own queue snapshot (items, attachments, collapsed state, pause reasons) stored in `chrome.storage.local`, so switching threads swaps to their specific queues while staying fully local.
- **Keyboard shortcut helper** - when you open ChatGPT's built-in `?` shortcut panel, the queue shortcuts are injected into that list for quick reference.

## Installation

### Chromium browsers (Chrome 133+, Edge, Brave, Arc)

1. Clone or download this repository, then run `pnpm install`.
2. Launch the WXT dev server with `pnpm dev`. It rebuilds to `.output/chrome-mv3` whenever you save.
3. Open `chrome://extensions` (Arc/Brave/Edge redirect automatically), enable **Developer mode**, then click **Load unpacked** and point at `.output/chrome-mv3`.
4. Keep Developer mode enabled so the unpacked extension stays active. When you're ready to package, run `pnpm build` (or `pnpm zip`) and load the freshly built `.output/chrome-mv3` bundle.

> Note: Chrome 134 and later disable unpacked extensions whenever Developer Mode is off. Google announced the change in the [December 20, 2024 Chromium Extensions PSA](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/cTdMVtxxooY) and began enforcing it with the Chrome 134 rollout, so keep Developer Mode on while you develop or use chatgpt-queue.

### Firefox (temporary add-on)

1. Run `pnpm install` followed by `pnpm build:firefox` (or `pnpm dev:firefox` for a watch build). WXT writes to `.output/firefox-mv3`.
2. Open `about:debugging`.
3. Select **This Firefox** -> **Load Temporary Add-on...** and choose `manifest.json` from `.output/firefox-mv3`.
4. If your Firefox build lacks MV3 service workers, edit the manifest first so the background section uses `"scripts": ["bg.js"]`.

## Usage

### Queue prompts quickly

- Type in the ChatGPT composer, then either press **Option+Enter** (macOS) / **Alt+Enter** (Windows/Linux) or click the inline *Add to queue* button. The queue UI appears once you have at least one follow-up staged.
- To capture and pause in a single shot, use **Option+Cmd+Enter** / **Alt+Ctrl+Enter** or click *Hold & queue*. The queue stays paused until you hit **Resume queue** or the same shortcut again.

### Edit, reorder, and send

- Every follow-up sits in its own card with a text area. Edit inline; changes persist automatically.
- Drag cards to reorder, or type a new position number into the left-hand index field.
- Use the arrow button on any card to send it immediately, even if the rest of the queue is paused.
- Shift+Delete removes the focused card with a confirmation, and Option/Alt+Shift+Delete removes it instantly.
- Prefer clicks? Hold Option/Alt while pressing a card's delete button to remove it without a confirmation dialog.

### Attachments

- When you queue a prompt that already has pasted screenshots or uploaded files, the extension captures those attachments and shows thumbnails inside the queue card.
- Paste images directly into a queue card to add more attachments later. Use the **Remove** button on a thumbnail to drop it from that follow-up.
- Attachments automatically clear from the ChatGPT composer once the follow-up is queued and reattach themselves when that follow-up runs.

### Model locking

- Whatever ChatGPT model (GPT-4o, GPT-4.1, o1-mini, etc.) is active when you queue a follow-up is stored with that item.
- Need to retarget a follow-up later? Open the model dropdown on that queue card to swap models or, when applicable, adjust the GPT-5 thinking level before it runs.
- When the queue dispatches that item, it opens the model picker, selects the stored model, reapplies the prompt and attachments, and only then sends. Mixed-model runs no longer require manual babysitting.
- If the model picker layout changes, open the model menu once so the queue script can learn the latest entries before replaying.

### Running & visibility

- The queue auto-dispatches whenever it has items, the composer is idle, and the queue is not paused. You can pause/resume from the header button or with **Shift+Cmd/Ctrl+P**.
- The header collapse button (or **Shift+Cmd/Ctrl+.**) hides the card list but keeps the inline status visible. Click the Chrome toolbar icon to force the panel open if you collapsed it earlier.
- Auto-dispatch waits until ChatGPT's stop button disappears and the composer is clear, then enforces a short cooldown before sending the next item.

## Keyboard shortcuts

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Queue current input | Option+Enter | Alt+Enter |
| Queue current input & pause | Option+Cmd+Enter | Alt+Ctrl+Enter |
| Navigate queue items | Option+Up / Option+Down | Alt+Up / Alt+Down |
| Send focused follow-up | Enter | Enter |
| Delete focused follow-up (confirm) | Shift+Delete | Shift+Delete |
| Delete focused follow-up (without confirmation) | Option+Shift+Delete | Alt+Shift+Delete |
| Collapse/expand queue list | Shift+Cmd+. | Shift+Ctrl+. |
| Pause/resume queue | Shift+Cmd+P | Shift+Ctrl+P |
| Set thinking time (Light/Standard/Extended/Heavy) | Cmd+Ctrl+1 / 2 / 3 / 4 | Ctrl+Alt+1 / 2 / 3 / 4 |
| Select models 1–10 | Cmd+Option+1 … Cmd+Option+0 | Ctrl+Alt+1 … Ctrl+Alt+0 |

Browser-level commands (set from `chrome://extensions/shortcuts`) include **Queue current input** with a default of **Cmd+Shift+Y** (macOS) / **Ctrl+Shift+Y** (Windows/Linux).

Each digit shortcut maps to the model order we learn from ChatGPT’s picker: `⌘⌥1`/`Ctrl+Alt+1` activates the first model in the list, `⌘⌥0`/`Ctrl+Alt+0` the tenth, while **Cmd/Ctrl+Shift+H** still opens the dropdown when you want to confirm labels.

Thinking time shortcuts are digit-only now: hold Cmd+Ctrl (macOS) or Ctrl+Alt (Windows/Linux) and press **1**, **2**, **3**, or **4** to jump to Light, Standard, Extended, or Heavy respectively.

## Persistence & data

All queue content, attachments, and the paused/collapsed state live in `chrome.storage.local`, keyed by the ChatGPT conversation ID (the `/c/<id>` portion of the URL). Nothing leaves the browser, and switching threads simply loads the matching queue snapshot. As always, review the terms of service for any site you automate before unleashing a queue.

## Development

Project structure (managed by [WXT](https://wxt.dev/)):

- `src/entrypoints/content.ts` - Content script bootstrap that wires styles and calls the runtime.
- `src/entrypoints/background.ts` - Background service worker relaying keyboard commands and toolbar clicks.
- `src/entrypoints/bridge.ts` - ProseMirror helper injected into the page's main world for reliable composer edits.
- `src/runtime/content-runtime.ts` - Queue UI, automation logic, attachment handling, and model/model-thinking selection.
- `src/lib/attachments.ts` - Attachment normalization, gathering, and cleanup helpers shared by queue logic.
- `src/lib/queue.ts` - Queue-entry normalization/cloning helpers with thinking-level awareness.
- `src/lib/storage.ts` - Conversation identifier utilities shared across persistence logic.
- `src/lib/state.ts` - Factory for the shared queue state object imported across entrypoints.
- `src/lib/storage-manager.ts` - Chrome storage load/save/migration helpers with typed interfaces.
- `src/styles/content.css` - Styling for the floating queue and inline buttons; imported by the content entrypoint.
- `wxt.config.ts` - Single source of truth for the MV3 manifest, permissions, and commands.

Workflow:

1. Install dependencies once with `pnpm install`, then run `pnpm dev` (or `pnpm dev:firefox`) to start WXT's watch/build loop.
2. Load the generated `.output/<browser>-mv3` folder as an unpacked extension. WXT will keep rebuilding there and trigger reloads.
3. Keep your edits inside `src/`; WXT rebundles automatically and surfaces type errors via `pnpm typecheck`.
4. When selectors break, update the relevant helpers (mostly in `src/runtime/*` and `src/entrypoints/content.ts`) and rerun `pnpm build` to verify production output.
5. Run `pnpm check` for lint plus type checks. `pnpm test` runs the type check and the storage, model-menu, attachment, and controller harnesses; use the individual `pnpm test:*` scripts when iterating on one area.

## Troubleshooting

- **Panel never shows up** - queue at least one follow-up first; the UI stays hidden when the queue is empty.
- **Send button never fires** - inspect the page, verify the selectors in `SEL.editor`, `SEL.send`, and `SEL.stop`, and adjust them to match ChatGPT's current markup.
- **Attachments reappear in the composer** - another extension may intercept `beforeinput` events. Disable conflicting extensions or rely on the fallback `execCommand('insertText')` path.
- **Model won't change** - open the ChatGPT model picker once so the queue can parse the latest menu entries. Reload the extension afterward if needed.
- **Unpacked extension disappears** - ensure Developer mode is still toggled on in `chrome://extensions`; Chromium browsers now disable unpacked extensions when that toggle is off.

## License

`chatgpt-queue` is distributed under the terms of the GNU General Public License v3.0. See [LICENSE](LICENSE) for details.
