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
    <div class="cq-head">
      <div class="cq-title"><strong>Queue</strong><span id="cq-count">0</span></div>
      <span id="cq-state" class="cq-state">Idle</span>
    </div>
    <div class="cq-row">
      <button id="cq-add">Add from input</button>
      <button id="cq-start">Start</button>
      <button id="cq-stop" disabled>Stop</button>
    </div>
    <div class="cq-row">
      <button id="cq-next">Send next</button>
      <button id="cq-clear">Clear</button>
    </div>
    <div id="cq-list" class="cq-queue"></div>`;
  document.documentElement.appendChild(ui);

  const $ = (selector) => ui.querySelector(selector);
  const elCount = $('#cq-count');
  const elState = $('#cq-state');
  const btnAdd = $('#cq-add');
  const btnStart = $('#cq-start');
  const btnStop = $('#cq-stop');
  const btnNext = $('#cq-next');
  const btnClear = $('#cq-clear');
  const list = $('#cq-list');

  let saveTimer;

  // Persist ------------------------------------------------------------------
  const save = () => chrome.storage?.local.set({ cq: { running: STATE.running, queue: STATE.queue } });
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save();
    }, 150);
  };

  const load = () => new Promise((resolve) => {
    chrome.storage?.local.get(['cq'], ({ cq }) => {
      if (cq) {
        STATE.running = !!cq.running;
        STATE.queue = Array.isArray(cq.queue)
          ? cq.queue.map((item) => (typeof item === 'string' ? item : String(item ?? '')))
          : [];
      }
      refreshAll();
      if (STATE.running) maybeKick();
      resolve();
    });
  });

  // DOM helpers ---------------------------------------------------------------
  const q = (selector, root = document) => root.querySelector(selector);
  const composer = () => q(SEL.composer);
  const isGenerating = () => !!q(SEL.stop, composer());

  function findEditor() {
    return q(SEL.editor);
  }

  function setPrompt(text) {
    const ed = findEditor();
    if (!ed) return false;

    ed.focus();

    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const ok = ed.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true,
      composed: true
    }));
    if (!ok) document.execCommand('insertText', false, text);

    ed.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function clickSend() {
    const button = q(SEL.send, composer());
    if (button) button.click();
  }

  function refreshControls() {
    elCount.textContent = String(STATE.queue.length);
    elState.textContent = STATE.busy ? 'Sending...' : STATE.running ? 'Running' : 'Idle';
    btnStart.disabled = STATE.running;
    btnStop.disabled = !STATE.running;
    btnNext.disabled = STATE.busy || STATE.queue.length === 0;
    btnClear.disabled = STATE.queue.length === 0;
    ui.classList.toggle('is-running', STATE.running);
    ui.classList.toggle('is-busy', STATE.busy);
  }

  function autoSize(textarea) {
    textarea.style.height = 'auto';
    const height = Math.min(200, textarea.scrollHeight + 4);
    textarea.style.height = `${height}px`;
  }

  function makeAction(label, action, index, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cq-mini';
    button.dataset.action = action;
    button.dataset.index = String(index);
    button.textContent = label;
    if (disabled) button.disabled = true;
    return button;
  }

  function renderQueue() {
    list.textContent = '';
    if (STATE.queue.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cq-empty';
      empty.textContent = 'Queue is empty.';
      list.appendChild(empty);
      return;
    }

    STATE.queue.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'cq-item';
      item.dataset.index = String(index);
      if (index === 0) item.classList.add('cq-item-next');

      const header = document.createElement('div');
      header.className = 'cq-item-header';

      const badge = document.createElement('span');
      badge.className = 'cq-item-index';
      badge.textContent = String(index + 1);
      header.appendChild(badge);

      const actions = document.createElement('div');
      actions.className = 'cq-item-actions';
      actions.append(
        makeAction('Up', 'up', index, index === 0),
        makeAction('Down', 'down', index, index === STATE.queue.length - 1),
        makeAction('Delete', 'delete', index)
      );
      header.appendChild(actions);

      const textarea = document.createElement('textarea');
      textarea.className = 'cq-item-text';
      textarea.value = entry;
      textarea.spellcheck = true;
      autoSize(textarea);
      textarea.addEventListener('input', () => {
        STATE.queue[index] = textarea.value;
        autoSize(textarea);
        scheduleSave();
      });
      textarea.addEventListener('blur', () => save());

      item.append(header, textarea);
      list.appendChild(item);
    });
  }

  function refreshAll() {
    refreshControls();
    renderQueue();
  }

  async function waitUntilIdle(timeoutMs = 120000) {
    const root = composer();
    if (!root) return false;

    return new Promise((resolve) => {
      const done = () => {
        observer.disconnect();
        clearTimeout(timer);
        setTimeout(() => resolve(true), STATE.cooldownMs);
      };
      const observer = new MutationObserver(() => {
        if (!q(SEL.stop, root) && q(SEL.send, root)) done();
      });
      observer.observe(root, { subtree: true, childList: true, attributes: true });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeoutMs);
    });
  }

  async function sendNext() {
    if (STATE.busy || STATE.queue.length === 0) return;
    if (!composer()) return;

    const prompt = STATE.queue.shift();
    STATE.busy = true;
    save();
    refreshAll();

    if (!setPrompt(prompt)) {
      STATE.busy = false;
      STATE.queue.unshift(prompt);
      refreshAll();
      save();
      return;
    }

    clickSend();
    await waitUntilIdle();

    STATE.busy = false;
    refreshControls();
    save();
    if (STATE.running) maybeKick();
  }

  function maybeKick() {
    if (STATE.running && !STATE.busy && STATE.queue.length > 0 && !isGenerating()) {
      setTimeout(() => sendNext(), 50);
    }
  }

  function moveItem(from, to) {
    if (to < 0 || to >= STATE.queue.length || from === to) return;
    const [entry] = STATE.queue.splice(from, 1);
    STATE.queue.splice(to, 0, entry);
    save();
    refreshAll();
  }

  // Buttons ------------------------------------------------------------------
  btnAdd.addEventListener('click', () => {
    const ed = findEditor();
    const text = ed?.innerText?.trim();
    if (!text) return;
    STATE.queue.push(text);
    ed.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    save();
    refreshAll();
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  });

  btnStart.addEventListener('click', () => {
    STATE.running = true;
    save();
    refreshControls();
    maybeKick();
  });

  btnStop.addEventListener('click', () => {
    STATE.running = false;
    save();
    refreshControls();
  });

  btnClear.addEventListener('click', () => {
    STATE.queue = [];
    save();
    refreshAll();
  });

  btnNext.addEventListener('click', sendNext);

  list.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const button = target.closest('button[data-action]');
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index)) return;

    const action = button.dataset.action;
    if (action === 'delete') {
      STATE.queue.splice(index, 1);
      save();
      refreshAll();
    } else if (action === 'up') {
      moveItem(index, index - 1);
    } else if (action === 'down') {
      moveItem(index, index + 1);
    }
  });

  // Shortcut inside page -----------------------------------------------------
  document.addEventListener('keydown', (event) => {
    const meta = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey;
    if (meta && event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      btnAdd.click();
    }
  }, true);

  // Commands from background --------------------------------------------------
  chrome.runtime?.onMessage.addListener((msg) => {
    if (msg?.type === 'queue-from-shortcut') btnAdd.click();
    if (msg?.type === 'toggle-queue') {
      STATE.running = !STATE.running;
      save();
      refreshControls();
      if (STATE.running) maybeKick();
    }
  });

  // Handle SPA changes and rerenders -----------------------------------------
  const rootObserver = new MutationObserver(() => { if (STATE.running) maybeKick(); });
  rootObserver.observe(document.documentElement, { subtree: true, childList: true });

  // Route change watcher ------------------------------------------------------
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (STATE.running) setTimeout(maybeKick, 300);
    }
  }, 800);

  load();
})();
