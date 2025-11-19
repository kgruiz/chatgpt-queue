import "./style.css";

const app = document.getElementById("app");
if (!app) throw new Error("App element not found");

const createIcon = (path: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="${path}" />
  </svg>
`;

const ICONS = {
  settings: "M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z",
  queue: "M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z",
  toggle: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"
};

const createMenu = () => {
  const container = document.createElement("div");
  container.className = "popup-container";

  // Header
  const header = document.createElement("div");
  header.className = "popup-header";
  header.textContent = "Queue Controller";
  container.appendChild(header);

  // Toggle Button
  const toggleButton = document.createElement("button");
  toggleButton.className = "menu-item";
  toggleButton.innerHTML = `
    ${createIcon("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z")}
    <span>Pause Queue</span>
    <div class="status-dot active"></div>
  `;

  // Settings Button
  const settingsButton = document.createElement("button");
  settingsButton.className = "menu-item";
  settingsButton.innerHTML = `
    ${createIcon(ICONS.settings)}
    <span>Settings</span>
  `;

  // Message for non-ChatGPT pages
  const message = document.createElement("div");
  message.className = "popup-message";
  message.style.display = "none";
  message.textContent = "Open ChatGPT to use this extension";

  container.appendChild(toggleButton);
  container.appendChild(document.createElement("div")).className = "divider";
  container.appendChild(settingsButton);
  container.appendChild(message);

  app.appendChild(container);

  return { toggleButton, settingsButton, message, container };
};

const init = async () => {
  const ui = createMenu();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isChatGPT = tab?.url && /^https:\/\/(chatgpt\.com|chat\.openai\.com)/.test(tab.url);

  if (!isChatGPT) {
    ui.toggleButton.disabled = true;
    ui.settingsButton.disabled = true;
    ui.message.style.display = "block";
  } else {
    try {
      const response = await chrome.tabs.sendMessage(tab.id!, { type: "get-status" });
      if (response) {
        updateToggleState(ui.toggleButton, response.paused);
      }
    } catch (e) {
      console.log("Could not get status", e);
    }
  }

  ui.toggleButton.addEventListener("click", async () => {
    if (tab?.id && isChatGPT) {
      // Send toggle-queue command to pause/resume the queue
      chrome.tabs.sendMessage(tab.id, { type: "toggle-queue" });
      window.close();
    }
  });

  ui.settingsButton.addEventListener("click", async () => {
    if (tab?.id && isChatGPT) {
      chrome.tabs.sendMessage(tab.id, { type: "open-settings" });
      window.close();
    }
  });
};

function updateToggleState(button: HTMLButtonElement, isPaused: boolean) {
  const icon = isPaused
    ? "M8 5v14l11-7z" // Play
    : "M6 19h4V5H6v14zm8-14v14h4V5h-4z"; // Pause

  button.innerHTML = `
    ${createIcon(icon)}
    <span>${isPaused ? "Resume Queue" : "Pause Queue"}</span>
    <div class="status-dot ${isPaused ? "" : "active"}"></div>
  `;
}

init();
