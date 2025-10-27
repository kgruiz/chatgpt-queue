# chatgpt-queue

Queue prompts for ChatGPT and send them automatically once each reply finishes. The extension keeps conversations moving without manual babysitting.

## Overview

`chatgpt-queue` adds a compact control panel to ChatGPT that lets you gather prompts, start or pause the queue, and dispatch messages safely once the model is idle. State is stored locally so you can pick up where you left off, even if the page reloads.

## Features

- Floating queue widget that stays visible while you browse the conversation.
- One-click capture of the current composer input, plus a Cmd/Ctrl+Shift+Enter shortcut.
- Automatic prompt dispatch with built-in cooldown once ChatGPT finishes responding.
- Manual controls for pausing, sending the next item, or clearing the queue.
- Lightweight implementation using a Manifest V3 background service worker and content script.

## Installation

1. Clone or download this repository.
2. Open Chrome, Edge, Brave, or another Chromium-based browser.
3. Navigate to `chrome://extensions` and enable **Developer mode**.
4. Choose **Load unpacked** and select the `chatgpt-queue/` directory inside this project.

_For Firefox testing_: open `about:debugging`, select **This Firefox**, choose **Load Temporary Add-on**, and pick `manifest.json`. If your Firefox build lacks MV3 service workers, adjust the manifest background section to use `"scripts": ["bg.js"]` before loading.

## Usage

1. Visit `https://chatgpt.com` or `https://chat.openai.com`.
2. Type a prompt in the composer. Use **Cmd+Shift+Enter** (macOS) or **Ctrl+Shift+Enter** (Windows/Linux) to move the text into the queue. You can also click **Add from input**.
3. Click **Start** to begin processing. The extension sends the first prompt, waits until the stop button disappears and the send button returns, then proceeds after a short cooldown.
4. Use **Stop** to pause, **Send next** for a single dispatch, and **Clear** to empty the queue.

### Keyboard Shortcuts

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Queue current input | Cmd+Shift+Enter | Ctrl+Shift+Enter |
| Toggle queue | Cmd+Shift+. | Ctrl+Shift+. |

Shortcuts can be customized from the browser’s extension shortcuts settings.

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
