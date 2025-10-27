chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)/.test(tab.url || "")) return;
  chrome.tabs.sendMessage(tab.id, { type: cmd });
});
