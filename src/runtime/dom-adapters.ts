import { UI_CLASS } from "../lib/ui/classes";

export const SEL = {
    editor: '#prompt-textarea.ProseMirror[contenteditable="true"]',
    send: 'button[data-testid="send-button"], #composer-submit-button[aria-label="Send prompt"]',
    voice: 'button[data-testid="composer-speech-button"], button[aria-label="Start voice mode"]',
    stop: 'button[data-testid="stop-button"][aria-label="Stop streaming"]',
    composer:
        'form[data-type="unified-composer"], form[data-testid="composer"], div[data-testid="composer"], div[data-testid="composer-root"]',
};

export const CQ_SELECTORS = {
    row: `.${UI_CLASS.row}`,
    rowTextarea: `.${UI_CLASS.rowTextarea}`,
    inlineHeader: `.${UI_CLASS.inlineHeader}`,
};

export const q = <T extends Element = HTMLElement>(
    selector: string,
    root: Document | Element | null = document,
): T | null => {

    if (!root || typeof (root as ParentNode & { querySelector?: unknown }).querySelector !== "function") {
        return null;
    }

    try {
        return ((root as Document | Element).querySelector(selector) as T | null) || null;
    } catch (_) {
        return null;
    }
};

export const isVisible = (node: Element | null | undefined): node is HTMLElement =>
    node instanceof HTMLElement && node.offsetParent !== null;

export const findSendButton = (root: Document | Element | null): HTMLButtonElement | null => {

    if (!root || typeof (root as ParentNode).querySelectorAll !== "function") return null;

    const candidates = (root as ParentNode).querySelectorAll(SEL.send);

    for (const candidate of candidates) {
        if (candidate instanceof HTMLElement && isVisible(candidate)) {
            return candidate as HTMLButtonElement;
        }
    }

    const fallback = candidates[0];

    return fallback instanceof HTMLElement ? (fallback as HTMLButtonElement) : null;
};

export type EditorElement = HTMLElement & {
    pmViewDesc?: { editorView?: unknown };
    _pmViewDesc?: { editorView?: unknown };
};

export const findEditor = (): EditorElement | null => q<EditorElement>(SEL.editor);

export const composer = (): HTMLElement | null => {

    const preset = q<HTMLElement>(SEL.composer);

    if (preset) return preset;

    const sendButton = q<HTMLElement>(SEL.send);

    if (sendButton) {
        const scoped = sendButton.closest<HTMLElement>("form, [data-testid], [data-type], [class]");

        if (scoped) return scoped;
    }

    const ed = findEditor();

    return (ed?.closest("form, [data-testid], [data-type], [class]") as HTMLElement | null) || null;
};

export const isGenerating = () => !!q(SEL.stop, composer());
