import "./style.css";

const app = document.getElementById("app");
if (!app) throw new Error("App element not found");

const container = document.createElement("div");
container.className = "popup-container";

const toggleButton = document.createElement("button");
toggleButton.className = "popup-button";
toggleButton.textContent = "Toggle Queue";

const settingsButton = document.createElement("button");
settingsButton.className = "popup-button";
settingsButton.textContent = "Settings";

const message = document.createElement("div");
message.className = "popup-message";
message.style.display = "none";
message.textContent = "Open ChatGPT to use this extension";

const init = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isChatGPT = tab?.url && /^https:\/\/(chatgpt\.com|chat\.openai\.com)/.test(tab.url);

  if (!isChatGPT) {
    toggleButton.disabled = true;
    settingsButton.disabled = true;
    message.style.display = "block";
  }

  toggleButton.addEventListener("click", async () => {
    if (tab?.id && isChatGPT) {
      chrome.tabs.sendMessage(tab.id, { type: "toggle-ui" });
      window.close();
    }
  });

  settingsButton.addEventListener("click", async () => {
    if (tab?.id && isChatGPT) {
      chrome.tabs.sendMessage(tab.id, { type: "open-settings" });
      window.close();
    }
  });
};

container.appendChild(toggleButton);
container.appendChild(settingsButton);
container.appendChild(message);
app.appendChild(container);

init();
