(() => {
  const STATE = { running: false, queue: [], busy: false, cooldownMs: 900 };
  const SEL = {
    editor: '#prompt-textarea.ProseMirror[contenteditable="true"]',
    send: 'button[data-testid="send-button"], #composer-submit-button[aria-label="Send prompt"]',
    stop: 'button[data-testid="stop-button"][aria-label="Stop streaming"]',
    composer: 'form[data-type="unified-composer"]'
  };

  // UI -----------------------------------------------------------------------
  const ui = document.createElement('div');
  ui.id = 'cq-ui';
  ui.innerHTML = `
    <div class="cq-row"><strong>Queue</strong><span id="cq-count">0</span></div>
    <div class="cq-row">
      <button id="cq-add">Add from input</button>
      <button id="cq-start">Start</button>
      <button id="cq-stop" disabled>Stop</button>
    </div>
    <div class="cq-row">
      <button id="cq-next">Send next</button>
      <button id="cq-clear">Clear</button>
    </div>`;
  document.documentElement.appendChild(ui);

  const $ = (s) => ui.querySelector(s);
  const elCount = $('#cq-count');
  const btnAdd = $('#cq-add');
  const btnStart = $('#cq-start');
  const btnStop = $('#cq-stop');
  const btnNext = $('#cq-next');
  const btnClear = $('#cq-clear');

  // Persist ------------------------------------------------------------------
  const save = () => chrome.storage?.local.set({ cq: { running: STATE.running, queue: STATE.queue } });
  const load = () => new Promise((r) => chrome.storage?.local.get(['cq'], ({ cq }) => {
    if (cq) { STATE.running = !!cq.running; STATE.queue = Array.isArray(cq.queue) ? cq.queue : []; }
    refresh(); if (STATE.running) maybeKick(); r();
  }));

  // DOM helpers ---------------------------------------------------------------
  const q = (sel, root = document) => root.querySelector(sel);
  const composer = () => q(SEL.composer);
  const isGenerating = () => !!q(SEL.stop, composer());
  const canSend = () => !!q(SEL.send, composer());

  function findEditor() { return q(SEL.editor); }

  function setPrompt(text) {
    const ed = findEditor();
    if (!ed) return false;

    ed.focus();

    // caret end
    const r = document.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);

    // ProseMirror-friendly path
    const ok = ed.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText', data: text, bubbles: true, cancelable: true, composed: true
    }));
    if (!ok) document.execCommand('insertText', false, text);

    ed.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function clickSend() { const b = q(SEL.send, composer()); if (b) b.click(); }
  function refresh() {
    elCount.textContent = String(STATE.queue.length);
    btnStart.disabled = STATE.running;
    btnStop.disabled = !STATE.running;
    btnNext.disabled = STATE.busy || STATE.queue.length === 0;
    btnClear.disabled = STATE.queue.length === 0;
  }

  async function waitUntilIdle(timeoutMs = 120000) {
    const root = composer(); if (!root) return false;

    return new Promise((resolve) => {
      const done = () => { obs.disconnect(); clearTimeout(t); setTimeout(() => resolve(true), STATE.cooldownMs); };
      const obs = new MutationObserver(() => {
        if (!q(SEL.stop, root) && q(SEL.send, root)) done();
      });
      obs.observe(root, { subtree: true, childList: true, attributes: true });
      const t = setTimeout(() => { obs.disconnect(); resolve(false); }, timeoutMs);
    });
  }

  async function sendNext() {
    if (STATE.busy || STATE.queue.length === 0) return;
    if (!composer()) return;

    const prompt = STATE.queue.shift();
    STATE.busy = true; save(); refresh();

    if (!setPrompt(prompt)) { STATE.busy = false; refresh(); return; }
    clickSend();

    await waitUntilIdle();

    STATE.busy = false; save(); refresh();
    if (STATE.running) maybeKick();
  }

  function maybeKick() {
    if (STATE.running && !STATE.busy && STATE.queue.length > 0 && !isGenerating()) {
      setTimeout(() => sendNext(), 50);
    }
  }

  // Buttons ------------------------------------------------------------------
  btnAdd.addEventListener('click', () => {
    const ed = findEditor();
    const text = ed?.innerText?.trim();
    if (!text) return;
    STATE.queue.push(text);
    // clear editor
    ed.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    save(); refresh();
  });

  btnStart.addEventListener('click', () => { STATE.running = true; save(); refresh(); maybeKick(); });
  btnStop.addEventListener('click', () => { STATE.running = false; save(); refresh(); });
  btnClear.addEventListener('click', () => { STATE.queue = []; save(); refresh(); });
  btnNext.addEventListener('click', sendNext);

  // Shortcut inside page
  document.addEventListener('keydown', (e) => {
    const meta = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
    if (meta && e.shiftKey && e.key === 'Enter') { e.preventDefault(); btnAdd.click(); }
  }, true);

  // Commands from background
  chrome.runtime?.onMessage.addListener((msg) => {
    if (msg?.type === 'queue-from-shortcut') btnAdd.click();
    if (msg?.type === 'toggle-queue') { STATE.running = !STATE.running; save(); refresh(); if (STATE.running) maybeKick(); }
  });

  // Handle SPA changes and rerenders
  const rootObs = new MutationObserver(() => { if (STATE.running) maybeKick(); });
  rootObs.observe(document.documentElement, { subtree: true, childList: true });

  // Route change watcher
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; if (STATE.running) setTimeout(maybeKick, 300); }
  }, 800);

  load();
})();
