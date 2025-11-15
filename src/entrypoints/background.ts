import { defineBackground } from "#imports";

export default defineBackground(() => {
  chrome.commands.onCommand.addListener(async (cmd) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)/.test(tab.url || "")) return;
    chrome.tabs.sendMessage(tab.id, { type: cmd });
  });

  chrome.action?.onClicked.addListener(async (tab) => {
    if (!tab?.id || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)/.test(tab.url || "")) return;
    chrome.tabs.sendMessage(tab.id, { type: 'toggle-ui' });
  });
});
