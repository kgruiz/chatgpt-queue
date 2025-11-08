# chatgpt-queue

Queue prompts for ChatGPT and send them automatically once each reply finishes. The extension keeps conversations moving without manual babysitting.

## Overview

`chatgpt-queue` adds a compact control panel to ChatGPT that lets you gather prompts, start or pause the queue, and dispatch messages safely once the model is idle. State is stored locally so you can pick up where you left off, even if the page reloads.

## Features

- Floating queue widget that stays visible while you browse the conversation.
- Full queue dashboard that lists upcoming prompts with inline editing, reordering, delete controls, and a built-in prompt composer.
- One-click capture of the current composer input, plus an Option/Alt+Enter shortcut.
- Automatic prompt dispatch with built-in cooldown once ChatGPT finishes responding.
- Manual controls for pausing, sending the next item, or clearing the queue.
- Collapsible panel that tucks into a minimal dock button, with an extension-icon toggle if you want the UI hidden entirely.
- Lightweight implementation using a Manifest V3 background service worker and content script.

## Installation

1. Clone or download this repository.
2. Open Chrome, Edge, Brave, Arc, or another Chromium-based browser.
3. Navigate to the extension management page for your browser (e.g. `chrome://extensions`, `arc://extensions`), enable **Developer mode**, and note that many browsers will redirect from the Chrome URL automatically.
4. Choose **Load unpacked** and select the `chatgpt-queue/` directory inside this project.

_For Firefox testing_: open `about:debugging`, select **This Firefox**, choose **Load Temporary Add-on**, and pick `manifest.json`. If your Firefox build lacks MV3 service workers, adjust the manifest background section to use `"scripts": ["bg.js"]` before loading.

## Usage

1. Visit `https://chatgpt.com` or `https://chat.openai.com`.
2. Type a prompt in the ChatGPT composer. Use **Option+Enter** (macOS) or **Alt+Enter** (Windows/Linux) to move the text into the queue. You can also click **Add from input**.
3. Alternatively, compose prompts directly in the queue panel using the inline text area and click **Queue text** (or press the same shortcut) to stage them without touching the main editor.
4. Click **Start** to begin processing. The extension sends the first prompt, waits until the stop button disappears and the send button returns, then proceeds after a short cooldown. Auto-dispatch only runs when the main ChatGPT composer is empty, so queue or clear any draft text/attachments before expecting the next follow-up to fire automatically.
5. Use **Stop** to pause, **Send next** for a single dispatch, and **Clear** to empty the queue.
6. Manage queued items directly in the panel—edit text inline, move items with **Up**/**Down**, or remove them entirely.
7. Collapse the panel with **Hide** to reveal a compact dock button; click the dock to reopen the queue when you need it again.

### Keyboard Shortcuts

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Queue current input (in composer) | Option+Enter | Alt+Enter |
| Queue input & pause | Option+Cmd+Enter | Alt+Ctrl+Enter |
| Focus queue items | Option+↑ / Option+↓ | Alt+↑ / Alt+↓ |
| Send focused follow-up | Enter | Enter |
| Delete focused follow-up (confirm) | Shift+Delete | Shift+Delete |
| Delete focused follow-up (instant) | Option+Shift+Delete | Alt+Shift+Delete |
| Expand/collapse queue list | Cmd+Shift+. | Ctrl+Shift+. |
| Pause/resume queue | Shift+Cmd+P | Shift+Ctrl+P |
| Extension shortcut default | Cmd+Shift+Y | Ctrl+Shift+Y |
| Extension toggle default | Cmd+Shift+G | Ctrl+Shift+G |

Shortcuts can be customized from the browser’s extension shortcuts settings.

### Queue Management

- Every queued prompt appears in an editable card; changes save automatically to `chrome.storage.local`.
- A dedicated queue composer lets you add prompts without touching the main ChatGPT input.
- Use **Option/Alt+Enter** inside the queue composer to queue quickly; the **Queue text** button offers the same action.
- Use the **Up** and **Down** controls to reorder items without leaving the page.
- Press **Option/Alt+↑** or **Option/Alt+↓** from the ChatGPT composer or any queue card to move focus through follow-ups without touching the mouse.
- When a queue card is focused, press **Enter** to send it immediately, **Shift+Enter** for a newline, **Shift+Delete** to remove it with a confirmation, or **Option/Alt+Shift+Delete** to remove it instantly.
- Choose **Delete** on a card to drop it from the run; the panel updates immediately so you can keep an eye on what is next.
- The first card is highlighted, making it easy to see the next prompt the extension plans to send.

### Visibility Controls

- Hit **Hide** in the panel header to collapse the interface and leave only the dock button in the corner.
- Click the dock button to reopen the full queue panel at any time.
- Use the browser's extension icon (or extensions dropdown) to toggle the dock button entirely when you want the UI off the page.

## Persistence and Data

The queue and the running state are saved to `chrome.storage.local`. No data is sent anywhere else. Review the terms of service for the sites you automate before using the extension.

## Development

Project structure:

- `chatgpt-queue/manifest.json` – Extension manifest and permissions.
- `chatgpt-queue/bg.js` – Service worker relaying keyboard commands to the active tab.
- `chatgpt-queue/content.js` – Queue logic, UI, and interaction with the ChatGPT composer.
- `chatgpt-queue/styles.css` – Styling for the floating control panel.

To iterate locally, make changes, reload the extension from `chrome://extensions`, and refresh your ChatGPT tab.

## Troubleshooting

- If the panel appears but nothing sends, inspect the page with DevTools and confirm the selectors in `content.js` match the current ChatGPT DOM. Update `SEL.editor`, `SEL.send`, or `SEL.stop` as needed.
- If text fails to insert, another extension may block the `beforeinput` event. The fallback uses `document.execCommand('insertText')`, but you may need to disable conflicting extensions.
- During ChatGPT single-page app route changes, the mutation observer and URL watcher rescan automatically. Give the page a moment after navigation before sending the next prompt.

## License

`chatgpt-queue` is distributed under the terms of the GNU General Public License v3.0. See [LICENSE](LICENSE) for details.
