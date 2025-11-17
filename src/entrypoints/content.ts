import "../styles/content.css";
import { defineContentScript } from "#imports";
import { bootstrapContent } from "../runtime/content-runtime";

export default defineContentScript({
    matches: [
        "https://chat.openai.com/*",
        "https://chatgpt.com/*",
    ],
    runAt: "document_idle",
    cssInjectionMode: "manifest",
    main() {
        bootstrapContent();
    },
});
