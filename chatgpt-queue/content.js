(() => {
  const STATE = { running: false, queue: [], busy: false, cooldownMs: 900, collapsed: false, showDock: true, phase: 'idle', models: [] };
  const SEL = {
    editor: '#prompt-textarea.ProseMirror[contenteditable="true"]',
    send: 'button[data-testid="send-button"], #composer-submit-button[aria-label="Send prompt"]',
    voice: 'button[data-testid="composer-speech-button"], button[aria-label="Start voice mode"]',
    stop: 'button[data-testid="stop-button"][aria-label="Stop streaming"]',
    composer: 'form[data-type="unified-composer"], div[data-testid="composer"], div[data-testid="composer-root"]'
  };

  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalizeAttachment = (attachment) => {
    if (!attachment || typeof attachment !== 'object') return null;
    const id = typeof attachment.id === 'string' && attachment.id ? attachment.id : makeId();
    const name = typeof attachment.name === 'string' && attachment.name ? attachment.name : `image-${id}.png`;
    const mime = typeof attachment.mime === 'string' && attachment.mime ? attachment.mime : 'image/png';
    const dataUrl = typeof attachment.dataUrl === 'string' ? attachment.dataUrl : null;
    if (!dataUrl) return null;
    return { id, name, mime, dataUrl };
  };

  const normalizeEntry = (entry) => {
    if (typeof entry === 'string') return { text: entry, attachments: [], model: null, modelLabel: null };
    if (!entry || typeof entry !== 'object') return { text: String(entry ?? ''), attachments: [], model: null, modelLabel: null };
    const text = typeof entry.text === 'string' ? entry.text : String(entry.text ?? '');
    const attachments = Array.isArray(entry.attachments)
      ? entry.attachments.map((item) => normalizeAttachment(item)).filter(Boolean)
      : [];
    const model = typeof entry.model === 'string' && entry.model ? entry.model : null;
    const modelLabel = typeof entry.modelLabel === 'string' && entry.modelLabel ? entry.modelLabel : null;
    return { text, attachments, model, modelLabel };
  };

  const cloneAttachment = (attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mime: attachment.mime,
    dataUrl: attachment.dataUrl
  });

  const cloneEntry = (entry) => ({
    text: entry.text,
    attachments: Array.isArray(entry.attachments) ? entry.attachments.map((att) => cloneAttachment(att)) : [],
    model: entry.model || null,
    modelLabel: entry.modelLabel || null
  });

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const createAttachmentFromFile = async (file) => {
    const dataUrl = await readFileAsDataUrl(file);
    return normalizeAttachment({
      id: makeId(),
      name: file.name || `image-${makeId()}.${(file.type.split('/')[1] || 'png').split(';')[0]}`,
      mime: file.type || 'image/png',
      dataUrl
    });
  };

  const collectImagesFromDataTransfer = async (dataTransfer) => {
    if (!dataTransfer) return [];
    const items = Array.from(dataTransfer.items || []);
    const files = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length === 0 && dataTransfer.files?.length) {
      Array.from(dataTransfer.files).forEach((file) => {
        if (file.type.startsWith('image/')) files.push(file);
      });
    }
    if (files.length === 0) return [];
    const attachments = [];
    for (const file of files) {
      try {
        const attachment = await createAttachmentFromFile(file);
        if (attachment) attachments.push(attachment);
      } catch (_) {
        // ignore file read errors
      }
    }
    return attachments;
  };

  const hasImagesInDataTransfer = (dataTransfer) => {
    if (!dataTransfer) return false;
    const items = Array.from(dataTransfer.items || []);
    if (items.some((item) => item.kind === 'file' && item.type.startsWith('image/'))) return true;
    const files = Array.from(dataTransfer.files || []);
    return files.some((file) => file.type.startsWith('image/'));
  };

  const attachmentToFile = async (attachment) => {
    try {
      const normalized = normalizeAttachment(attachment);
      if (!normalized) return null;
      const response = await fetch(normalized.dataUrl);
      const blob = await response.blob();
      const mime = normalized.mime || blob.type || 'image/png';
      const extension = mime.split('/')[1] || 'png';
      const safeName = normalized.name || `image-${makeId()}.${extension}`;
      return new File([blob], safeName, { type: mime });
    } catch (error) {
      return null;
    }
  };

  const ATTACHMENT_SELECTORS = [
    '[data-testid="attachment-item"]',
    '[data-testid="chat-composer-attachment-item"]',
    '[data-testid="uploaded-file"]',
    '[data-testid="file-preview"]',
    '[data-testid="composer-upload-item"]',
    '[data-testid="attachment-preview"]'
  ];

  const countComposerAttachments = (root) => {
    if (!root) return 0;
    for (const selector of ATTACHMENT_SELECTORS) {
      const nodes = root.querySelectorAll(selector);
      if (nodes.length) return nodes.length;
    }
    const fallback = root.querySelectorAll('img[src^="blob:"]');
    return fallback.length;
  };

  const waitForAttachmentsReady = (root, baseCount, expectedIncrease, timeoutMs = 4000) => new Promise((resolve) => {
    if (!expectedIncrease) {
      resolve(true);
      return;
    }
    const target = baseCount + expectedIncrease;
    let settled = false;
    let observer;
    let poll;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (poll) clearInterval(poll);
      resolve(result);
    };
    observer = new MutationObserver(() => {
      if (countComposerAttachments(root) >= target) finish(true);
    });
    observer.observe(root, { childList: true, subtree: true });
    poll = setInterval(() => {
      if (countComposerAttachments(root) >= target) finish(true);
    }, 150);
    setTimeout(() => finish(false), timeoutMs);
  });

  const escapeCss = (value) => {
    const str = String(value ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(str);
    return str.replace(/[^a-zA-Z0-9_\-]/g, (ch) => `\\${ch}`);
  };

  const normalizeModelId = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let currentModelId = null;
  let currentModelLabel = '';
  let modelsPromise = null;
  let composerModelId = null;
  let composerModelLabel = '';
  let composerAttachments = [];

  const getModelNodeLabel = (node) => {
    if (!node) return '';
    const text = node.textContent || '';
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    return lines[0] || text.trim();
  };

  const findModelMenuRoot = () => {
    const selectors = [
      '[data-radix-menu-content]',
      '[data-radix-dropdown-menu-content]',
      '[role="menu"]',
      '[role="listbox"]'
    ];
    for (const root of document.querySelectorAll(selectors.join(','))) {
      if (!(root instanceof HTMLElement)) continue;
      if (root.querySelector('[data-testid^="model-switcher-"]')) return root;
    }
    return null;
  };

  const waitForModelMenu = (timeoutMs = 1500) => new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const root = findModelMenuRoot();
      if (root) {
        resolve(root);
        return;
      }
      if (performance.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

  const useModelMenu = async (operation) => {
    const button = document.querySelector('button[data-testid="model-switcher-dropdown-button"]');
    if (!button) return null;
    const wasOpen = button.getAttribute('aria-expanded') === 'true' || button.dataset.state === 'open';
    if (!wasOpen) button.click();
    const menu = await waitForModelMenu();
    if (!menu) {
      if (!wasOpen) button.click();
      return null;
    }
    let result;
    try {
      result = await operation(menu, button);
    } finally {
      if (!wasOpen) {
        const stillOpen = button.getAttribute('aria-expanded') === 'true' || button.dataset.state === 'open';
        if (stillOpen) button.click();
      }
    }
    return result;
  };

  const getModelById = (id) => {
    if (!id) return null;
    const normalized = normalizeModelId(id);
    return STATE.models.find((model) => normalizeModelId(model.id) === normalized) || null;
  };

  const labelForModel = (id, fallback = '') => {
    if (!id) return fallback || '';
    const info = getModelById(id);
    if (info?.label) return info.label;
    if (normalizeModelId(currentModelId) === normalizeModelId(id) && currentModelLabel) return currentModelLabel;
    return fallback || id;
  };

  const setCurrentModel = (id, label = '') => {
    const previous = currentModelId;
    currentModelId = id || null;
    currentModelLabel = label || labelForModel(id, currentModelLabel || '');
    const prevNormalized = normalizeModelId(previous);
    const currentNormalized = normalizeModelId(currentModelId);
    if (!composerModelId || normalizeModelId(composerModelId) === prevNormalized) {
      composerModelId = currentModelId;
      composerModelLabel = currentModelLabel;
    } else if (currentNormalized && normalizeModelId(composerModelId) === currentNormalized) {
      composerModelLabel = currentModelLabel;
    }
  };

  const markModelSelected = (id, label = '') => {
    if (!id) return;
    const normalized = normalizeModelId(id);
    let found = false;
    STATE.models = STATE.models.map((model) => {
      const match = normalizeModelId(model.id) === normalized;
      if (match) {
        found = true;
        return {
          ...model,
          selected: true,
          label: label || model.label || model.id
        };
      }
      if (model.selected) {
        return { ...model, selected: false };
      }
      return model;
    });
    if (!found) {
      STATE.models.push({ id, label: label || id, selected: true });
    }
    setCurrentModel(id, labelForModel(id, label));
  };

  const applyDefaultModelToQueueIfMissing = () => {
    if (!currentModelId) return false;
    let updated = false;
    STATE.queue.forEach((entry) => {
      if (!entry.model) {
        entry.model = currentModelId;
        entry.modelLabel = currentModelLabel;
        updated = true;
      }
    });
    if (updated) save();
    return updated;
  };

  const parseModelItems = (menu) => {
    const items = [];
    const seen = new Set();
    menu.querySelectorAll('[data-testid^="model-switcher-"]').forEach((node) => {
      const item = node.closest('[data-testid^="model-switcher-"]');
      if (!item || seen.has(item)) return;
      seen.add(item);
      const testId = item.getAttribute('data-testid') || '';
      if (!testId.startsWith('model-switcher-')) return;
      const id = testId.replace(/^model-switcher-/, '');
      if (!id || id.endsWith('-submenu')) return;
      const disabled = item.getAttribute('aria-disabled') === 'true' || item.matches('[data-disabled="true"]');
      if (disabled) return;
      const label = getModelNodeLabel(item) || id;
      const selected = item.getAttribute('data-state') === 'checked' || item.getAttribute('aria-checked') === 'true';
      items.push({ id, label, selected });
    });
    return items;
  };

  const mergeModelOptions = (options) => {
    const map = new Map();
    options.forEach((option) => {
      const key = normalizeModelId(option.id);
      const existing = map.get(key);
      if (!existing || option.selected) {
        map.set(key, { ...option, id: option.id });
      }
    });
    return Array.from(map.values());
  };

  const fetchModelOptions = async () => {
    const result = await useModelMenu(async (menu) => parseModelItems(menu));
    if (!Array.isArray(result)) return [];
    return mergeModelOptions(result);
  };

  const ensureModelOptions = async (options = {}) => {
    if (!options.force && STATE.models.length) {
      renderComposerModelSelect();
      return STATE.models;
    }
    if (modelsPromise) return modelsPromise;
    modelsPromise = (async () => {
      const models = await fetchModelOptions();
      modelsPromise = null;
      if (!models.length) return STATE.models;
      const previousSignature = JSON.stringify(STATE.models.map((model) => ({ id: model.id, label: model.label })));
      STATE.models = models;
      const selected = models.find((model) => model.selected);
      if (selected) {
        markModelSelected(selected.id, selected.label);
      } else if (models.length && !currentModelId) {
        markModelSelected(models[0].id, models[0].label);
      }
      const queueUpdated = applyDefaultModelToQueueIfMissing();
      renderComposerModelSelect();
      const newSignature = JSON.stringify(models.map((model) => ({ id: model.id, label: model.label })));
      if (queueUpdated || newSignature !== previousSignature) {
        refreshAll();
      }
      return STATE.models;
    })().catch((error) => {
      modelsPromise = null;
      console.warn('[cq] Failed to load model list', error);
      return STATE.models;
    });
    return modelsPromise;
  };

  const findModelMenuItem = (menu, modelId) => {
    if (!menu || !modelId) return null;
    const direct = menu.querySelector(`[data-testid="model-switcher-${escapeCss(modelId)}"]`);
    if (direct) return direct.closest('[data-testid^="model-switcher-"]') || direct;
    const normalized = normalizeModelId(modelId);
    const candidates = Array.from(menu.querySelectorAll('[data-testid^="model-switcher-"]'));
    for (const candidate of candidates) {
      const tid = candidate.getAttribute('data-testid') || '';
      const id = tid.replace(/^model-switcher-/, '');
      if (normalizeModelId(id) === normalized) return candidate;
    }
    const info = getModelById(modelId);
    if (info?.label) {
      const labelNormalized = normalizeModelId(info.label);
      for (const candidate of candidates) {
        const label = getModelNodeLabel(candidate);
        if (normalizeModelId(label) === labelNormalized) return candidate;
      }
    }
    return null;
  };

  const ensureModel = async (modelId) => {
    if (!modelId) return true;
    await ensureModelOptions();
    const targetNormalized = normalizeModelId(modelId);
    if (targetNormalized && normalizeModelId(currentModelId) === targetNormalized) return true;
    const result = await useModelMenu(async (menu) => {
      const item = findModelMenuItem(menu, modelId);
      if (!item) return false;
      const label = getModelNodeLabel(item) || modelId;
      item.click();
      await sleep(120);
      markModelSelected(modelId, label);
      return true;
    });
    if (result) renderComposerModelSelect();
    return !!result;
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
      <div class="cq-title">
        <span class="cq-label">Queue</span>
        <span id="cq-count" class="badge" aria-live="polite">0</span>
      </div>
      <div class="cq-head-side">
        <span id="cq-state" class="cq-state" aria-live="polite">Idle</span>
        <button id="cq-collapse" class="btn btn--quiet" type="button" aria-label="Collapse queue panel">Hide</button>
      </div>
    </div>
    <div class="cq-controls" role="group" aria-label="Queue controls">
      <button id="cq-add" class="btn btn--full" type="button">Add from input</button>
      <button id="cq-next" class="btn" type="button">Send next</button>
      <button id="cq-clear" class="btn" type="button">Clear</button>
      <button id="cq-start" class="btn btn--primary" type="button">Start</button>
      <button id="cq-stop" class="btn btn--danger" type="button" disabled>Stop</button>
    </div>
    <div class="composer">
      <div class="composer__box">
        <textarea id="cq-new-text" class="composer__input" placeholder="Type a prompt to queue" spellcheck="true"></textarea>
        <button id="cq-new-add" class="composer__btn" type="button" aria-label="Queue text">➕</button>
      </div>
      <div class="composer__meta">
        <label class="cq-field" for="cq-new-model">
          <span class="cq-field__label">Model</span>
          <select id="cq-new-model" class="cq-select" aria-label="Select model for new queue item"></select>
        </label>
        <div id="cq-new-media" class="cq-media-list cq-media-list--empty" aria-live="polite"></div>
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
  const newModelSelect = $('#cq-new-model');
  const newMedia = $('#cq-new-media');
  const list = $('#cq-list');
  renderComposerModelSelect();
  renderComposerAttachments();

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
  let dragIndex = null;
  let dragOverItem = null;
  let dragOverPosition = null;

  // Persist ------------------------------------------------------------------
  const persistable = () => ({
    running: STATE.running,
    queue: STATE.queue.map((entry) => cloneEntry(entry)),
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
          ? cq.queue.map((item) => normalizeEntry(item))
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

  async function applyAttachments(attachments) {
    if (!attachments || attachments.length === 0) return true;
    if (typeof DataTransfer === 'undefined') return false;
    const root = composer();
    if (!root) return false;
    const inputSelector = 'input[type="file"][accept*="image"], input[type="file"][accept*="png"], input[type="file"][accept*="jpg"], input[type="file"][accept*="jpeg"], input[type="file"][accept*="webp"], input[type="file"]';
    let input = root.querySelector(inputSelector);
    if (!input) {
      const trigger = root.querySelector('button[data-testid="file-upload-button"], button[aria-label="Upload files"], button[aria-label="Add file"], button[aria-label="Add files"], button[data-testid="upload-button"]');
      if (trigger) {
        trigger.click();
        await sleep(60);
        input = root.querySelector(inputSelector);
      }
    }
    if (!input) return false;

    const baseCount = countComposerAttachments(root);
    const dataTransfer = new DataTransfer();
    for (const attachment of attachments) {
      const file = await attachmentToFile(attachment);
      if (file) dataTransfer.items.add(file);
    }
    if (dataTransfer.items.length === 0) return true;

    try {
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await waitForAttachmentsReady(root, baseCount, dataTransfer.items.length);
      await sleep(120);
      return true;
    } catch (error) {
      return false;
    }
  }

  function refreshControls(generatingOverride) {
    const generating = typeof generatingOverride === 'boolean' ? generatingOverride : isGenerating();
    const canManualSend = !STATE.running && !STATE.busy && !generating;
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
    btnNext.disabled = STATE.busy || STATE.queue.length === 0 || generating;
    btnClear.disabled = STATE.queue.length === 0;
    if (btnNewAdd) {
      const value = newInput ? newInput.value.trim() : '';
      const hasMedia = composerAttachments.length > 0;
      btnNewAdd.disabled = STATE.busy || (!value && !hasMedia);
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
    list.querySelectorAll('button[data-action="send"]').forEach((button) => {
      button.disabled = !canManualSend;
    });
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

  function insertTextAtCursor(textarea, text) {
    if (!textarea || typeof text !== 'string' || text.length === 0) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const nextValue = `${before}${text}${after}`;
    const cursor = before.length + text.length;
    textarea.value = nextValue;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  let controlRefreshPending = false;
  function scheduleControlRefresh() {
    if (controlRefreshPending) return;
    controlRefreshPending = true;
    requestAnimationFrame(() => {
      controlRefreshPending = false;
      refreshControls();
    });
  }

  function populateModelSelect(select, selectedId, selectedLabel) {
    if (!select) return;
    const models = STATE.models;
    const normalizedSelected = normalizeModelId(selectedId);
    select.textContent = '';
    if (!models.length) {
      const option = document.createElement('option');
      option.value = selectedId || '';
      option.textContent = selectedLabel || selectedId || 'Loading models…';
      select.appendChild(option);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.label || model.id;
      if (model.selected) option.dataset.selected = 'true';
      select.appendChild(option);
    });
    if (normalizedSelected) {
      const match = models.find((model) => normalizeModelId(model.id) === normalizedSelected);
      if (match) {
        select.value = match.id;
      } else if (selectedId) {
        const fallback = document.createElement('option');
        fallback.value = selectedId;
        fallback.textContent = selectedLabel || labelForModel(selectedId, selectedLabel || selectedId);
        fallback.dataset.cqMissing = 'true';
        select.appendChild(fallback);
        select.value = selectedId;
      }
    }
    if (!select.value) {
      const preferred = models.find((model) => model.selected) || models[0];
      select.value = preferred?.id || '';
    }
  }

  function renderComposerModelSelect() {
    if (!newModelSelect) return;
    populateModelSelect(newModelSelect, composerModelId, composerModelLabel);
    if (newModelSelect.selectedOptions.length > 0) {
      composerModelId = newModelSelect.value || null;
      composerModelLabel = newModelSelect.selectedOptions[0].textContent || composerModelLabel;
    } else {
      composerModelId = null;
      composerModelLabel = '';
    }
  }

  function renderComposerAttachments() {
    if (!newMedia) return;
    newMedia.textContent = '';
    if (!composerAttachments.length) {
      newMedia.classList.add('cq-media-list--empty');
      return;
    }
    newMedia.classList.remove('cq-media-list--empty');
    composerAttachments.forEach((attachment) => {
      const node = createAttachmentNode(attachment, { context: 'composer' });
      newMedia.appendChild(node);
    });
  }

  function addComposerAttachments(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    const seen = new Set(composerAttachments.map((att) => att.id));
    attachments.forEach((attachment) => {
      if (!seen.has(attachment.id)) {
        composerAttachments.push(cloneAttachment(attachment));
        seen.add(attachment.id);
      }
    });
    renderComposerAttachments();
    refreshControls();
  }

  function removeComposerAttachment(id) {
    const next = composerAttachments.filter((attachment) => attachment.id !== id);
    if (next.length !== composerAttachments.length) {
      composerAttachments = next;
      renderComposerAttachments();
      refreshControls();
    }
  }

  function addAttachmentsToEntry(index, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    const entry = STATE.queue[index];
    if (!entry) return;
    if (!Array.isArray(entry.attachments)) entry.attachments = [];
    const seen = new Set(entry.attachments.map((att) => att.id));
    attachments.forEach((attachment) => {
      if (!seen.has(attachment.id)) {
        entry.attachments.push(cloneAttachment(attachment));
        seen.add(attachment.id);
      }
    });
    save();
    refreshAll();
  }

  function removeEntryAttachment(index, id) {
    const entry = STATE.queue[index];
    if (!entry || !Array.isArray(entry.attachments)) return;
    const next = entry.attachments.filter((attachment) => attachment.id !== id);
    if (next.length !== entry.attachments.length) {
      entry.attachments = next;
      save();
      refreshAll();
    }
  }

  function createAttachmentNode(attachment, { context, entryIndex } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cq-media';
    wrapper.dataset.attachmentId = attachment.id;
    if (typeof entryIndex === 'number') wrapper.dataset.entryIndex = String(entryIndex);

    const thumb = document.createElement('img');
    thumb.className = 'cq-media__thumb';
    thumb.src = attachment.dataUrl;
    thumb.alt = attachment.name || 'Image attachment';
    thumb.loading = 'lazy';
    wrapper.appendChild(thumb);

    const meta = document.createElement('div');
    meta.className = 'cq-media__meta';
    meta.textContent = attachment.name || 'Image';
    meta.title = attachment.name || '';
    wrapper.appendChild(meta);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cq-media__remove';
    remove.dataset.attachmentRemove = attachment.id;
    if (typeof entryIndex === 'number') {
      remove.dataset.entryIndex = String(entryIndex);
    } else {
      remove.dataset.entryIndex = context || 'composer';
    }
    remove.textContent = 'Remove';
    wrapper.appendChild(remove);

    return wrapper;
  }

  function handleAttachmentPaste(event, { type, index, textarea }) {
    const dataTransfer = event.clipboardData;
    if (!hasImagesInDataTransfer(dataTransfer)) return;
    event.preventDefault();
    const plain = dataTransfer?.getData?.('text/plain') || '';
    if (plain && textarea) {
      insertTextAtCursor(textarea, plain);
    }
    collectImagesFromDataTransfer(dataTransfer).then((attachments) => {
      if (!attachments.length) return;
      if (type === 'composer') {
        addComposerAttachments(attachments);
      } else if (type === 'entry' && typeof index === 'number') {
        addAttachmentsToEntry(index, attachments);
      }
    }).catch(() => {});
  }

  function makeAction(label, action, index, disabled = false, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cq-mini';
    button.dataset.action = action;
    button.dataset.index = String(index);
    button.textContent = label;
    if (disabled) button.disabled = true;
    if (extraClass) button.classList.add(extraClass);
    return button;
  }

  function renderQueue(generatingOverride) {
    const generating = typeof generatingOverride === 'boolean' ? generatingOverride : isGenerating();
    const canManualSend = !STATE.running && !STATE.busy && !generating;
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
      item.draggable = true;

      const header = document.createElement('div');
      header.className = 'cq-item-header';

      const badge = document.createElement('span');
      badge.className = 'cq-item-index';
      badge.textContent = String(index + 1);
      header.appendChild(badge);

      const actions = document.createElement('div');
      actions.className = 'cq-item-actions';
      actions.append(
        makeAction('Send', 'send', index, !canManualSend, 'cq-mini--accent'),
        makeAction('Up', 'up', index, index === 0),
        makeAction('Down', 'down', index, index === STATE.queue.length - 1),
        makeAction('Delete', 'delete', index)
      );
      header.appendChild(actions);
      item.appendChild(header);

      const metaRow = document.createElement('div');
      metaRow.className = 'cq-item-meta';

      const modelField = document.createElement('label');
      modelField.className = 'cq-field';
      modelField.setAttribute('for', `cq-item-model-${index}`);

      const modelLabel = document.createElement('span');
      modelLabel.className = 'cq-field__label';
      modelLabel.textContent = 'Model';
      modelField.appendChild(modelLabel);

      const modelSelect = document.createElement('select');
      modelSelect.className = 'cq-select';
      modelSelect.id = `cq-item-model-${index}`;
      modelSelect.dataset.index = String(index);
      populateModelSelect(modelSelect, entry.model, entry.modelLabel);
      modelSelect.addEventListener('focus', () => { ensureModelOptions(); });
      modelSelect.addEventListener('click', () => { ensureModelOptions(); });
      modelSelect.addEventListener('change', () => {
        const value = modelSelect.value || '';
        const label = modelSelect.selectedOptions[0]?.textContent || '';
        STATE.queue[index].model = value || null;
        STATE.queue[index].modelLabel = value ? label : null;
        save();
      });
      modelField.appendChild(modelSelect);
      metaRow.appendChild(modelField);
      item.appendChild(metaRow);

      if (entry.attachments.length) {
        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'cq-media-list';
        mediaWrap.dataset.entryIndex = String(index);
        entry.attachments.forEach((attachment) => {
          const mediaNode = createAttachmentNode(attachment, { entryIndex: index });
          mediaWrap.appendChild(mediaNode);
        });
        item.appendChild(mediaWrap);
      }

      const textarea = document.createElement('textarea');
      textarea.className = 'cq-item-text';
      textarea.value = entry.text;
      textarea.spellcheck = true;
      textarea.draggable = false;
      autoSize(textarea);
      textarea.addEventListener('input', () => {
        STATE.queue[index].text = textarea.value;
        autoSize(textarea);
        scheduleSave();
      });
      textarea.addEventListener('blur', () => save());
      textarea.addEventListener('paste', (event) => {
        handleAttachmentPaste(event, { type: 'entry', index, textarea });
      });

      item.appendChild(textarea);
      list.appendChild(item);
    });
  }

  function refreshAll() {
    const generating = isGenerating();
    refreshControls(generating);
    renderQueue(generating);
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

  async function sendFromQueue(index) {
    if (STATE.busy) return false;
    if (STATE.queue.length === 0) return false;
    if (STATE.running && index !== 0) return false;
    if (isGenerating()) {
      refreshControls(true);
      return false;
    }
    const root = composer();
    if (!root) return false;

    const entry = STATE.queue[index];
    if (!entry) return false;
    const promptText = typeof entry.text === 'string' ? entry.text : '';
    const attachments = Array.isArray(entry.attachments) ? entry.attachments.slice() : [];
    const desiredModel = entry.model || null;

    const [removed] = STATE.queue.splice(index, 1);
    STATE.busy = true;
    STATE.phase = 'sending';
    save();
    refreshAll();

    if (desiredModel) {
      const modelApplied = await ensureModel(desiredModel);
      if (!modelApplied) {
        STATE.busy = false;
        STATE.phase = 'idle';
        STATE.queue.splice(index, 0, removed);
        refreshAll();
        save();
        return false;
      }
    }

    const textSet = await setPrompt(promptText);
    if (!textSet) {
      STATE.busy = false;
      STATE.phase = 'idle';
      STATE.queue.splice(index, 0, removed);
      refreshAll();
      save();
      return false;
    }

    const attachmentsApplied = await applyAttachments(attachments);
    if (!attachmentsApplied) {
      STATE.busy = false;
      STATE.phase = 'idle';
      STATE.queue.splice(index, 0, removed);
      refreshAll();
      save();
      return false;
    }

    clickSend();
    STATE.phase = 'waiting';
    refreshControls(true);
    await waitUntilIdle();

    STATE.busy = false;
    STATE.phase = 'idle';
    refreshControls();
    save();
    if (STATE.running) maybeKick();
    return true;
  }

  async function sendNext() {
    if (STATE.queue.length === 0) return;
    await sendFromQueue(0);
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

  function clearDragIndicator() {
    if (dragOverItem) {
      dragOverItem.classList.remove('cq-drop-before', 'cq-drop-after');
    }
    dragOverItem = null;
    dragOverPosition = null;
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
    const modelId = currentModelId || composerModelId || null;
    const modelLabel = modelId ? labelForModel(modelId, currentModelLabel || composerModelLabel) : null;
    STATE.queue.push({ text, attachments: [], model: modelId, modelLabel });
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
    const normalized = (text || '').replace(/\r\n/g, '\n');
    if (!normalized.trim() && composerAttachments.length === 0) return;
    const composerSelectedOption = newModelSelect?.selectedOptions?.[0];
    let selectedModelId = newModelSelect?.value || composerModelId || null;
    if (!selectedModelId) {
      const preferred = STATE.models.find((model) => model.selected) || STATE.models[0];
      selectedModelId = preferred?.id || currentModelId || null;
    }
    const selectedModelLabel = selectedModelId
      ? (composerSelectedOption?.textContent || composerModelLabel || currentModelLabel || labelForModel(selectedModelId))
      : null;
    const entry = {
      text: normalized,
      attachments: composerAttachments.map((attachment) => cloneAttachment(attachment)),
      model: selectedModelId,
      modelLabel: selectedModelLabel
    };
    STATE.queue.push(entry);
    newInput.value = '';
    autoSize(newInput);
    composerAttachments = [];
    renderComposerAttachments();
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
    newInput.addEventListener('paste', (event) => {
      handleAttachmentPaste(event, { type: 'composer', textarea: newInput });
    });
    newInput.addEventListener('keydown', (event) => {
      const meta = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey;
      if (meta && event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        queueNewInput();
      }
    });
  }

  if (newModelSelect) {
    newModelSelect.addEventListener('focus', () => { ensureModelOptions(); });
    newModelSelect.addEventListener('click', () => { ensureModelOptions(); });
    newModelSelect.addEventListener('change', () => {
      composerModelId = newModelSelect.value || null;
      composerModelLabel = newModelSelect.selectedOptions[0]?.textContent || '';
    });
  }

  if (btnNewAdd) {
    btnNewAdd.addEventListener('click', () => {
      queueNewInput();
    });
  }

  if (newMedia) {
    newMedia.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest('button[data-attachment-remove]') : null;
      if (!target) return;
      const id = target.dataset.attachmentRemove;
      if (!id) return;
      removeComposerAttachment(id);
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
    const attachmentBtn = target.closest('button[data-attachment-remove]');
    if (attachmentBtn) {
      const id = attachmentBtn.dataset.attachmentRemove;
      const entryAttr = attachmentBtn.dataset.entryIndex;
      if (id && entryAttr) {
        const index = Number(entryAttr);
        if (Number.isInteger(index)) {
          removeEntryAttachment(index, id);
        }
      }
      return;
    }
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
    } else if (action === 'send') {
      sendFromQueue(index);
    }
  });

  list.addEventListener('dragstart', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('.cq-item') : null;
    if (!target) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index)) return;
    dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      try { event.dataTransfer.setDragImage(target, 20, 20); } catch (_) { /* noop */ }
    }
    target.classList.add('cq-item-dragging');
  });

  list.addEventListener('dragend', () => {
    list.querySelector('.cq-item-dragging')?.classList.remove('cq-item-dragging');
    dragIndex = null;
    clearDragIndicator();
  });

  list.addEventListener('dragover', (event) => {
    if (dragIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const item = event.target instanceof HTMLElement ? event.target.closest('.cq-item') : null;
    if (!item) {
      clearDragIndicator();
      return;
    }
    const overIndex = Number(item.dataset.index);
    if (!Number.isInteger(overIndex)) return;
    if (overIndex === dragIndex) {
      clearDragIndicator();
      return;
    }
    const rect = item.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = event.clientY < midpoint ? 'before' : 'after';
    if (item !== dragOverItem || position !== dragOverPosition) {
      clearDragIndicator();
      dragOverItem = item;
      dragOverPosition = position;
      item.classList.add(position === 'before' ? 'cq-drop-before' : 'cq-drop-after');
    }
  });

  list.addEventListener('dragleave', (event) => {
    const item = event.target instanceof HTMLElement ? event.target.closest('.cq-item') : null;
    if (item && item === dragOverItem) clearDragIndicator();
  });

  list.addEventListener('drop', (event) => {
    if (dragIndex === null) return;
    event.preventDefault();
    let newIndex = dragIndex;
    const item = event.target instanceof HTMLElement ? event.target.closest('.cq-item') : null;
    if (item) {
      const overIndex = Number(item.dataset.index);
      if (Number.isInteger(overIndex)) {
        const rect = item.getBoundingClientRect();
        const after = event.clientY >= rect.top + rect.height / 2;
        newIndex = overIndex + (after ? 1 : 0);
      }
    } else {
      newIndex = STATE.queue.length;
    }
    clearDragIndicator();
    const length = STATE.queue.length;
    if (newIndex > length) newIndex = length;
    if (newIndex > dragIndex) newIndex -= 1;
    moveItem(dragIndex, newIndex);
    dragIndex = null;
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
  const rootObserver = new MutationObserver(() => {
    if (STATE.running) maybeKick();
    scheduleControlRefresh();
  });
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
  load().then(() => ensureModelOptions()).catch(() => {});
})();
