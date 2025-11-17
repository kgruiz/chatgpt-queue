import { defineConfig } from "wxt";
import checker from "vite-plugin-checker";

export default defineConfig({
  srcDir: "src",
  vite: () => ({
    plugins: [
      checker({
        typescript: {
          tsconfigPath: "./tsconfig.json",
        },
      }),
    ],
  }),
  manifest: {
    name: "chatgpt-queue",
    description: "Queue prompts and auto-send after each reply finishes.",
    version: "0.1.0",
    action: {
      default_title: "chatgpt-queue",
    },
    permissions: ["storage", "activeTab"],
    host_permissions: [
      "https://chat.openai.com/*",
      "https://chatgpt.com/*",
    ],
    commands: {
      "queue-from-shortcut": {
        suggested_key: { default: "Ctrl+Shift+Y", mac: "Command+Shift+Y" },
        description: "Queue current input",
      },
      "toggle-queue": {
        suggested_key: { default: "Ctrl+Shift+G", mac: "Command+Shift+G" },
        description: "Start/Stop queue",
      },
    },
    web_accessible_resources: [
      {
        resources: ["bridge.js"],
        matches: [
          "https://chat.openai.com/*",
          "https://chatgpt.com/*",
        ],
      },
    ],
  },
});
