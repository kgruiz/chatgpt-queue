// @ts-nocheck

import { defineUnlistedScript } from "#imports";

export default defineUnlistedScript(() => {
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const msg = e.data;
    if (!msg || msg.type !== 'CQ_SET_PROMPT') return;

    const ed = document.querySelector('#prompt-textarea.ProseMirror[contenteditable="true"]');
    const normalizeText = (value) => {
      if (typeof value !== 'string') return '';
      return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    };

    const buildDoc = (schema, text) => {
      const lines = normalizeText(text).split('\n');
      const hardBreakNode = schema.nodes?.hardBreak;
      if (hardBreakNode) {
        const nodes = [];
        lines.forEach((line, idx) => {
          if (idx > 0) nodes.push(hardBreakNode.create());
          if (line) nodes.push(schema.text(line));
        });
        const paragraph = nodes.length > 0 ? schema.node('paragraph', null, nodes) : schema.node('paragraph');
        return schema.node('doc', null, [paragraph]);
      }
      const paragraphs = lines.map((line) => {
        if (!line) return schema.node('paragraph');
        return schema.node('paragraph', null, schema.text(line));
      });
      if (paragraphs.length === 0) {
        paragraphs.push(schema.node('paragraph'));
      }
      return schema.node('doc', null, paragraphs);
    };

    const renderFallback = (element, text) => {
      const lines = normalizeText(text).split('\n');
      element.innerHTML = '';
      if (lines.length === 0) lines.push('');
      const p = document.createElement('p');
      const preserveSpacing = (value) => value.replace(/ {2,}/g, (match) => ` ${'\u00a0'.repeat(match.length - 1)}`);
      lines.forEach((line, idx) => {
        if (idx > 0) p.appendChild(document.createElement('br'));
        if (line) {
          p.appendChild(document.createTextNode(preserveSpacing(line)));
        } else if (idx === 0) {
          p.appendChild(document.createElement('br'));
        }
      });
      if (!p.childNodes.length) {
        p.appendChild(document.createElement('br'));
      }
      element.appendChild(p);
      const last = element.lastElementChild;
      if (last) {
        let trailing = last.querySelector('br:last-of-type');
        if (!trailing) {
          trailing = document.createElement('br');
          last.appendChild(trailing);
        }
        trailing.classList.add('ProseMirror-trailingBreak');
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.focus();
    };

    try {
      const view =
        ed && ((ed.pmViewDesc && ed.pmViewDesc.editorView) ||
               (ed._pmViewDesc && ed._pmViewDesc.editorView));
      const text = normalizeText(msg.text ?? '');

      if (view && view.state) {
        const { state } = view;
        const docNode = buildDoc(state.schema, text);
        const tr = state.tr.replaceWith(0, state.doc.content.size, docNode.content);
        view.dispatch(tr);
        view.focus();
      } else if (ed) {
        renderFallback(ed, text);
      }
    } finally {
      window.postMessage({ type: 'CQ_SET_PROMPT_DONE' }, '*');
    }
  }, false);
});
