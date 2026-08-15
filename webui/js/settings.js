/* ============================================================
   settings.js — Settings panel: load, render, save
   ============================================================ */
const Settings = (() => {
  'use strict';

  let overlay = null;
  let currentConfig = {};
  let savedCallback = null;

  // DOM refs
  let els = {};

  function init() {
    overlay = document.getElementById('settings-overlay');
    els = {
      assistantName: document.getElementById('cfg-assistant-name'),
      assistantPersonality: document.getElementById('cfg-assistant-personality'),
      userName: document.getElementById('cfg-user-name'),
      userContext: document.getElementById('cfg-user-context'),
      foldersList: document.getElementById('folders-list'),
      newFolderPath: document.getElementById('new-folder-path'),
      newFolderPermission: document.getElementById('new-folder-permission'),
      btnAddFolder: document.getElementById('btn-add-folder'),
      memoriesList: document.getElementById('memories-list'),
      newMemoryText: document.getElementById('new-memory-text'),
      btnAddMemory: document.getElementById('btn-add-memory'),
      petId: document.getElementById('cfg-pet-id'),
      petSize: document.getElementById('cfg-pet-size'),
      petPosition: document.getElementById('cfg-pet-position'),
      agentEnabled: document.getElementById('cfg-agent-enabled'),
      agentName: document.getElementById('cfg-agent-name'),
      btnSave: document.getElementById('btn-save-settings'),
      btnClose: document.getElementById('btn-close-settings'),
    };

    // tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.getAttribute('data-tab')).classList.add('active');
      });
    });

    // close
    els.btnClose.addEventListener('click', hide);

    // add folder
    els.btnAddFolder.addEventListener('click', addFolder);
    // add memory
    els.btnAddMemory.addEventListener('click', addMemory);
    // save
    els.btnSave.addEventListener('click', save);
    // click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });
  }

  function onSaved(cb) { savedCallback = cb; }

  async function load(config) {
    currentConfig = config || {};

    const a = currentConfig.assistant || {};
    const u = currentConfig.user || {};
    const p = currentConfig.pet || {};
    const ag = currentConfig.secondaryAgent || {};

    els.assistantName.value = a.name || '';
    els.assistantPersonality.value = a.personality || '';
    els.userName.value = u.name || '';
    els.userContext.value = u.context || '';

    renderFolders(currentConfig.folders || []);
    renderMemories(currentConfig.memories || []);

    els.petId.innerHTML = '<option value="">Carregando...</option>';
    els.petSize.value = p.size || 120;
    els.petPosition.value = p.position || 'bottom-right';

    els.agentEnabled.checked = !!ag.enabled;
    els.agentName.value = ag.agent || '';

    // load pets into selector
    loadPets(p.id || 'tux');

    // load agents into selector
    loadAgents();
  }

  async function loadPets(current) {
    try {
      const petsList = await API.get('/api/pets');
      const list = Array.isArray(petsList) ? petsList : [];
      if (!list.length) {
        els.petId.innerHTML = '<option value="tux">Tux</option>';
        els.petId.value = current;
        return;
      }
      els.petId.innerHTML = list.map(p => {
        const val = p.id || '';
        const label = p.title || val;
        const selected = val === current ? ' selected' : '';
        return `<option value="${escapeAttr(val)}"${selected}>${escapeHtml(label)}</option>`;
      }).join('');
      if (current && !list.some(p => p.id === current)) {
        els.petId.innerHTML += `<option value="${escapeAttr(current)}" selected>${escapeHtml(current)}</option>`;
      }
    } catch (_) {
      els.petId.innerHTML = '<option value="tux">Tux</option>';
      els.petId.value = current;
    }
  }

  async function loadAgents() {
    try {
      const agents = await API.get('/api/agents');
      const list = Array.isArray(agents) ? agents : [];
      els.agentName.innerHTML = '<option value="">Nenhum</option>' +
        list.map(a => `<option value="${escapeAttr(a.name)}">${escapeHtml(a.name)}</option>`).join('');
    } catch (_) {
      // ignore
    }
  }

  function show() {
    overlay.classList.remove('hidden');
  }

  function hide() {
    overlay.classList.add('hidden');
  }

  // --- Folders ---

  function renderFolders(folders) {
    els.foldersList.innerHTML = folders.map((f, i) => `
      <div class="item-row" data-idx="${i}">
        <span class="item-row-text">${escapeHtml(f.path)}</span>
        <select data-field="permission" data-idx="${i}">
          <option value="ask" ${f.permission === 'ask' ? 'selected' : ''}>Perguntar</option>
          <option value="allow" ${f.permission === 'allow' ? 'selected' : ''}>Permitir</option>
          <option value="deny" ${f.permission === 'deny' ? 'selected' : ''}>Negar</option>
        </select>
        <button class="btn-icon" data-remove-folder="${i}" title="Remover">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    // permission change
    els.foldersList.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.getAttribute('data-idx'));
        if (currentConfig.folders && currentConfig.folders[idx]) {
          currentConfig.folders[idx].permission = sel.value;
        }
      });
    });

    // remove
    els.foldersList.querySelectorAll('[data-remove-folder]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove-folder'));
        if (currentConfig.folders) {
          currentConfig.folders.splice(idx, 1);
          renderFolders(currentConfig.folders);
        }
      });
    });
  }

  function addFolder() {
    const path = els.newFolderPath.value.trim();
    if (!path) return;
    const perm = els.newFolderPermission.value;
    if (!currentConfig.folders) currentConfig.folders = [];
    currentConfig.folders.push({ path, permission: perm, enabled: true });
    els.newFolderPath.value = '';
    renderFolders(currentConfig.folders);
  }

  // --- Memories ---

  function renderMemories(memories) {
    els.memoriesList.innerHTML = memories.map((m, i) => `
      <div class="item-row" data-idx="${i}">
        <span class="item-row-text">${escapeHtml(m.text)}</span>
        <button class="btn-icon" data-edit-memory="${i}" title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon" data-remove-memory="${i}" title="Excluir">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    // edit
    els.memoriesList.querySelectorAll('[data-edit-memory]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-edit-memory'));
        if (!currentConfig.memories || !currentConfig.memories[idx]) return;
        const newText = prompt('Editar memória:', currentConfig.memories[idx].text);
        if (newText !== null && newText.trim()) {
          currentConfig.memories[idx].text = newText.trim();
          renderMemories(currentConfig.memories);
        }
      });
    });

    // remove
    els.memoriesList.querySelectorAll('[data-remove-memory]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove-memory'));
        if (currentConfig.memories) {
          currentConfig.memories.splice(idx, 1);
          renderMemories(currentConfig.memories);
        }
      });
    });
  }

  function addMemory() {
    const text = els.newMemoryText.value.trim();
    if (!text) return;
    if (!currentConfig.memories) currentConfig.memories = [];
    currentConfig.memories.push({
      id: 'm' + Date.now(),
      text,
      created: Date.now(),
    });
    els.newMemoryText.value = '';
    renderMemories(currentConfig.memories);
  }

  // --- Save ---

  async function save() {
    const config = {
      assistant: {
        name: els.assistantName.value.trim() || 'Tux',
        personality: els.assistantPersonality.value.trim(),
      },
      user: {
        name: els.userName.value.trim(),
        context: els.userContext.value.trim(),
      },
      folders: currentConfig.folders || [],
      memories: currentConfig.memories || [],
      pet: {
        id: els.petId.value,
        size: parseInt(els.petSize.value) || 120,
        position: els.petPosition.value,
      },
      secondaryAgent: {
        enabled: els.agentEnabled.checked,
        agent: els.agentName.value,
      },
    };

    try {
      await API.post('/api/config', config);
      currentConfig = config;
      App.toast('Configurações salvas!', 'success');
      hide();
      if (savedCallback) savedCallback(config);
    } catch (err) {
      App.toast('Erro ao salvar: ' + (err.message || 'desconhecido'), 'error');
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g, '&quot;');
  }

  return { init, load, show, hide, onSaved };
})();

