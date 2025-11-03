(() => {
  const STATE = {
    running: false,
    queue: [],
    busy: false,
    cooldownMs: 900,
    collapsed: false,
    phase: 'idle',
    models: [],
    followupMode: 'queue'
  };
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

  const ATTACHMENT_REMOVE_SELECTORS = [
    'button[data-testid="attachment-item-remove"]',
    'button[data-testid="composer-upload-item-remove"]',
    'button[aria-label^="Remove"]',
    'button[aria-label^="Delete"]'
  ];

  const gatherComposerAttachments = async (root) => {
    if (!root) return [];
    const attachments = [];
    const inputs = Array.from(root.querySelectorAll('input[type="file"]')).filter(
      (input) => input instanceof HTMLInputElement
    );
    for (const input of inputs) {
      const files = Array.from(input.files || []);
      for (const file of files) {
        if (!(file instanceof File)) continue;
        try {
          const attachment = await createAttachmentFromFile(file);
          if (attachment) attachments.push(attachment);
        } catch (_) {
          /* noop */
        }
      }
    }
    const blobImages = Array.from(root.querySelectorAll('img[src^="blob:"]'));
    if (blobImages.length && attachments.length >= blobImages.length) {
      return attachments;
    }
    const seenDataUrls = new Set(attachments.map((attachment) => attachment.dataUrl));
    for (const img of blobImages) {
      const src = img.getAttribute('src');
      if (!src) continue;
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const mime = blob.type || 'image/png';
        const extension = mime.split('/')[1] || 'png';
        const file = new File([blob], `image-${makeId()}.${extension}`, { type: mime });
        const attachment = await createAttachmentFromFile(file);
        if (attachment && !seenDataUrls.has(attachment.dataUrl)) {
          attachments.push(attachment);
          seenDataUrls.add(attachment.dataUrl);
        }
      } catch (_) {
        /* noop */
      }
    }
    return attachments;
  };

  const clearComposerAttachments = (root) => {
    if (!root) return;
    const removeQuery = ATTACHMENT_REMOVE_SELECTORS.join(',');
    ATTACHMENT_SELECTORS.forEach((selector) => {
      root.querySelectorAll(selector).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const removeButton = removeQuery ? node.querySelector(removeQuery) : null;
        if (removeButton instanceof HTMLElement) {
          removeButton.click();
        }
      });
    });
    root.querySelectorAll('input[type="file"]').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.value) return;
      try {
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {
        /* noop */
      }
    });
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
  let composerQueueButton = null;

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
    currentModelId = id || null;
    if (!id) {
      currentModelLabel = label || '';
      return;
    }
    const info = getModelById(id);
    currentModelLabel = label || info?.label || currentModelLabel || id;
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
    const candidates = menu.querySelectorAll('[role="menuitem"][data-testid]');
    candidates.forEach((item) => {
      if (!(item instanceof HTMLElement)) return;
      if (seen.has(item)) return;
      seen.add(item);
      const testId = item.getAttribute('data-testid') || '';
      if (!testId.startsWith('model-switcher-')) return;
      const id = testId.replace(/^model-switcher-/, '');
      if (!id || id.endsWith('-submenu')) return;
      const disabled = item.getAttribute('aria-disabled') === 'true' || item.matches('[data-disabled="true"]');
      if (disabled) return;
      const label = getModelNodeLabel(item) || id;
      const hasCheckIcon = !!item.querySelector('.trailing svg, [data-testid="check-icon"], svg[aria-hidden="false"]');
      const selected =
        item.getAttribute('data-state') === 'checked' ||
        item.getAttribute('aria-checked') === 'true' ||
        item.getAttribute('aria-pressed') === 'true' ||
        hasCheckIcon;
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
    if (!options.force && STATE.models.length) return STATE.models;
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
    const direct = menu.querySelector(`[role="menuitem"][data-testid="model-switcher-${escapeCss(modelId)}"]`);
    if (direct) return direct;
    const normalized = normalizeModelId(modelId);
    const candidates = Array.from(menu.querySelectorAll('[role="menuitem"][data-testid^="model-switcher-"]'));
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
    <div class="cq-inline-header">
      <div class="cq-inline-meta">
        <span class="cq-label">Follow-ups</span>
        <span id="cq-count" class="cq-count" aria-live="polite">0</span>
        <span id="cq-state" class="cq-state" aria-live="polite">Idle</span>
      </div>
      <div class="cq-inline-actions">
        <button id="cq-followups-trigger" class="cq-icon-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="cq-followups-menu" aria-label="When to send follow-ups">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true" focusable="false">
            <circle cx="4" cy="9" r="1.5"></circle>
            <circle cx="9" cy="9" r="1.5"></circle>
            <circle cx="14" cy="9" r="1.5"></circle>
          </svg>
        </button>
        <div id="cq-followups-menu" class="cq-popover" role="menu" aria-label="When to send follow-ups" tabindex="-1" hidden>
          <div class="cq-popover-title">When to send follow-ups</div>
          <button type="button" role="menuitemradio" class="cq-popover-option" data-mode="queue" aria-checked="true">Queue</button>
          <button type="button" role="menuitemradio" class="cq-popover-option" data-mode="immediate" aria-checked="false">Send immediately</button>
          <button type="button" role="menuitemradio" class="cq-popover-option" data-mode="stop" aria-checked="false">Stop and send right away</button>
        </div>
      </div>
    <div id="cq-list" class="cq-queue" aria-label="Queued prompts"></div>`;

  const $ = (selector) => ui.querySelector(selector);
  const elCount = $('#cq-count');
  const elState = $('#cq-state');
  const list = $('#cq-list');
  const followupsTrigger = $('#cq-followups-trigger');
  const followupsMenu = $('#cq-followups-menu');
  ui.setAttribute('aria-hidden', 'true');

  let saveTimer;
  let hydrated = false; // gate UI visibility until persisted state is loaded
  let dragIndex = null;
  let dragOverItem = null;
  let dragOverPosition = null;
  let followupsMenuOpen = false;

  // Persist ------------------------------------------------------------------
  const persistable = () => ({
    running: STATE.running,
    queue: STATE.queue.map((entry) => cloneEntry(entry)),
    collapsed: false,
    followupMode: STATE.followupMode
  });

  const isContextInvalidatedError = (error) => {
    const message = typeof error === 'string' ? error : error?.message;
    return typeof message === 'string' && message.includes('Extension context invalidated');
  };

  const save = () => {
    if (!chrome.storage?.local?.set) return;
    try {
      chrome.storage.local.set({ cq: persistable() }, () => {
        const error = chrome.runtime?.lastError;
        if (error && !isContextInvalidatedError(error)) {
          console.error('cq: failed to persist state', error);
        }
      });
    } catch (error) {
      if (isContextInvalidatedError(error)) return;
      console.error('cq: failed to persist state', error);
    }
  };
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
        const storedMode = typeof cq.followupMode === 'string' ? cq.followupMode : 'queue';
        STATE.followupMode = storedMode === 'immediate' ? 'immediate' : 'queue';
        STATE.running = STATE.followupMode === 'immediate' && cq.running !== false;
      }
      refreshAll();
      hydrated = true;
      refreshVisibility();
      if (STATE.running) maybeKick();
      resolve();
    };

    if (chrome.storage?.local?.get) {
      try {
        chrome.storage.local.get(['cq'], ({ cq }) => {
          const error = chrome.runtime?.lastError;
          if (error) {
            if (!isContextInvalidatedError(error)) {
              console.error('cq: failed to load persisted state', error);
            }
            applyState(null);
            return;
          }
          applyState(cq);
        });
      } catch (error) {
        if (isContextInvalidatedError(error)) {
          applyState(null);
        } else {
          console.error('cq: failed to load persisted state', error);
          applyState(null);
        }
      }
    } else {
      applyState(null);
    }
  });

  // DOM helpers ---------------------------------------------------------------
  const q = (selector, root = document) => {
    if (!root || typeof root.querySelector !== 'function') return null;
    try {
      return root.querySelector(selector);
    } catch (_) {
      return null;
    }
  };
  const isVisible = (node) => node instanceof HTMLElement && node.offsetParent !== null;
  const findSendButton = (root) => {
    if (!root) return null;
    const candidates = root.querySelectorAll(SEL.send);
    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement && isVisible(candidate)) return candidate;
    }
    const fallback = candidates[0];
    return fallback instanceof HTMLElement ? fallback : null;
  };
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
    if (elCount) {
      elCount.textContent = String(STATE.queue.length);
    }
    if (elState) {
      let status = 'Idle';
      if (STATE.busy) {
        status = STATE.phase === 'waiting' ? 'Waiting…' : 'Sending…';
      } else if (STATE.running) {
        status = 'Auto-send';
      }
      elState.textContent = status;
    }
    if (!composerQueueButton || !composerQueueButton.isConnected) {
      composerQueueButton = null;
      ensureComposerQueueButton();
    }
    if (composerQueueButton) {
      composerQueueButton.disabled = STATE.busy || generating || !hasComposerPrompt();
    }
    ui.classList.toggle('is-running', STATE.running);
    ui.classList.toggle('is-busy', STATE.busy);
    updateFollowupMenu();
    list.querySelectorAll('button[data-action="send"]').forEach((button) => {
      button.disabled = !canManualSend;
    });
  }

  function refreshVisibility() {
    ensureMounted();
    if (!hydrated) {
      ui.style.display = 'none';
      ui.setAttribute('aria-hidden', 'true');
      return;
    }
    const collapsed = STATE.collapsed;
    ui.style.display = collapsed ? 'none' : 'flex';
    ui.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
  }

  function setCollapsed(_collapsed, persist = true) {
    // Inline mode stays visible; keep storage compatibility by ignoring collapse.
    STATE.collapsed = false;
    refreshVisibility();
    refreshControls();
    setFollowupsMenuOpen(false);
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

  function ensureMounted() {
    const root = composer();
    if (!root) return;
    ensureComposerQueueButton(root);
    ensureComposerInputListeners(root);
    let container = root.closest('#thread-bottom-container');
    if (!container) {
      // walk up until we hit something that looks like the prompt container
      let current = root.parentElement;
      while (current && current !== document.body && current !== document.documentElement && !current.matches('#thread-bottom-container')) {
        current = current.parentElement;
      }
      if (current && current.matches('#thread-bottom-container')) {
        container = current;
      }
    }
    if (!container && root.parentElement) {
      container = root.parentElement;
    }
    if ((container === document.body || container === document.documentElement) && root.parentElement && root.parentElement !== container) {
      container = root.parentElement;
    }
    if (!container) {
      container = document.body;
    }
    let anchor = container.querySelector('#thread-bottom');
    if (!anchor) {
      anchor = root;
      while (anchor && anchor.parentElement && anchor.parentElement !== container) {
        anchor = anchor.parentElement;
      }
    }
    if (!anchor || !container.contains(anchor) || anchor.parentElement !== container) {
      if (ui.parentElement !== container) {
        try {
          container.appendChild(ui);
        } catch (_) {
          /* noop */
        }
      }
      return;
    }
    if (ui.parentElement !== container || ui.nextElementSibling !== anchor) {
      try {
        container.insertBefore(ui, anchor);
      } catch (_) {
        try {
          container.appendChild(ui);
        } catch (_) {
          /* noop */
        }
      }
    }
  }

  function deriveQueueButtonClasses(sendButton) {
    if (!(sendButton instanceof HTMLElement)) return 'btn relative btn-secondary cq-composer-queue-btn';
    const tokens = new Set((sendButton.className || '').split(/\s+/).filter(Boolean));
    const hadBtn = tokens.has('btn');
    const hadRelative = tokens.has('relative');
    if (tokens.has('btn-primary')) {
      tokens.delete('btn-primary');
      tokens.add('btn-secondary');
    } else if (tokens.has('btn') && !tokens.has('btn-secondary')) {
      tokens.add('btn-secondary');
    }
    if (!hadBtn) tokens.add('btn');
    if (hadRelative) tokens.add('relative');
    tokens.add('btn-secondary');
    tokens.add('cq-composer-queue-btn');
    return Array.from(tokens).join(' ');
  }

  function ensureComposerQueueButton(rootParam) {
    const root = rootParam || composer();
    if (!root) return;
    const sendButton = findSendButton(root);
    if (!sendButton) return;
    const parent = sendButton.parentElement;
    if (!parent) return;
    let button = composerQueueButton;
    if (button && !button.isConnected) {
      button = null;
      composerQueueButton = null;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'cq-composer-queue-btn';
      button.setAttribute('aria-label', 'Add prompt to follow-up queue');
      button.textContent = 'Add to queue';
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const added = await queueComposerInput();
        if (!added) {
          const editor = findEditor();
          editor?.focus?.({ preventScroll: true });
        }
        scheduleControlRefresh();
      });
    }
    button.className = deriveQueueButtonClasses(sendButton);
    if (button.parentElement !== parent) {
      try {
        parent.insertBefore(button, sendButton);
      } catch (_) {
        try {
          parent.appendChild(button);
        } catch (_) {
          return;
        }
      }
    }
    composerQueueButton = button;
  }

  function ensureComposerInputListeners(rootParam) {
    const root = rootParam || composer();
    if (!root) return;
    const ed = findEditor();
    if (!ed || ed.dataset.cqQueueBound === 'true') return;
    const notify = () => scheduleControlRefresh();
    ['input', 'keyup', 'paste', 'cut', 'compositionend'].forEach((eventName) => {
      ed.addEventListener(eventName, notify);
    });
    ed.dataset.cqQueueBound = 'true';
  }

  function updateFollowupMenu() {
    if (!followupsMenu) return;
    const active = STATE.followupMode === 'immediate' ? 'immediate' : 'queue';
    followupsMenu.querySelectorAll('[data-mode]').forEach((option) => {
      const mode = option.dataset.mode || '';
      const selected = mode === active;
      option.setAttribute('aria-checked', selected ? 'true' : 'false');
      option.classList.toggle('is-selected', selected);
    });
  }

  function setFollowupsMenuOpen(open) {
    if (!followupsMenu || !followupsTrigger) return;
    followupsMenuOpen = open;
    followupsMenu.hidden = !open;
    followupsTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      followupsMenu.focus();
    }
  }

  function setFollowupMode(mode, persist = true) {
    const normalized = mode === 'immediate' ? 'immediate' : mode === 'stop' ? 'stop' : 'queue';
    if (normalized === 'stop') {
      STATE.running = false;
      STATE.followupMode = 'queue';
      if (!STATE.busy) STATE.phase = 'idle';
      updateFollowupMenu();
      if (persist) save();
      refreshControls();
      if (STATE.queue.length > 0) {
        sendNext();
      }
      return;
    }
    STATE.followupMode = normalized;
    STATE.running = normalized === 'immediate';
    if (!STATE.running && !STATE.busy) {
      STATE.phase = 'idle';
    }
    updateFollowupMenu();
    refreshControls();
    if (persist) save();
    if (STATE.running) maybeKick();
  }

  if (followupsTrigger) {
    followupsTrigger.addEventListener('click', (event) => {
      event.preventDefault();
      ensureMounted();
      setFollowupsMenuOpen(!followupsMenuOpen);
    });
  }

  if (followupsMenu) {
    followupsMenu.addEventListener('click', (event) => {
      const option = event.target instanceof HTMLElement ? event.target.closest('[data-mode]') : null;
      if (!option) return;
      const mode = option.dataset.mode || 'queue';
      setFollowupMode(mode);
      setFollowupsMenuOpen(false);
    });
  }

  document.addEventListener('click', (event) => {
    if (!followupsMenuOpen) return;
    if (event.target instanceof Node) {
      if (followupsMenu?.contains(event.target) || followupsTrigger?.contains(event.target)) return;
    }
    setFollowupsMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (!followupsMenuOpen) return;
    if (event.key === 'Escape') {
      setFollowupsMenuOpen(false);
      followupsTrigger?.focus();
    }
  });

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

  function createAttachmentNode(attachment, { entryIndex } = {}) {
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
      if (type === 'entry' && typeof index === 'number') {
        addAttachmentsToEntry(index, attachments);
      }
    }).catch(() => {});
  }

  function renderQueue(generatingOverride) {
    const generating = typeof generatingOverride === 'boolean' ? generatingOverride : isGenerating();
    const canManualSend = !STATE.running && !STATE.busy && !generating;
    list.textContent = '';
    if (STATE.queue.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cq-empty';
      empty.textContent = 'No follow-ups queued.';
      list.appendChild(empty);
      return;
    }

    STATE.queue.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'cq-row';
      row.dataset.index = String(index);
      if (index === 0) row.classList.add('cq-row--next');
      row.draggable = true;

      const indicator = document.createElement('span');
      indicator.className = 'cq-row-indicator';
      indicator.textContent = String(index + 1);
      row.appendChild(indicator);

      const body = document.createElement('div');
      body.className = 'cq-row-body';

      const textarea = document.createElement('textarea');
      textarea.className = 'cq-row-text';
      textarea.value = entry.text;
      textarea.placeholder = 'Empty follow-up';
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
      body.appendChild(textarea);

      if (entry.attachments.length) {
        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'cq-row-media';
        mediaWrap.dataset.entryIndex = String(index);
        entry.attachments.forEach((attachment) => {
          const mediaNode = createAttachmentNode(attachment, { entryIndex: index });
          mediaWrap.appendChild(mediaNode);
        });
        body.appendChild(mediaWrap);
      }

      row.appendChild(body);

      const actions = document.createElement('div');
      actions.className = 'cq-row-actions';

      const sendButton = document.createElement('button');
      sendButton.type = 'button';
      sendButton.className = 'cq-icon-btn cq-icon-btn--send';
      sendButton.dataset.action = 'send';
      sendButton.dataset.index = String(index);
      sendButton.setAttribute('aria-label', 'Send now');
      sendButton.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
          <path d="M4.25 3.5L16.5 9.75L4.25 16.5L4.25 11L11 9.75L4.25 8.5L4.25 3.5Z" fill="currentColor"></path>
        </svg>`;
      if (!canManualSend) sendButton.disabled = true;
      actions.appendChild(sendButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'cq-icon-btn cq-icon-btn--delete';
      deleteButton.dataset.action = 'delete';
      deleteButton.dataset.index = String(index);
      deleteButton.setAttribute('aria-label', 'Remove follow-up');
      deleteButton.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
          <path d="M6 6L6.8 16.2C6.87394 17.1321 7.64701 17.846 8.58083 17.846H11.4192C12.353 17.846 13.1261 17.1321 13.2 16.2L14 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
          <path d="M4 6H16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
          <path d="M8 6V4.5C8 3.67157 8.67157 3 9.5 3H10.5C11.3284 3 12 3.67157 12 4.5V6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
        </svg>`;
      actions.appendChild(deleteButton);

      row.appendChild(actions);
      list.appendChild(row);
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
      dragOverItem.classList.remove('cq-row--drop-before', 'cq-row--drop-after');
    }
    dragOverItem = null;
    dragOverPosition = null;
  }

  function getComposerPromptText() {
    const ed = findEditor();
    if (!ed) return '';
    const text = ed.innerText || '';
    return text.replace(/[\u200b\u200c\u200d\uFEFF]/g, '').trim();
  }

  const composerHasAttachments = () => {
    const root = composer();
    return countComposerAttachments(root) > 0;
  };

  function hasComposerPrompt() {
    return getComposerPromptText().length > 0 || composerHasAttachments();
  }

  async function queueComposerInput() {
    const ed = findEditor();
    if (!ed) return false;
    const root = composer();
    if (!root) return false;
    const text = getComposerPromptText();
    const attachmentCount = countComposerAttachments(root);
    const hadAttachments = attachmentCount > 0;
    const attachments = hadAttachments ? await gatherComposerAttachments(root) : [];
    if (!text && attachments.length === 0) return false;
    if (hadAttachments && attachments.length === 0) {
      console.warn('[cq] Unable to capture composer attachments; queue aborted.');
      return false;
    }
    const modelId = currentModelId || null;
    const modelLabel = modelId ? labelForModel(modelId, currentModelLabel) : null;
    STATE.queue.push({ text, attachments: attachments.map((attachment) => cloneAttachment(attachment)), model: modelId, modelLabel });
    if (attachments.length) {
      clearComposerAttachments(root);
    }
    ed.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    save();
    refreshAll();
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    ed.focus?.({ preventScroll: true });
    if (STATE.running) maybeKick();
    scheduleControlRefresh();
    return true;
  }

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
    } else if (action === 'send') {
      sendFromQueue(index);
    }
  });

  list.addEventListener('dragstart', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('.cq-row') : null;
    if (!target) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index)) return;
    dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      try { event.dataTransfer.setDragImage(target, 20, 20); } catch (_) { /* noop */ }
    }
    target.classList.add('cq-row--dragging');
  });

  list.addEventListener('dragend', () => {
    list.querySelector('.cq-row--dragging')?.classList.remove('cq-row--dragging');
    dragIndex = null;
    clearDragIndicator();
  });

  list.addEventListener('dragover', (event) => {
    if (dragIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const item = event.target instanceof HTMLElement ? event.target.closest('.cq-row') : null;
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
      item.classList.add(position === 'before' ? 'cq-row--drop-before' : 'cq-row--drop-after');
    }
  });

  list.addEventListener('dragleave', (event) => {
    const item = event.target instanceof HTMLElement ? event.target.closest('.cq-row') : null;
    if (item && item === dragOverItem) clearDragIndicator();
  });

  list.addEventListener('drop', (event) => {
    if (dragIndex === null) return;
    event.preventDefault();
    let newIndex = dragIndex;
    const item = event.target instanceof HTMLElement ? event.target.closest('.cq-row') : null;
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
      void queueComposerInput();
    }
  }, true);

  // Commands from background --------------------------------------------------
  chrome.runtime?.onMessage.addListener((msg) => {
    if (msg?.type === 'queue-from-shortcut') void queueComposerInput();
    if (msg?.type === 'toggle-queue') {
      setFollowupMode(STATE.running ? 'queue' : 'immediate');
    }
    if (msg?.type === 'toggle-ui') {
      setCollapsed(false);
    }
    if (msg?.type === 'show-ui') {
      setCollapsed(false);
    }
  });

  // Handle SPA changes and rerenders -----------------------------------------
  const rootObserver = new MutationObserver(() => {
    if (STATE.running) maybeKick();
    scheduleControlRefresh();
    ensureMounted();
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

  ensureMounted();
  refreshVisibility();
  load().then(() => ensureModelOptions()).catch(() => {});
})();
