(() => {
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const msg = e.data;
    if (!msg || msg.type !== 'CQ_SET_PROMPT') return;

    const ed = document.querySelector('#prompt-textarea.ProseMirror[contenteditable="true"]');
    try {
      const view =
        ed && ((ed.pmViewDesc && ed.pmViewDesc.editorView) ||
               (ed._pmViewDesc && ed._pmViewDesc.editorView));
      const text = String(msg.text ?? '');

      if (view && view.state) {
        const tr = view.state.tr.insertText(text, 0, view.state.doc.content.size);
        view.dispatch(tr);
        view.focus();
      } else if (ed) {
        // fallback if editorView is hidden
        ed.textContent = text;
        ed.dispatchEvent(new Event('input', { bubbles: true }));
        ed.focus();
      }
    } finally {
      window.postMessage({ type: 'CQ_SET_PROMPT_DONE' }, '*');
    }
  }, false);
})();