/* ============================================================
   Permissions — show/hide permission overlay
   ============================================================ */
const Permissions = (() => {
  'use strict';

  let overlay, descEl, messageEl, currentEvent;

  function init() {
    overlay = document.getElementById('permission-overlay');
    descEl = document.getElementById('permission-description');
    messageEl = document.getElementById('permission-message');

    document.getElementById('perm-allow-once').addEventListener('click', () => reply('once'));
    document.getElementById('perm-allow-always').addEventListener('click', () => reply('always'));
    document.getElementById('perm-reject').addEventListener('click', () => reply('reject'));
  }

  function show(event) {
    currentEvent = event;
    const desc = event.description || event.message || JSON.stringify(event, null, 2);
    descEl.textContent = desc;
    messageEl.value = '';
    overlay.classList.remove('hidden');
  }

  async function reply(answer) {
    if (!currentEvent) return;
    const requestID = currentEvent.requestID || currentEvent.requestId || currentEvent.permissionID || currentEvent.permissionId;
    const sessionID = currentEvent.sessionID || currentEvent.session_id;
    const body = { reply: answer };
    const msg = messageEl.value.trim();
    if (msg) body.message = msg;

    overlay.classList.add('hidden');

    try {
      await API.post(`/api/sessions/${sessionID}/permissions/${requestID}/reply`, body);
    } catch (err) {
      App.toast('Erro ao responder permissão: ' + (err.message || 'desconhecido'), 'error');
    }

    currentEvent = null;
  }

  return { init, show };
})();
