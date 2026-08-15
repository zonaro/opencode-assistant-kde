/* ============================================================
   sessions.js — Session management (list, create, delete, select)
   ============================================================ */
const Sessions = (() => {
  'use strict';

  let sessions = [];
  let activeSessionId = null;
  let onSelectCallback = null;
  let listEl = null;

  function init(el) {
    listEl = el;
  }

  function onSelect(cb) { onSelectCallback = cb; }

  function setSessions(list) {
    sessions = (list || []).sort((a, b) => {
      const ta = (a.time && a.time.updated) || a.updated || 0;
      const tb = (b.time && b.time.updated) || b.updated || 0;
      return tb - ta;
    });
    render();
  }

  function getActive() { return activeSessionId; }

  function setActive(id) {
    activeSessionId = id;
    render();
    // persist
    try { localStorage.setItem('oc_active_session', id || ''); } catch (_) {}
  }

  function render() {
    if (!listEl) return;
    if (!sessions.length) {
      listEl.innerHTML = '<div style="padding:16px;color:var(--text-dim);font-size:13px;text-align:center">Nenhuma conversa ainda.</div>';
      return;
    }

    listEl.innerHTML = sessions.map(s => {
      const id = s.id || s.ID || '';
      const title = s.title || 'Conversa sem título';
      const time = (s.time && s.time.created) || s.created || s.time || 0;
      const dateStr = time ? formatDate(time) : '';
      const active = id === activeSessionId ? ' active' : '';
      return `
        <div class="session-item${active}" data-id="${escapeAttr(id)}">
          <div class="session-info">
            <div class="session-title">${escapeHtml(title)}</div>
            <div class="session-date">${dateStr}</div>
          </div>
          <button class="session-delete btn-icon" title="Excluir" data-delete="${escapeAttr(id)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      `;
    }).join('');

    // click handlers
    listEl.querySelectorAll('.session-item').forEach(el => {
      el.addEventListener('click', (e) => {
        // ignore if clicking delete button
        if (e.target.closest('.session-delete')) return;
        const id = el.getAttribute('data-id');
        setActive(id);
        if (onSelectCallback) onSelectCallback(id);
      });
    });

    listEl.querySelectorAll('.session-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-delete');
        const session = sessions.find(s => (s.id || s.ID) === id);
        const title = session ? (session.title || 'esta conversa') : 'esta conversa';
        if (!confirm(`Excluir "${title}"?`)) return;
        try {
          await API.del('/api/sessions/' + id);
          sessions = sessions.filter(s => (s.id || s.ID) !== id);
          if (activeSessionId === id) {
            activeSessionId = sessions.length ? (sessions[0].id || sessions[0].ID) : null;
          }
          render();
          if (onSelectCallback) onSelectCallback(activeSessionId);
        } catch (err) {
          App.toast('Erro ao excluir: ' + (err.message || 'desconhecido'), 'error');
        }
      });
    });
  }

  function formatDate(ts) {
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (isNaN(d)) return '';
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
      return d.toLocaleDateString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { init, setSessions, getActive, setActive, onSelect, render };
})();
