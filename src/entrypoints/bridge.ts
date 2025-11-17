import { defineUnlistedScript } from "#imports";

interface ProseMirrorSchemaLike {
  nodes?: Record<string, { create: () => unknown }>;
  text(value: string): unknown;
  node(
    type: string,
    attrs?: unknown,
    content?: unknown,
  ): unknown;
}

interface ProseMirrorStateLike {
  schema: ProseMirrorSchemaLike;
  tr: { replaceWith: (from: number, to: number, content: unknown) => unknown };
  doc: { content: { size: number } };
}

interface ProseMirrorViewLike {
  state: ProseMirrorStateLike;
  dispatch(transaction: unknown): void;
  focus(): void;
}

interface ComposerElement extends HTMLElement {
  pmViewDesc?: { editorView?: ProseMirrorViewLike };
  _pmViewDesc?: { editorView?: ProseMirrorViewLike };
}

interface SetPromptMessage {
  type: "CQ_SET_PROMPT";
  text?: string | null;
}

const isSetPromptMessage = (value: unknown): value is SetPromptMessage => {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "CQ_SET_PROMPT",
  );
};

const normalizeText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
};

const buildDoc = (schema: ProseMirrorSchemaLike, text: string) => {
  const lines = normalizeText(text).split("\n");
  const hardBreakNode = schema.nodes?.hardBreak;
  if (hardBreakNode) {
    const nodes: unknown[] = [];
    lines.forEach((line, idx) => {
      if (idx > 0) nodes.push(hardBreakNode.create());
      if (line) nodes.push(schema.text(line));
    });
    const paragraph = nodes.length > 0
      ? schema.node("paragraph", null, nodes)
      : schema.node("paragraph");
    return schema.node("doc", null, [paragraph]);
  }
  const paragraphs = lines.map((line) => {
    if (!line) return schema.node("paragraph");
    return schema.node("paragraph", null, schema.text(line));
  });
  if (paragraphs.length === 0) {
    paragraphs.push(schema.node("paragraph"));
  }
  return schema.node("doc", null, paragraphs);
};

const renderFallback = (element: HTMLElement, text: string) => {
  const lines = normalizeText(text).split("\n");
  element.innerHTML = "";
  if (lines.length === 0) lines.push("");
  const paragraph = document.createElement("p");
  const preserveSpacing = (value: string) =>
    value.replace(/ {2,}/g, (match) => ` ${"\u00a0".repeat(match.length - 1)}`);
  lines.forEach((line, idx) => {
    if (idx > 0) paragraph.appendChild(document.createElement("br"));
    if (line) {
      paragraph.appendChild(document.createTextNode(preserveSpacing(line)));
    } else if (idx === 0) {
      paragraph.appendChild(document.createElement("br"));
    }
  });
  if (!paragraph.childNodes.length) {
    paragraph.appendChild(document.createElement("br"));
  }
  element.appendChild(paragraph);
  const last = element.lastElementChild;
  if (last) {
    let trailing = last.querySelector("br:last-of-type");
    if (!trailing) {
      trailing = document.createElement("br");
      last.appendChild(trailing);
    }
    trailing.classList.add("ProseMirror-trailingBreak");
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.focus();
};

const resolveEditorView = (
  element: HTMLElement | null,
): ProseMirrorViewLike | null => {
  if (!element) return null;
  const candidate = element as ComposerElement;
  return (
    candidate.pmViewDesc?.editorView ||
    candidate._pmViewDesc?.editorView ||
    null
  );
};

export default defineUnlistedScript(() => {
  window.addEventListener(
    "message",
    (event: MessageEvent<unknown>) => {
      if (event.source !== window) return;
      if (!isSetPromptMessage(event.data)) return;

      const editor = document.querySelector<HTMLElement>(
        '#prompt-textarea.ProseMirror[contenteditable="true"]',
      );
      const view = resolveEditorView(editor);
      const text = normalizeText(event.data.text ?? "");

      try {
        if (view?.state) {
          const { state } = view;
          const docNode = buildDoc(state.schema, text);
          const transaction = state.tr.replaceWith(
            0,
            state.doc.content.size,
            (docNode as { content?: unknown })?.content ?? docNode,
          );
          view.dispatch(transaction);
          view.focus();
        } else if (editor) {
          renderFallback(editor, text);
        }
      } finally {
        window.postMessage({ type: "CQ_SET_PROMPT_DONE" }, "*");
      }
    },
    false,
  );
});
