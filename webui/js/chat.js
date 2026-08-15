/* ============================================================
   chat.js — Chat messages, streaming, SSE handling
   ============================================================ */
const Chat = (() => {
  'use strict';

  let messagesContainer = null;
  let emptyState = null;
  let typingIndicator = null;
  let inputArea = null;
  let messageInput = null;
  let btnSend = null;
  let btnStop = null;
  let btnAttach = null;
  let fileInput = null;
  let attachedFilesEl = null;
  let chatArea = null;

  let currentSessionId = null;
  let isStreaming = false;
  let abortController = null;
  let attachedFiles = []; // { file, name, mediaType, dataBase64 }
  let streamingMsgEl = null;
  let streamingParts = {}; // partId → accumulated text
  let assistantName = 'Tux';

  function init() {
    messagesContainer = document.getElementById('messages-container');
    emptyState = document.getElementById('empty-state');
    typingIndicator = document.getElementById('typing-indicator');
    messageInput = document.getElementById('message-input');
    btnSend = document.getElementById('btn-send');
    btnStop = document.getElementById('btn-stop');
    btnAttach = document.getElementById('btn-attach');
    fileInput = document.getElementById('file-input');
    attachedFilesEl = document.getElementById('attached-files');
    chatArea = document.getElementById('chat-area');

    // send
    btnSend.addEventListener('click', sendMessage);
    btnStop.addEventListener('click', abortGeneration);

    // enter to send, shift+enter for newline
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // auto-resize textarea
    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + 'px';
      btnSend.disabled = !messageInput.value.trim() && !attachedFiles.length;
    });

    // attach file
    btnAttach.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          messageInput.value = prompt;
          messageInput.dispatchEvent(new Event('input'));
          sendMessage();
        }
      });
    });
  }

  function setSession(id) {
    currentSessionId = id;
    streamingParts = {};
    streamingMsgEl = null;
    if (id) {
      emptyState.classList.add('hidden');
      messagesContainer.classList.remove('hidden');
      loadMessages(id);
    } else {
      emptyState.classList.remove('hidden');
      messagesContainer.classList.add('hidden');
      messagesContainer.innerHTML = '';
    }
  }

  function setAssistantName(name) {
    assistantName = name || 'Tux';
    document.getElementById('welcome-text').textContent = `Olá! Sou ${assistantName}.`;
  }

  async function loadMessages(sessionId) {
    messagesContainer.innerHTML = '';
    // skeleton
    for (let i = 0; i < 3; i++) {
      const sk = document.createElement('div');
      sk.className = 'message-row assistant';
      sk.innerHTML = `<div class="message-avatar"></div><div><div class="skeleton" style="width:${160 + i * 40}px;height:36px;margin-bottom:6px"></div><div class="skeleton" style="width:${100 + i * 30}px;height:14px"></div></div>`;
      messagesContainer.appendChild(sk);
    }

    try {
      const messages = await API.get(`/api/sessions/${sessionId}/messages`);
      renderMessages(Array.isArray(messages) ? messages : []);
    } catch (err) {
      messagesContainer.innerHTML = `<div class="error-message">Erro ao carregar mensagens: ${escapeHtml(err.message || 'desconhecido')}</div>`;
    }

    scrollToBottom();
  }

  function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    if (!messages.length) return;

    messages.forEach(msg => {
      appendMessage(msg);
    });

    scrollToBottom();
  }

  function appendMessage(msg) {
    const role = normalizeRole(msg.role || msg.type);
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'Você' : assistantName.charAt(0).toUpperCase();

    const body = document.createElement('div');
    body.className = 'message-body';

    if (role === 'assistant') {
      const nameEl = document.createElement('div');
      nameEl.className = 'message-name';
      nameEl.textContent = assistantName;
      body.appendChild(nameEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // extract text from message parts
    const text = extractText(msg);
    bubble.innerHTML = Markdown.render(text);
    body.appendChild(bubble);

    // time
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    const ts = msg.time || msg.created || msg.timestamp;
    if (ts) timeEl.textContent = formatTime(ts);
    body.appendChild(timeEl);

    row.appendChild(avatar);
    row.appendChild(body);
    messagesContainer.appendChild(row);

    return bubble;
  }

  function extractText(msg) {
    // handle various API shapes
    if (typeof msg.content === 'string') return msg.content;
    if (typeof msg.text === 'string') return msg.text;
    if (Array.isArray(msg.parts)) {
      return msg.parts
        .filter(p => p.type === 'text' || p.type === 'content')
        .map(p => p.text || p.content || '')
        .join('');
    }
    if (msg.content && typeof msg.content === 'object') {
      if (Array.isArray(msg.content.parts)) {
        return msg.content.parts
          .filter(p => p.type === 'text')
          .map(p => p.text || '')
          .join('');
      }
    }
    return '';
  }

  function normalizeRole(role) {
    if (!role) return 'assistant';
    const r = String(role).toLowerCase();
    if (r === 'user' || r === 'human') return 'user';
    return 'assistant';
  }

  function formatTime(ts) {
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // --- Streaming ---

  function handleSSEEvent(event) {
    if (!event || !event.type) return;
    const type = event.type;
    const sessionID = event.sessionID || event.session_id;

    // only process events for current session (or all if no session set)
    // but also accept events without sessionID for global events

    switch (type) {
      case 'message.part.updated':
      case 'message.part.delta':
        handlePartUpdated(event);
        break;
      case 'message.updated':
        handleMsgUpdated(event);
        break;
      case 'snapshot':
        if (sessionID === currentSessionId && event.messages) {
          renderMessages(event.messages);
        }
        break;
      case 'permission.asked':
      case 'permission.v2.asked':
        Permissions.show(event);
        break;
      case 'message.error':
      case 'session.error':
        handleStreamError(event);
        break;
      case 'snackbar':
        App.toast(event.message || event.text || 'Notificação', event.level || 'info');
        break;
      case '_error':
        // SSE connection error
        break;
    }
  }

  function handlePartUpdated(event) {
    const state = event.state;
    const partType = event.partType || event.part?.type;
    const delta = event.delta || '';
    const text = event.text || event.content || '';
    const partId = event.partID || event.partId || event.part?.id || '';
    const sessionID = event.sessionID || event.session_id;
    const messageID = event.messageID || event.messageId || event.message_id;

    if (sessionID && sessionID !== currentSessionId) return;

    // only handle text parts
    if (partType && partType !== 'text' && partType !== 'content') return;

    // Show typing indicator until first token
    if (!streamingMsgEl && !delta && !text) {
      typingIndicator.classList.remove('hidden');
      Pet.setState('thinking');
      return;
    }

    typingIndicator.classList.add('hidden');

    // Ensure streaming bubble exists
    if (!streamingMsgEl) {
      streamingMsgEl = createStreamingBubble();
      Pet.setState('streaming');
    }

    // Accumulate text
    if (partId) {
      if (delta) {
        streamingParts[partId] = (streamingParts[partId] || '') + delta;
      } else if (text) {
        streamingParts[partId] = text;
      }
    } else if (delta) {
      // no partId: accumulate in a default key
      streamingParts['_default'] = (streamingParts['_default'] || '') + delta;
    } else if (text) {
      streamingParts['_default'] = text;
    }

    // Update bubble with all accumulated parts
    const allText = Object.values(streamingParts).join('');
    if (allText) {
      streamingMsgEl.innerHTML = Markdown.render(allText);
      scrollToBottom();
    }

    // If state is completed and this is the last part, finalize
    if (state === 'completed' && event.isLast) {
      finalizeStreaming();
    }
  }

  function handleMsgUpdated(event) {
    // Full message update — re-render it
    const sessionID = event.sessionID || event.session_id;
    if (sessionID && sessionID !== currentSessionId) return;

    // If we were streaming, finalize
    if (streamingMsgEl) {
      finalizeStreaming();
    }

    // If there's a full message, re-render it
    if (event.message) {
      const role = normalizeRole(event.message.role);
      if (role === 'assistant') {
        appendMessage(event.message);
        scrollToBottom();
      }
    }
  }

  function createStreamingBubble() {
    typingIndicator.classList.add('hidden');
    const row = document.createElement('div');
    row.className = 'message-row assistant';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = assistantName.charAt(0).toUpperCase();

    const body = document.createElement('div');
    body.className = 'message-body';

    const nameEl = document.createElement('div');
    nameEl.className = 'message-name';
    nameEl.textContent = assistantName;
    body.appendChild(nameEl);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble streaming-cursor';
    body.appendChild(bubble);

    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    body.appendChild(timeEl);

    row.appendChild(avatar);
    row.appendChild(body);
    messagesContainer.appendChild(row);
    scrollToBottom();

    return bubble;
  }

  function finalizeStreaming() {
    if (streamingMsgEl) {
      streamingMsgEl.classList.remove('streaming-cursor');
      streamingMsgEl = null;
      streamingParts = {};
    }
    typingIndicator.classList.add('hidden');
    isStreaming = false;
    showSendButton();
    Pet.setState('idle');
  }

  function handleStreamError(event) {
    const sessionID = event.sessionID || event.session_id;
    if (sessionID && sessionID !== currentSessionId) return;

    finalizeStreaming();
    const errMsg = event.error || event.message || 'Erro durante a geração';
    App.toast(errMsg, 'error');
    Pet.setState('error');
    setTimeout(() => Pet.setState('idle'), 3000);
  }

  // --- Send / Abort ---

  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !attachedFiles.length) return;
    if (!currentSessionId) return;

    // Build user message for display
    const userMsg = { role: 'user', content: text, time: Date.now() };
    appendMessage(userMsg);
    scrollToBottom();

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    btnSend.disabled = true;

    // Prepare files
    const files = attachedFiles.map(f => ({
      name: f.name,
      mediaType: f.mediaType,
      dataBase64: f.dataBase64,
    }));
    clearAttachedFiles();

    // Show streaming state
    isStreaming = true;
    streamingParts = {};
    streamingMsgEl = null;
    showStopButton();
    Pet.setState('thinking');

    try {
      const body = { text };
      if (files.length) body.files = files;
      const model = document.getElementById('model-selector').value;
      if (model) body.model = model;

      await API.post(`/api/sessions/${currentSessionId}/messages`, body);
      // Response will come via SSE
    } catch (err) {
      isStreaming = false;
      showSendButton();
      Pet.setState('error');
      setTimeout(() => Pet.setState('idle'), 3000);

      if (err.status === 404) {
        App.toast('Sessão não encontrada. Crie uma nova conversa.', 'error');
      } else if (err.status === 400) {
        App.toast('Erro ao enviar: ' + (err.message || 'requisição inválida'), 'error');
      } else {
        App.toast('Erro ao enviar mensagem: ' + (err.message || 'desconhecido'), 'error');
      }
    }
  }

  async function abortGeneration() {
    if (!currentSessionId) return;
    try {
      await API.post(`/api/sessions/${currentSessionId}/abort`);
      finalizeStreaming();
      Pet.setState('idle');
    } catch (err) {
      App.toast('Erro ao abortar: ' + (err.message || 'desconhecido'), 'error');
    }
  }

  // --- File attachment ---

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1] || '';
        attachedFiles.push({
          file,
          name: file.name,
          mediaType: file.type || 'application/octet-stream',
          dataBase64: base64,
        });
        renderAttachedFiles();
        btnSend.disabled = false;
      };
      reader.readAsDataURL(file);
    });
    fileInput.value = '';
  }

  function renderAttachedFiles() {
    if (!attachedFiles.length) {
      attachedFilesEl.classList.add('hidden');
      attachedFilesEl.innerHTML = '';
      return;
    }
    attachedFilesEl.classList.remove('hidden');
    attachedFilesEl.innerHTML = attachedFiles.map((f, i) => {
      const size = formatFileSize(f.file.size);
      return `<div class="file-chip">
        <span class="file-chip-name">${escapeHtml(f.name)} (${size})</span>
        <button class="file-chip-remove" data-idx="${i}" title="Remover">&times;</button>
      </div>`;
    }).join('');

    attachedFilesEl.querySelectorAll('.file-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        attachedFiles.splice(idx, 1);
        renderAttachedFiles();
        btnSend.disabled = !messageInput.value.trim() && !attachedFiles.length;
      });
    });
  }

  function clearAttachedFiles() {
    attachedFiles = [];
    renderAttachedFiles();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // --- UI helpers ---

  function showSendButton() {
    btnSend.classList.remove('hidden');
    btnStop.classList.add('hidden');
  }

  function showStopButton() {
    btnSend.classList.add('hidden');
    btnStop.classList.remove('hidden');
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    init, setSession, setAssistantName, handleSSEEvent,
    scrollToBottom, isStreaming: () => isStreaming,
  };
})();
