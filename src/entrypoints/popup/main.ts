import "./style.css";

const app = document.getElementById("app");
if (!app) throw new Error("App element not found");

const container = document.createElement("div");
container.className = "popup-container";

const toggleButton = document.createElement("button");
toggleButton.className = "popup-button";
toggleButton.textContent = "Toggle Queue";
toggleButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && /^https:\/\/(chatgpt\.com|chat\.openai\.com)/.test(tab.url || "")) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-ui" });
    window.close();
  }
});

const settingsButton = document.createElement("button");
settingsButton.className = "popup-button";
settingsButton.textContent = "Settings";
settingsButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && /^https:\/\/(chatgpt\.com|chat\.openai\.com)/.test(tab.url || "")) {
    chrome.tabs.sendMessage(tab.id, { type: "open-settings" });
    window.close();
  }
});

container.appendChild(toggleButton);
container.appendChild(settingsButton);
app.appendChild(container);
