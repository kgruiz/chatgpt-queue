(() => {
  const STATE = { running: false, queue: [], busy: false, cooldownMs: 900, collapsed: false, showDock: true, phase: 'idle' };
  const SEL = {
    editor: '#prompt-textarea.ProseMirror[contenteditable="true"]',
    send: 'button[data-testid="send-button"], #composer-submit-button[aria-label="Send prompt"]',
    voice: 'button[data-testid="composer-speech-button"], button[aria-label="Start voice mode"]',
    stop: 'button[data-testid="stop-button"][aria-label="Stop streaming"]',
    composer: 'form[data-type="unified-composer"], div[data-testid="composer"], div[data-testid="composer-root"]'
  };

  function injectBridge() {
    if (document.getElementById('cq-bridge')) return;
    const url = chrome.runtime?.getURL?.('bridge.js');
    if (!url) return;
    const s = document.createElement('script');
    s.id = 'cq-bridge';
    s.src = url;
    s.type = 'text/javascript';
    s.addEventListener('error', () => s.remove());
    (document.head || document.documentElement).appendChild(s);
  }

  injectBridge();

  // UI -----------------------------------------------------------------------
  document.getElementById('cq-ui')?.remove();
  document.getElementById('cq-dock')?.remove();

  const ui = document.createElement('div');
  ui.id = 'cq-ui';
  ui.innerHTML = `
    <div class="cq-header">
      <div class="cq-title">Queue <span id=\"cq-count\" aria-live=\"polite\">0</span></div>
      <div class="cq-head-side">
        <span id="cq-state" class="cq-state" aria-live="polite">Idle</span>
        <button id="cq-collapse" class="icon-btn" type="button" aria-label="Collapse queue panel">Hide</button>
      </div>
    </div>
    <div class="cq-row">
      <button id="cq-add" class="btn" type="button">Add from input</button>
      <button id="cq-start" class="btn btn--primary" type="button">Start</button>
      <button id="cq-stop" class="btn btn--danger" type="button" disabled>Stop</button>
    </div>
    <div class="cq-row">
      <button id="cq-next" class="btn" type="button">Send next</button>
      <button id="cq-clear" class="btn" type="button">Clear</button>
    </div>
    <div class="composer">
      <div class="composer__box">
        <textarea id="cq-new-text" class="composer__input" placeholder="Type a prompt to queue" spellcheck="true"></textarea>
        <button id="cq-new-add" class="composer__btn" type="button" aria-label="Queue text">➕</button>
      </div>
    </div>
    <div id="cq-list" class="cq-queue" aria-label="Queued prompts"></div>`;
  document.documentElement.appendChild(ui);

  const $ = (selector) => ui.querySelector(selector);
  const elCount = $('#cq-count');
  const elState = $('#cq-state');
  const btnCollapse = $('#cq-collapse');
  const btnAdd = $('#cq-add');
  const btnStart = $('#cq-start');
  const btnStop = $('#cq-stop');
  const btnNext = $('#cq-next');
  const btnClear = $('#cq-clear');
  const newInput = $('#cq-new-text');
  const btnNewAdd = $('#cq-new-add');
  const list = $('#cq-list');

  const dock = document.createElement('button');
  dock.id = 'cq-dock';
  dock.type = 'button';
  dock.textContent = 'Queue';
  dock.setAttribute('aria-label', 'Open chatgpt queue panel');
  document.documentElement.appendChild(dock);

  ui.style.display = 'none';
  ui.setAttribute('aria-hidden', 'true');
  dock.hidden = true;

  let saveTimer;
  let hydrated = false; // gate UI visibility until persisted state is loaded

  // Persist ------------------------------------------------------------------
  const persistable = () => ({
    running: STATE.running,
    queue: STATE.queue.slice(),
    collapsed: STATE.collapsed,
    showDock: STATE.showDock
  });

  const save = () => chrome.storage?.local.set({ cq: persistable() });
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save();
    }, 150);
  };

  const load = () => new Promise((resolve) => {
    const applyState = (cq) => {
      if (cq) {
        STATE.running = !!cq.running;
        STATE.queue = Array.isArray(cq.queue)
          ? cq.queue.map((item) => (typeof item === 'string' ? item : String(item ?? '')))
          : [];
        STATE.collapsed = cq.collapsed === true;
        STATE.showDock = cq.showDock !== false;
      }
      refreshAll();
      hydrated = true;
      refreshVisibility();
      if (STATE.running) maybeKick();
      resolve();
    };

    if (chrome.storage?.local?.get) {
      chrome.storage.local.get(['cq'], ({ cq }) => applyState(cq));
    } else {
      applyState(null);
    }
  });

  // DOM helpers ---------------------------------------------------------------
  const q = (selector, root = document) => root.querySelector(selector);
  const composer = () => {
    const preset = q(SEL.composer);
    if (preset) return preset;
    const sendButton = q(SEL.send);
    if (sendButton) {
      const scoped = sendButton.closest('form, [data-testid], [data-type], [class]');
      if (scoped) return scoped;
    }
    const ed = findEditor();
    return ed?.closest('form, [data-testid], [data-type], [class]') || null;
  };
  const isGenerating = () => !!q(SEL.stop, composer());

  function findEditor() {
    return q(SEL.editor);
  }

  function editorView() {
    const ed = findEditor();
    if (!ed) return null;
    return ed.pmViewDesc?.editorView || ed._pmViewDesc?.editorView || null;
  }

  function setPrompt(text) {
    return new Promise((resolve) => {
      const onMsg = (e) => {
        if (e.source === window && e.data && e.data.type === 'CQ_SET_PROMPT_DONE') {
          window.removeEventListener('message', onMsg);
          resolve(true);
        }
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ type: 'CQ_SET_PROMPT', text }, '*');

      // safety timeout
      setTimeout(() => { window.removeEventListener('message', onMsg); resolve(false); }, 1500);
    });
  }

  function clickSend() {
    const button = q(SEL.send, composer());
    if (button) button.click();
  }

  function refreshControls() {
    elCount.textContent = String(STATE.queue.length);
    let status = 'Idle';
    if (STATE.busy) {
      status = STATE.phase === 'waiting' ? 'Waiting...' : 'Sending...';
    } else if (STATE.running) {
      status = 'Running';
    }
    elState.textContent = status;
    btnStart.disabled = STATE.running;
    btnStop.disabled = !STATE.running;
    btnNext.disabled = STATE.busy || STATE.queue.length === 0;
    btnClear.disabled = STATE.queue.length === 0;
    if (btnNewAdd) {
      const value = newInput ? newInput.value.trim() : '';
      btnNewAdd.disabled = STATE.busy || !value;
    }
    if (btnCollapse) {
      const label = STATE.collapsed ? 'Show' : 'Hide';
      btnCollapse.textContent = label;
      btnCollapse.setAttribute('aria-label', `${label} queue panel`);
    }
    dock.classList.toggle('is-running', STATE.running);
    dock.classList.toggle('is-busy', STATE.busy);
    ui.classList.toggle('is-running', STATE.running);
    ui.classList.toggle('is-busy', STATE.busy);
  }

  function refreshVisibility() {
    if (!hydrated) {
      ui.style.display = 'none';
      ui.setAttribute('aria-hidden', 'true');
      dock.hidden = true;
      return;
    }
    const collapsed = STATE.collapsed;
    ui.style.display = collapsed ? 'none' : 'flex';
    ui.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    dock.hidden = !(STATE.showDock && collapsed);
  }

  function setCollapsed(collapsed, persist = true) {
    STATE.collapsed = collapsed;
    refreshVisibility();
    refreshControls();
    if (!collapsed) newInput?.focus({ preventScroll: true });
    if (persist) save();
  }

  function setShowDock(show, persist = true) {
    STATE.showDock = show;
    refreshVisibility();
    if (persist) save();
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
      let finished = false;
      let observer;
      let timer;
      const done = () => {
        if (finished) return;
        finished = true;
        observer?.disconnect();
        if (timer !== undefined) clearTimeout(timer);
        setTimeout(() => resolve(true), STATE.cooldownMs);
      };
      const isIdle = () => {
        const stopBtn = q(SEL.stop, root);
        if (stopBtn && !stopBtn.disabled && stopBtn.offsetParent !== null) return false;
        const sendBtn = q(SEL.send, root);
        if (sendBtn && !sendBtn.disabled && sendBtn.offsetParent !== null) return true;
        const voiceBtn = q(SEL.voice, root);
        if (voiceBtn && !voiceBtn.disabled && voiceBtn.offsetParent !== null) return true;
        return false;
      };
      observer = new MutationObserver(() => {
        if (isIdle()) done();
      });
      observer.observe(root, { subtree: true, childList: true, attributes: true });
      if (isIdle()) {
        done();
        return;
      }
      timer = setTimeout(() => {
        if (finished) return;
        observer?.disconnect();
        resolve(false);
      }, timeoutMs);
    });
  }

  async function sendNext() {
    if (STATE.busy || STATE.queue.length === 0) return;
    if (!composer()) return;

    const prompt = STATE.queue.shift();
    STATE.busy = true;
    STATE.phase = 'sending';
    save();
    refreshAll();

    if (!(await setPrompt(prompt))) {
      STATE.busy = false;
      STATE.phase = 'idle';
      STATE.queue.unshift(prompt);
      refreshAll();
      save();
      return;
    }

    clickSend();
    STATE.phase = 'waiting';
    refreshControls();
    await waitUntilIdle();

    STATE.busy = false;
    STATE.phase = 'idle';
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
  if (btnCollapse) {
    btnCollapse.addEventListener('click', () => {
      setCollapsed(true);
    });
  }

  dock.addEventListener('click', () => {
    if (!STATE.showDock) setShowDock(true);
    setCollapsed(false);
  });

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

  function queueNewInput() {
    if (!newInput) return;
    const text = newInput.value;
    if (!text.trim()) return;
    STATE.queue.push(text.replace(/\r\n/g, '\n'));
    newInput.value = '';
    autoSize(newInput);
    save();
    refreshAll();
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    newInput.focus();
  }

  if (newInput) {
    autoSize(newInput);
    newInput.addEventListener('input', () => {
      autoSize(newInput);
      refreshControls();
    });
    newInput.addEventListener('keydown', (event) => {
      const meta = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey;
      if (meta && event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        queueNewInput();
      }
    });
  }

  if (btnNewAdd) {
    btnNewAdd.addEventListener('click', () => {
      queueNewInput();
    });
  }

  btnStart.addEventListener('click', () => {
    STATE.running = true;
    if (!STATE.busy) STATE.phase = 'idle';
    save();
    refreshControls();
    maybeKick();
  });

  btnStop.addEventListener('click', () => {
    STATE.running = false;
    STATE.busy = false;
    STATE.phase = 'idle';
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
      if (!STATE.running) {
        STATE.busy = false;
        STATE.phase = 'idle';
      } else if (!STATE.busy) {
        STATE.phase = 'idle';
      }
      save();
      refreshControls();
      if (STATE.running) maybeKick();
    }
    if (msg?.type === 'toggle-ui') {
      if (!STATE.collapsed) {
        setCollapsed(true, false);
        setShowDock(true, false);
      } else {
        if (STATE.showDock) {
          setShowDock(false, false);
        } else {
          setShowDock(true, false);
          setCollapsed(false, false);
        }
      }
      save();
    }
    if (msg?.type === 'show-ui') {
      setShowDock(true, false);
      setCollapsed(false, false);
      save();
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

  refreshVisibility();
  load();
})();
