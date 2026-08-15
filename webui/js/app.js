/* ============================================================
   app.js — Main application: init, state, health, SSE, routing
   ============================================================ */
const App = (() => {
  'use strict';

  let config = {};
  let cleanupSSE = null;
  let healthInterval = null;
  let lastHealth = null;

  async function init() {
    // init modules
    Chat.init();
    Sessions.init(document.getElementById('session-list'));
    Sessions.onSelect(sessionSelected);
    Settings.init();
    Settings.onSaved(onConfigSaved);
    Permissions.init();

    // pet
    const petCanvas = document.getElementById('pet-canvas');
    Pet.init(petCanvas, 120);
    Pet.onWaving(() => {
      // POST waving state
      API.post('/api/pet/state', { animation: 'waving' }).catch(() => {});
    });

    // sidebar toggle (mobile)
    document.getElementById('btn-toggle-sidebar').addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // new session
    document.getElementById('btn-new-session').addEventListener('click', createSession);

    // settings button
    document.getElementById('btn-settings').addEventListener('click', () => Settings.show());

    // pet toggle
    document.getElementById('btn-pet-toggle').addEventListener('click', togglePet);

    // load config
    await loadConfig();

    // load models
    await loadModels();

    // start health polling
    startHealthPolling();

    // connect SSE
    connectSSE();

    // start pet
    Pet.start();

    // load pet state
    loadPetState();

    // restore last session
    restoreLastSession();
  }

  // --- Config ---

  async function loadConfig() {
    try {
      config = await API.get('/api/config');
    } catch (_) {
      config = { assistant: { name: 'Tux' }, pet: { id: 'tux', size: 120, position: 'bottom-right' } };
    }

    applyConfig(config);
    Settings.load(config);
  }

  function applyConfig(cfg) {
    const name = (cfg.assistant && cfg.assistant.name) || 'Tux';
    document.getElementById('assistant-name').textContent = name;
    Chat.setAssistantName(name);

    // pet
    const p = cfg.pet || {};
    if (p.size) Pet.setSize(p.size);
    if (p.id) Pet.setPet(p.id);
    applyPetPosition(p.position || 'bottom-right');
  }

  function onConfigSaved(cfg) {
    config = cfg;
    applyConfig(cfg);
  }

  // --- Models ---

  async function loadModels() {
    const sel = document.getElementById('model-selector');
    try {
      const models = await API.get('/api/models');
      const list = Array.isArray(models) ? models : [];
      if (!list.length) {
        sel.innerHTML = '<option value="">Nenhum modelo</option>';
        return;
      }
      const defaultModel = (config.assistant && config.assistant.defaultModel) || '';
      sel.innerHTML = list.map(m => {
        const val = m.id || m.ID || '';
        const label = m.label || m.name || val;
        const selected = val === defaultModel ? ' selected' : '';
        return `<option value="${escapeAttr(val)}"${selected}>${escapeHtml(label)}</option>`;
      }).join('');

      // persist selection
      const saved = tryGet('oc_model');
      if (saved) sel.value = saved;
      sel.addEventListener('change', () => {
        trySet('oc_model', sel.value);
      });
    } catch (_) {
      sel.innerHTML = '<option value="">Offline</option>';
    }
  }

  // --- Sessions ---

  async function loadSessions() {
    try {
      const sessions = await API.get('/api/sessions');
      Sessions.setSessions(Array.isArray(sessions) ? sessions : []);

      // restore active
      const saved = tryGet('oc_active_session');
      if (saved) {
        Sessions.setActive(saved);
        sessionSelected(saved);
      } else if (Array.isArray(sessions) && sessions.length) {
        const first = sessions[0];
        const id = first.id || first.ID;
        Sessions.setActive(id);
        sessionSelected(id);
      }
    } catch (_) {
      Sessions.setSessions([]);
    }
  }

  async function createSession() {
    try {
      const result = await API.post('/api/sessions', {});
      const id = result.id || result.ID;
      const title = result.title || 'Nova conversa';
      // reload sessions
      await loadSessions();
      if (id) {
        Sessions.setActive(id);
        sessionSelected(id);
      }
    } catch (err) {
      toast('Erro ao criar conversa: ' + (err.message || 'desconhecido'), 'error');
    }
  }

  function sessionSelected(id) {
    trySet('oc_active_session', id || '');
    Chat.setSession(id);
  }

  // --- SSE ---

  function connectSSE() {
    if (cleanupSSE) cleanupSSE();
    cleanupSSE = API.subscribeSSE((event) => {
      Chat.handleSSEEvent(event);
    });
  }

  // --- Health ---

  function startHealthPolling() {
    pollHealth();
    healthInterval = setInterval(pollHealth, 15000);
  }

  async function pollHealth() {
    const statusEl = document.getElementById('connection-status');
    const statusVersion = document.getElementById('status-version');
    const statusOpencode = document.getElementById('status-opencode');
    const statusOpencodeText = document.getElementById('status-opencode-text');

    try {
      const health = await API.get('/api/health');
      lastHealth = health;

      // header status
      statusEl.className = 'connection-status online';
      statusEl.querySelector('.status-text').textContent = 'Online';

      // status bar
      statusVersion.textContent = 'opencode: ' + ((health.opencode && health.opencode.version) || '—');
      statusOpencode.className = 'status-opencode ' + (health.ok ? 'online' : 'offline');
      statusOpencodeText.textContent = health.ok ? 'opencode online' : 'opencode offline';
    } catch (_) {
      statusEl.className = 'connection-status offline';
      statusEl.querySelector('.status-text').textContent = 'Offline';
      statusVersion.textContent = 'opencode: —';
      statusOpencode.className = 'status-opencode offline';
      statusOpencodeText.textContent = 'opencode offline';
    }
  }

  // --- Pet ---

  function togglePet() {
    const overlay = document.getElementById('pet-overlay');
    const current = overlay.getAttribute('data-position');
    if (current === 'hidden') {
      applyPetPosition(config.pet && config.pet.position ? config.pet.position : 'bottom-right');
    } else {
      overlay.setAttribute('data-position', 'hidden');
      overlay.style.display = 'none';
    }
  }

  function applyPetPosition(pos) {
    const overlay = document.getElementById('pet-overlay');
    if (pos === 'hidden') {
      overlay.style.display = 'none';
    } else {
      overlay.style.display = '';
      overlay.setAttribute('data-position', pos);
    }
  }

  async function loadPetState() {
    try {
      const state = await API.get('/api/pet/state');
      if (state && state.animation) {
        Pet.setAnimation(state.animation);
      }
    } catch (_) {}
  }

  // --- Sidebar (mobile) ---

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  }

  // --- Toast ---

  function toast(message, type) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  // --- Helpers ---

  function escapeAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g, '&quot;');
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function tryGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function trySet(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }

  function restoreLastSession() {
    // load sessions after everything else is set up
    loadSessions();
  }

  // Expose toast globally for other modules
  window.App = { toast };

  return { init, toast };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
