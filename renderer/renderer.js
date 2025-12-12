const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendIcon') || document.getElementById('send');
const errorEl = document.getElementById('error');
const modelEl = document.getElementById('model');
const clearBtn = document.getElementById('clear');
const runIndicatorEl = document.getElementById('runIndicator');
const historyCliEl = document.getElementById('history-cli');
const historySnowEl = document.getElementById('history-snow');
const historyCortexEl = document.getElementById('history-cortex');
const historyIdeEl = document.getElementById('history-ide');
const historyProjectsEl = document.getElementById('history-projects');
const newChatSidebarBtn = document.getElementById('newChatSidebar');
const historySearchEl = document.getElementById('historySearch');
const themeSwitchEl = document.getElementById('themeSwitch');
const attachBtn = document.getElementById('attach');
const fileInputEl = document.getElementById('fileInput');
const attachPreviewEl = document.getElementById('attachPreview');
const homeEl = document.getElementById('home');
const inputRowEl = document.getElementById('inputRow');
const homeNewBtn = document.getElementById('homeNew');
const homeOpenBtn = document.getElementById('homeOpen');
const homeBtn = document.getElementById('homeBtn');
const micBtn = document.getElementById('mic');
const scrollDownBtn = document.getElementById('scrollDown');
const toastEl = document.getElementById('toast');

const STORAGE_KEY = 'electronChat.sessions.v1';
let sessions = [];
let currentSessionId = null;
const conversation = [];
let isRunning = false;
let pendingAttachments = [];
let isHome = true;
let providerName = 'shell';
let wsUrl = '';
let httpSessionUrl = '';
let wsProtocols = [];
let activeWs = null;
let activeWsUrl = '';
let remoteSessionWsUrl = '';
let remoteSessionId = '';
const ephemeralByMessage = new WeakMap();

function resetWsState() {
  try { if (activeWs) activeWs.close(); } catch {}
  activeWs = null;
  activeWsUrl = '';
  remoteSessionWsUrl = '';
  remoteSessionId = '';
}

// Categories
const CATEGORY_CLI = 'Command Line';
const CATEGORY_SNOW = 'Snowflake CLI';
const CATEGORY_CORTEX = 'Cortex';
const CATEGORY_IDE = 'IDE';
const CATEGORY_PROJECTS = 'Projects';
let defaultCategory = CATEGORY_CLI;
let selectedCategory = null;
const FOLDERS_KEY = 'electronChat.folders.v1'; // {cli:true|false, snow:true|false, ...} true = collapsed
let historySearchQuery = '';

// Theme
const THEME_KEY = 'electronChat.theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeSwitchEl) {
    themeSwitchEl.checked = theme === 'dark';
  }
}
function initTheme() {
  let theme = localStorage.getItem(THEME_KEY);
  if (!theme) {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }
  applyTheme(theme);
}
function setTheme(theme) {
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {}
}

function createSession(categoryOverride) {
  const id = uid();
  const now = Date.now();
  const cat = categoryOverride || selectedCategory || defaultCategory;
  const session = { id, title: 'New chat', createdAt: now, updatedAt: now, category: cat, messages: [] };
  sessions.unshift(session);
  currentSessionId = id;
  // Reset any existing websocket when starting a brand new chat
  resetWsState();
  conversation.splice(0, conversation.length);
  renderHistory();
  render();
  saveSessions();
  const groupKey = keyFromCategory(cat);
  const groupEl = document.querySelector(`.historyGroup[data-cat="${groupKey}"]`);
  if (groupEl && groupEl.classList.contains('collapsed')) {
    groupEl.classList.remove('collapsed');
    saveFoldersState(Array.from(document.querySelectorAll('.historyGroup')));
  }
}

function ensureSession() {
  sessions = loadSessions();
  if (!sessions.length) {
    createSession();
  } else {
    // ensure updatedAt exists and sort by it
    sessions.forEach(s => {
      if (!s.updatedAt) s.updatedAt = s.createdAt || Date.now();
      if (!s.category) s.category = defaultCategory;
    });
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    currentSessionId = sessions[0].id;
    conversation.splice(0, conversation.length, ...sessions[0].messages);
  }
}

function getCurrentSession() {
  return sessions.find(s => s.id === currentSessionId);
}

function getHistoryContainer(category) {
  switch (category) {
    case CATEGORY_SNOW: return historySnowEl;
    case CATEGORY_CORTEX: return historyCortexEl;
    case CATEGORY_IDE: return historyIdeEl;
    case CATEGORY_PROJECTS: return historyProjectsEl;
    case CATEGORY_CLI:
    default: return historyCliEl;
  }
}

function keyFromCategory(category) {
  if (category === CATEGORY_SNOW) return 'snow';
  if (category === CATEGORY_CORTEX) return 'cortex';
  if (category === CATEGORY_IDE) return 'ide';
  if (category === CATEGORY_PROJECTS) return 'projects';
  return 'cli';
}

function render() {
  if (isHome) {
    return;
  }
  messagesEl.innerHTML = '';
  for (let i = 0; i < conversation.length; i++) {
    const m = conversation[i];
    const bubble = document.createElement('div');
    bubble.className = `message ${m.role}`;
    if (m.role === 'assistant') {
      const rich = document.createElement('div');
      rich.className = 'rich';
      rich.innerHTML = renderMarkdownToHtml(m.content || '');
      // Add copy button for each code block
      const blocks = rich.querySelectorAll('pre');
      blocks.forEach((pre) => {
        const btn = document.createElement('button');
        btn.className = 'codeCopy';
        btn.type = 'button';
        btn.title = 'Copy code';
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const codeEl = pre.querySelector('code');
          const text = codeEl ? codeEl.textContent : pre.textContent;
          const ok = await (window.app && window.app.copyToClipboard ? window.app.copyToClipboard(text || '') : navigator.clipboard?.writeText(text || '').then(() => true).catch(() => false));
          if (ok) showToast('Code copied');
        });
        pre.appendChild(btn);
      });
      bubble.appendChild(rich);
      // typing indicator for non-streaming mode
      // if message is empty and we're running, show dots
      if (!m.content && isRunning) {
        const dots = document.createElement('div');
        dots.className = 'typingDots';
        dots.innerHTML = '<span></span><span></span><span></span>';
        bubble.appendChild(dots);
      }
      const eph = ephemeralByMessage.get(m) || [];
      if (eph.length) {
        const row = document.createElement('div');
        row.className = 'ephemeralRow';
        eph.forEach(e => {
          const span = document.createElement('span');
          span.className = 'ephemeral';
          span.textContent = e.label;
          row.appendChild(span);
        });
        bubble.appendChild(row);
      }
      if (Array.isArray(m.chips) && m.chips.length) {
        const chips = document.createElement('div');
        chips.className = 'chips';
        m.chips.forEach(label => {
          const c = document.createElement('span');
          c.className = 'chip';
          c.textContent = label;
          chips.appendChild(c);
        });
        bubble.appendChild(chips);
      }
    } else {
      bubble.textContent = m.content;
    }
    if (Array.isArray(m.attachments) && m.attachments.length) {
      const wrap = document.createElement('div');
      wrap.className = 'attachments';
      for (const a of m.attachments) {
        if (a?.type === 'image' && a?.src) {
          const img = document.createElement('img');
          img.src = a.src;
          img.alt = a.name || 'image';
          wrap.appendChild(img);
        }
      }
      bubble.appendChild(wrap);
    }
    // Toolbar row (below message) when assistant response completed
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbarRow';
    // Copy
    const btnCopy = document.createElement('button');
    btnCopy.className = 'iconBtn';
    btnCopy.title = 'Copy';
    btnCopy.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    btnCopy.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await (window.app && window.app.copyToClipboard ? window.app.copyToClipboard(m.content || '') : navigator.clipboard?.writeText(m.content || '').then(() => true).catch(() => false));
      if (ok) showToast('Copied');
    });
    // Edit & resend
    const btnEdit = document.createElement('button');
    btnEdit.className = 'iconBtn';
    btnEdit.title = 'Edit & resend';
    btnEdit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>';
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      inputEl.value = m.content || '';
      inputEl.focus();
    });
    // Regenerate
    const btnRegen = document.createElement('button');
    btnRegen.className = 'iconBtn';
    btnRegen.title = 'Regenerate';
    btnRegen.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>';
    btnRegen.addEventListener('click', async (e) => {
      e.stopPropagation();
      const prevUser = findPrevUserContent(i);
      if (prevUser) {
        inputEl.value = prevUser;
        await send();
      } else {
        showToast('No previous prompt');
      }
    });
    // Email
    const btnMail = document.createElement('button');
    btnMail.className = 'iconBtn';
    btnMail.title = 'Email';
    btnMail.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"></path><path d="M22 6l-10 7L2 6"></path></svg>';
    btnMail.addEventListener('click', (e) => {
      e.stopPropagation();
      const subject = encodeURIComponent('CoCo Bridge response');
      const body = encodeURIComponent(m.content || '');
      const link = document.createElement('a');
      link.href = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=&su=${subject}&body=${body}`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
    // Thumbs up
    const btnUp = document.createElement('button');
    btnUp.className = 'iconBtn thumbUp';
    btnUp.title = 'Thumbs up';
    // Clean thumbs-up variant
    btnUp.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11"></path><path d="M15 10h4a2 2 0 0 1 2 2v1a7 7 0 0 1-7 7h-1a2 2 0 0 1-2-2v-7l4-8a2 2 0 0 1 2 2z"></path></svg>';
    btnUp.addEventListener('click', (e) => {
      e.stopPropagation();
      saveFeedback(m.id || '', true);
    });
    // Time label
    const timeEl = document.createElement('span');
    timeEl.className = 'msgTime';
    timeEl.textContent = timeAgo(m.createdAt || Date.now());
    toolbar.appendChild(btnCopy);
    toolbar.appendChild(btnEdit);
    toolbar.appendChild(btnRegen);
    toolbar.appendChild(btnMail);
    toolbar.appendChild(btnUp);
    toolbar.appendChild(timeEl);
    messagesEl.appendChild(bubble);
    if (m.role === 'assistant' && (m.done || (!isRunning && m.content))) {
      messagesEl.appendChild(toolbar);
    }
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showHome() {
  isHome = true;
  if (homeEl) homeEl.style.display = 'flex';
  if (messagesEl) messagesEl.style.display = 'none';
  if (inputRowEl) inputRowEl.style.display = 'none';
}

function showChat() {
  isHome = false;
  if (homeEl) homeEl.style.display = 'none';
  if (messagesEl) messagesEl.style.display = 'flex';
  if (inputRowEl) inputRowEl.style.display = 'grid';
  render();
}

function renderHistory() {
  // clear all containers
  [historyCliEl, historySnowEl, historyCortexEl, historyIdeEl, historyProjectsEl].forEach(c => { if (c) c.innerHTML = ''; });
  const q = (historySearchQuery || '').toLowerCase();
  for (const s of sessions) {
    const titleText = (s.title || 'Untitled').toLowerCase();
    if (q && !titleText.includes(q)) continue;
    const container = getHistoryContainer(s.category || defaultCategory);
    if (!container) continue;
    const item = document.createElement('div');
    item.className = 'historyItem' + (s.id === currentSessionId ? ' active' : '');
    // Full title in tooltip; compact row shows ellipsis
    const fullTitle = s.title || 'Untitled';
    item.title = fullTitle;
    const titleEl = document.createElement('span');
    titleEl.className = 'title';
    titleEl.textContent = fullTitle;
    const delBtn = document.createElement('button');
    delBtn.className = 'deleteBtn';
    delBtn.type = 'button';
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';
    delBtn.title = 'Delete chat';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });
    item.appendChild(titleEl);
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      // Switching sessions: reset per-session websocket state
      resetWsState();
      currentSessionId = s.id;
      conversation.splice(0, conversation.length, ...s.messages);
      showChat();
      renderHistory();
      render();
      inputEl.focus();
    });
    // Inline rename on double click
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = fullTitle;
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      input.style.borderRadius = '6px';
      input.style.border = '1px solid color-mix(in srgb, var(--fg) 16%, transparent)';
      input.style.padding = '4px 6px';
      titleEl.replaceWith(input);
      input.focus();
      input.select();
      const save = () => {
        const val = input.value.trim() || 'Untitled';
        s.title = val;
        s.updatedAt = Date.now();
        saveSessions();
        renderHistory();
      };
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') save();
        if (ke.key === 'Escape') renderHistory();
      });
      input.addEventListener('blur', save);
    });
    container.appendChild(item);
  }
}

async function send() {
  const text = inputEl.value.trim();
  const hasText = text.length > 0;
  if (!hasText && pendingAttachments.length === 0) return;
  inputEl.value = '';
  errorEl.textContent = '';
  setRunning(true);

  conversation.push({ role: 'user', content: hasText ? text : '' });
  conversation[conversation.length - 1].id = uid();
  conversation[conversation.length - 1].createdAt = Date.now();
  if (pendingAttachments.length) {
    conversation[conversation.length - 1].attachments = pendingAttachments.slice();
  }
  const session = getCurrentSession();
  if (session) {
    session.messages = [...conversation];
    if (!session.title || session.title === 'New chat') {
      const base = hasText ? text : (pendingAttachments[0]?.name || 'New chat');
      session.title = base.slice(0, 40) + (base.length > 40 ? '…' : '');
    }
    if (!session.category) session.category = defaultCategory;
    session.updatedAt = Date.now();
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    saveSessions();
    renderHistory();
  }
  render();
  // clear staged files after queuing the message
  pendingAttachments = [];
  renderAttachPreview();

  try {
    if (isWsProvider()) {
      // Start streaming without blocking the input UI
      sendViaWebSocket().catch(err => {
        errorEl.textContent = err?.message || String(err);
      });
    } else {
      const model = modelEl ? (modelEl.value.trim() || undefined) : undefined;
      const result = await window.api.sendChat(conversation, model);
      const content = result?.content ?? '';
      conversation.push({ role: 'assistant', content, id: uid(), createdAt: Date.now(), done: true });
      const s2 = getCurrentSession();
      if (s2) {
        s2.messages = [...conversation];
        s2.updatedAt = Date.now();
        saveSessions();
      }
    }
  } catch (err) {
    errorEl.textContent = err?.message || String(err);
  } finally {
    render();
    // Re-enable input immediately; WebSocket continues streaming in background
    setRunning(false);
    inputEl.focus();
  }
}

// Scroll-to-bottom logic
function isNearBottom() {
  const threshold = 80;
  return messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - threshold;
}
function updateScrollButton() {
  if (!scrollDownBtn) return;
  scrollDownBtn.style.display = isNearBottom() ? 'none' : 'inline-flex';
}
if (messagesEl && scrollDownBtn) {
  messagesEl.addEventListener('scroll', updateScrollButton);
  scrollDownBtn.addEventListener('click', () => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    updateScrollButton();
  });
}

// Toast
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = String(msg || '');
  toastEl.style.display = 'block';
  setTimeout(() => { toastEl.style.display = 'none'; }, 1800);
}

// Lightweight Markdown renderer (bold, inline code, code blocks, bullets)
function renderMarkdownToHtml(text) {
  if (!text) return '';
  const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // First escape everything
  let src = String(text);
  // Code blocks: ```lang?\n...```
  src = src.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const safe = escapeHtml(code);
    const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
    return `<pre><code${cls}>${safe}</code></pre>`;
  });
  // Inline code: `code`
  src = src.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // Bold: **text**
  src = src.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Lists: lines starting with "- " → <ul><li>...</li></ul>
  const lines = src.split(/\r?\n/);
  const out = [];
  let inList = false;
  let paraBuf = [];
  function flushPara() {
    if (!paraBuf.length) return;
    const text = paraBuf.join(' ').trim();
    if (text) out.push('<p>' + text + '</p>');
    paraBuf = [];
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw;
    if (/^\s*-\s+/.test(line)) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + line.replace(/^\s*-\s+/, '') + '</li>');
      continue;
    }
    if (inList) {
      // End list on first non-list line (including blank)
      out.push('</ul>');
      inList = false;
    }
    if (line.trim().length === 0) {
      // Blank line → paragraph break
      flushPara();
    } else {
      paraBuf.push(line);
    }
  }
  if (inList) out.push('</ul>');
  flushPara();
  return out.join('\n');
}

function findPrevUserContent(idx) {
  for (let j = idx - 1; j >= 0; j--) {
    if (conversation[j]?.role === 'user' && conversation[j]?.content) {
      return conversation[j].content;
    }
  }
  return null;
}

function saveFeedback(messageId, isUp) {
  if (!messageId) return;
  try {
    localStorage.setItem('electronChat.feedback.' + messageId, isUp ? 'up' : 'down');
    showToast(isUp ? 'Thanks for the feedback' : 'Feedback noted');
  } catch {}
}

sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    send();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

function setRunning(running) {
  isRunning = running;
  inputEl.disabled = running;
  sendBtn.disabled = running;
  if (runIndicatorEl) {
    runIndicatorEl.style.display = running ? 'inline-block' : 'none';
  }
}

function clearChat() {
  createSession();
  errorEl.textContent = '';
}
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    clearChat();
    showChat();
  });
}
if (newChatSidebarBtn) {
  newChatSidebarBtn.addEventListener('click', () => {
    createSession();
    showChat();
    inputEl.focus();
  });
}
if (historySearchEl) {
  historySearchEl.addEventListener('input', (e) => {
    historySearchQuery = (e.target.value || '').trim();
    renderHistory();
  });
}
if (themeSwitchEl) {
  themeSwitchEl.addEventListener('change', (e) => {
    setTheme(e.target.checked ? 'dark' : 'light');
  });
}

// Attachments
if (attachBtn && fileInputEl) {
  // simple paperclip icon inline SVG
  attachBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-8.49 8.49a6 6 0 0 1-8.49-8.49l8.49-8.49a4 4 0 0 1 5.66 5.66L9.17 17.66a2 2 0 1 1-2.83-2.83l8.49-8.49"/></svg>';
  attachBtn.style.display = 'inline-flex';
  attachBtn.addEventListener('click', () => fileInputEl.click());
  fileInputEl.addEventListener('change', async () => {
    const files = Array.from(fileInputEl.files || []);
    await handleFilesAttach(files);
    fileInputEl.value = '';
  });
}

// Voice record + transcribe
let mediaRecorder = null;
let recordedChunks = [];
let localASRPipeline = null;
async function ensureLocalASR() {
  if (localASRPipeline) return localASRPipeline;
  // Try global (loaded via script tag)
  let pipelineFn = (window.transformers && window.transformers.pipeline) ? window.transformers.pipeline : null;
  // Fallback: dynamic import from CDN if global not present (no upload; simple GET)
  if (!pipelineFn) {
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      pipelineFn = mod.pipeline || (window.transformers && window.transformers.pipeline);
    } catch (e) {
      // surface clear message
      throw new Error('ASR engine not loaded');
    }
  }
  // tiny.en is small and fast; change to tiny/base for multilingual or better quality
  localASRPipeline = await pipelineFn('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  return localASRPipeline;
}

async function decodeAndResampleToMono16k(arrayBuffer) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  // Safari requires copy of buffer for decodeAudioData sometimes
  const buf = arrayBuffer.slice(0);
  const audioBuffer = await audioCtx.decodeAudioData(buf);
  if (audioBuffer.sampleRate === 16000 && audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }
  const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const duration = audioBuffer.duration;
  const offline = new OfflineCtor(1, Math.ceil(duration * 16000), 16000);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
if (micBtn) {
  micBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 19v4"/></svg>';
  micBtn.style.display = 'inline-flex';
// Inline send icon SVG
if (document.getElementById('sendIcon')) {
  // Match mic/attach icon sizing and stroke
  document.getElementById('sendIcon').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path></svg>';
}
  micBtn.addEventListener('click', async () => {
    try {
      // Record audio and transcribe locally (no network)
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          try {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            const asr = await ensureLocalASR();
            const mono16k = await decodeAndResampleToMono16k(arrayBuffer);
            const result = await asr(mono16k, { chunk_length_s: 30, stride_length_s: 5 });
            if (result?.text) {
              inputEl.value = result.text;
              inputEl.focus();
            } else {
              errorEl.textContent = 'No speech recognized.';
            }
            if (!inputEl.value) {
              // ensure the UI regains focus if nothing transcribed
              inputEl.focus();
            }
          } catch (err) {
            errorEl.textContent = err?.message || String(err);
          } finally {
            micBtn.classList.remove('recording');
            // Stop all tracks
            stream.getTracks().forEach(t => t.stop());
          }
        };
        mediaRecorder.start();
        micBtn.classList.add('recording');
      } else if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    } catch (err) {
      errorEl.textContent = err?.message || String(err);
      micBtn.classList.remove('recording');
    }
  });
}

document.addEventListener('paste', async (e) => {
  const items = Array.from(e.clipboardData?.items || []);
  const files = items.map(i => i.kind === 'file' ? i.getAsFile() : null).filter(Boolean);
  if (files.length) {
    e.preventDefault();
    await handleFilesAttach(files);
  }
});

async function handleFilesAttach(files) {
  if (!files.length) return;
  const attachments = [];
  for (const f of files) {
    if (!f || !f.type.startsWith('image/')) continue;
    const arrayBuffer = await f.arrayBuffer();
    const ext = (f.type.split('/')[1] || 'png');
    try {
      const res = await window.app.saveImage(arrayBuffer, ext);
      if (res?.path) {
        attachments.push({ type: 'image', src: res.path, name: f.name });
      }
    } catch (err) {
      console.error('saveImage failed', err);
    }
  }
  if (!attachments.length) return;
  pendingAttachments.push(...attachments);
  renderAttachPreview();
}

function renderAttachPreview() {
  if (!attachPreviewEl) return;
  attachPreviewEl.innerHTML = '';
  if (!pendingAttachments.length) {
    attachPreviewEl.style.display = 'none';
    return;
  }
  attachPreviewEl.style.display = 'flex';
  pendingAttachments.forEach((a, idx) => {
    if (a.type !== 'image') return;
    const item = document.createElement('div');
    item.className = 'attachItem';
    const img = document.createElement('img');
    img.src = a.src;
    img.alt = a.name || 'image';
    const btn = document.createElement('button');
    btn.className = 'attachRemove';
    btn.type = 'button';
    btn.title = 'Remove';
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      pendingAttachments.splice(idx, 1);
      renderAttachPreview();
    });
    item.appendChild(img);
    item.appendChild(btn);
    attachPreviewEl.appendChild(item);
  });
}

async function detectDefaultCategory() {
  try {
    const res = await window.app?.getProvider?.();
    const p = (res?.provider || 'shell').toLowerCase();
    providerName = p;
    if (p === 'snow' || p === 'snowflake') return CATEGORY_SNOW;
    if (p === 'openai') return CATEGORY_CORTEX;
    return CATEGORY_CLI;
  } catch {
    return CATEGORY_CLI;
  }
}

async function initApp() {
  initTheme();
  defaultCategory = await detectDefaultCategory();
  selectedCategory = defaultCategory;
  try {
    const cfg = await window.app?.getConfig?.();
    if (cfg?.provider) providerName = String(cfg.provider).toLowerCase();
    if (cfg?.wsUrl) wsUrl = String(cfg.wsUrl);
    if (cfg?.httpSessionUrl) httpSessionUrl = String(cfg.httpSessionUrl);
    if (Array.isArray(cfg?.wsProtocols)) wsProtocols = cfg.wsProtocols.slice();
  } catch {}
  initFolders();
  ensureSession();
  renderHistory();
  // show home by default
  if (homeEl && inputRowEl && messagesEl) {
    homeEl.style.display = 'flex';
    messagesEl.style.display = 'none';
    inputRowEl.style.display = 'none';
    isHome = true;
  } else {
    render();
    inputEl.focus();
  }
}

initApp();

function isWsProvider() {
  const p = (providerName || '').toLowerCase();
  return p === 'ws' || p === 'websocket' || p === 'cortexws' || p === 'cortex_ws' || p === 'cortex';
}

async function sendViaWebSocket() {
  return new Promise((resolve, reject) => {
    // Strategy:
    // 1) If httpSessionUrl exists, create a session first and use returned websocket_url.
    // 2) Else, fall back to configured wsUrl.
    const createSessionIfPossible = async () => {
      if (!httpSessionUrl) return null;
      try {
        const lastUser = [...conversation].reverse().find(m => m.role === 'user')?.content || '';
        const payload = { messages: [{ role: 'user', content: lastUser }] };
        const res = await fetch(httpSessionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`Session create failed: ${res.status} ${t}`);
        }
        const json = await res.json();
        if (json?.session_id) remoteSessionId = String(json.session_id);
        if (json?.websocket_url) remoteSessionWsUrl = String(json.websocket_url);
        return remoteSessionWsUrl || null;
      } catch (e) {
        console.error('Session create error', e);
        errorEl.textContent = e?.message || 'Failed to create session';
        return null;
      }
    };

    let assistantIndex = -1;
    let closed = false;
    let ws;
    let targetUrl = '';
    let queuedInput = '';

    const openSocket = async () => {
      // If we already have an open socket, reuse it (don't recreate session)
      if (activeWs && activeWs.readyState === WebSocket.OPEN) {
        ws = activeWs;
        targetUrl = activeWsUrl || 'ws://127.0.0.1:8765';
        try { console.log('WS reuse open', targetUrl); } catch {}
        // Stream into a fresh assistant bubble and rebind message handler so chunks
        // append to THIS assistant message instead of the first one.
        assistantIndex = conversation.push({ role: 'assistant', content: '', id: uid(), createdAt: Date.now() }) - 1;
        render();
        ws.onmessage = (evt) => {
          let data = evt.data;
          let textChunk = '';
          try {
            const parsed = JSON.parse(data);
            if (parsed && typeof parsed === 'object') {
              if (parsed.type === 'output') {
                const inner = parsed.content;
                if (typeof inner === 'string') {
                  try {
                    const innerObj = JSON.parse(inner);
                    if (innerObj?.type === 'event') {
                      const d = innerObj.data || {};
                      if (d.type === 'text' && typeof d.content === 'string') {
                        textChunk = d.content;
                      } else if (d.type === 'status') {
                        const sVal = String(d.status || d.content || '').toLowerCase();
                        if (sVal.includes('thinking')) addEphemeral('thinking');
                        else if (sVal.includes('completed') || sVal.includes('done')) { addEphemeral('completed'); if (assistantIndex >= 0) { conversation[assistantIndex].done = true; render(); } }
                        else {
                          const m = String(d.content || '').match(/^([\w\-]+):\s*running/i);
                          if (m) addEphemeral(m[1]);
                        }
                        return;
                      }
                    } else {
                      textChunk = inner;
                    }
                  } catch {
                    textChunk = inner;
                  }
                }
              } else if (parsed.type === 'text' && typeof parsed.content === 'string') {
                textChunk = parsed.content;
              }
            }
          } catch {
            textChunk = typeof data === 'string' ? data : '';
          }
          if (textChunk) handleTextOnly(textChunk);
        };
        const lastUser = [...conversation].reverse().find(m => m.role === 'user')?.content || '';
        const payload = { type: 'input', content: lastUser };
        try { ws.send(JSON.stringify(payload)); } catch (err) { console.error('WS send failed', err); }
        return;
      }

      // Prefer existing session websocket if we have one
      let sessionUrl = remoteSessionWsUrl;
      if (!sessionUrl) {
        sessionUrl = await createSessionIfPossible();
      }
      targetUrl = sessionUrl || wsUrl || 'ws://127.0.0.1:8765';
      try {
        try { console.log('WS connecting', targetUrl); } catch {}
        ws = (wsProtocols && wsProtocols.length) ? new WebSocket(targetUrl, wsProtocols) : new WebSocket(targetUrl);
        activeWs = ws;
        activeWsUrl = targetUrl;
      } catch (e) {
        errorEl.textContent = `Unable to open WebSocket: ${targetUrl}`;
        return reject(e);
      }

      ws.onopen = () => {
        try { console.log('WS open', targetUrl); } catch {}
        // Create a placeholder assistant message to stream into
        assistantIndex = conversation.push({ role: 'assistant', content: '', id: uid(), createdAt: Date.now() }) - 1;
        const s = getCurrentSession();
        if (s) {
          s.messages = [...conversation];
          s.updatedAt = Date.now();
          saveSessions();
        }
        render();
        // Queue the latest user input; send after connection_established
        queuedInput = [...conversation].reverse().find(m => m.role === 'user')?.content || '';
        // Fallback: if connection_established doesn't arrive soon, send anyway
        setTimeout(() => {
          if (queuedInput) {
            try { ws.send(JSON.stringify({ type: 'input', content: queuedInput })); queuedInput = ''; } catch (err) { console.error('WS send failed (timeout)', err); }
          }
        }, 2000);
      };
      ws.onmessage = (evt) => {
        let data = evt.data;
        try { console.log('WS message', data); } catch {}
        let textChunk = '';
        // Try to parse various shapes shown in the sample logs
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object') {
            if (parsed.type === 'connection_established') {
              if (queuedInput) {
                try { ws.send(JSON.stringify({ type: 'input', content: queuedInput })); } catch (err) { console.error('WS send failed', err); }
                queuedInput = '';
              }
            }
            if (parsed.type === 'output') {
              const inner = parsed.content;
              if (typeof inner === 'string') {
                try {
                  const innerObj = JSON.parse(inner);
                  if (innerObj?.type === 'event') {
                    const d = innerObj.data || {};
                    if (d.type === 'text' && typeof d.content === 'string') {
                      textChunk = d.content;
                    } else if (d.type === 'status') {
                      const sVal = String(d.status || d.content || '').toLowerCase();
                      if (sVal.includes('thinking')) addEphemeral('thinking');
                      else if (sVal.includes('completed') || sVal.includes('done')) { addEphemeral('completed'); if (assistantIndex >= 0 && conversation[assistantIndex]) { conversation[assistantIndex].done = true; render(); } }
                      else {
                        const m = String(d.content || '').match(/^([\w\-]+):\s*running/i);
                        if (m) addEphemeral(m[1]);
                      }
                      // Do not treat status text as answer
                      textChunk = '';
                    }
                  } else {
                    textChunk = inner;
                  }
                } catch {
                  textChunk = inner;
                }
              }
            } else if (parsed.type === 'text' && typeof parsed.content === 'string') {
              textChunk = parsed.content;
            }
          }
        } catch {
          // Not JSON; treat as raw chunk
          textChunk = typeof data === 'string' ? data : '';
        }
        if (textChunk) handleTextOnly(textChunk);
      };
      ws.onerror = (e) => {
        if (!closed) {
          errorEl.textContent = `WebSocket error: ${targetUrl}`;
          console.error('WebSocket error', e);
        }
      };
      ws.onclose = (evt) => {
        closed = true;
        if (evt && evt.code !== 1000) {
          const reason = (evt.reason && String(evt.reason).trim()) || 'connection closed';
          errorEl.textContent = `WebSocket closed (${evt.code}): ${reason} @ ${targetUrl}`;
          console.error('WebSocket close', evt.code, reason);
        }
        if (activeWs === ws) {
          activeWs = null;
          activeWsUrl = '';
        }
        if (assistantIndex >= 0 && conversation[assistantIndex]) {
          conversation[assistantIndex].done = true;
          render();
        }
        resolve();
      };
    };

    openSocket();

    function appendTextChunk(chunk) {
      if (assistantIndex < 0) return;
      const msg = conversation[assistantIndex];
      msg.content = (msg.content || '') + chunk;
      const s = getCurrentSession();
      if (s) {
        s.messages = [...conversation];
        s.updatedAt = Date.now();
        saveSessions();
      }
      render();
    }

    function addChip(label) {
      if (assistantIndex < 0 || !label) return;
      const msg = conversation[assistantIndex];
      if (!Array.isArray(msg.chips)) msg.chips = [];
      const clean = String(label).trim();
      if (!clean) return;
      // Avoid immediate duplicates
      if (msg.chips[msg.chips.length - 1] === clean) return;
      msg.chips.push(clean);
      const s = getCurrentSession();
      if (s) {
        s.messages = [...conversation];
        s.updatedAt = Date.now();
        saveSessions();
      }
      render();
    }

    function addEphemeral(label) {
      if (assistantIndex < 0 || !label) return;
      const msg = conversation[assistantIndex];
      const clean = String(label || '').trim();
      if (!clean) return;
      let arr = ephemeralByMessage.get(msg);
      if (!arr) {
        arr = [];
        ephemeralByMessage.set(msg, arr);
      }
      const id = uid();
      arr.push({ id, label: clean, at: Date.now() });
      try { console.log('ephemeral:', clean); } catch {}
      render();
      setTimeout(() => {
        const list = ephemeralByMessage.get(msg);
        if (!list) return;
        const idx = list.findIndex(x => x.id === id);
        if (idx !== -1) {
          list.splice(idx, 1);
          render();
        }
      }, 4200);
    }

    // Append text chunks, but siphon known status strings into ephemeral pills
    function handleTextOnly(raw) {
      let s = String(raw ?? '');
      const rules = [
        { re: /Agent is thinking\.\.\./gi, label: 'thinking' },
        { re: /Agent response completed/gi, label: 'completed' },
        { re: /\b([\w\-]+):\s*running\b/gi, labelFrom: (m) => m[1] },
        { re: /\bstdio_message_loop\b/gi, label: 'stdio' }
      ];
      let consumed = false;
      rules.forEach(r => {
        const matches = [...s.matchAll(r.re)];
        if (matches.length) {
          consumed = true;
          matches.forEach(m => addEphemeral(r.labelFrom ? r.labelFrom(m) : r.label));
          s = s.replace(r.re, '');
        }
      });
      if (s) appendTextChunk(s);
    }
  });
}

function initFolders() {
  const groups = Array.from(document.querySelectorAll('.historyGroup'));
  const saved = loadFoldersState();
  for (const g of groups) {
    const cat = g.getAttribute('data-cat');
    if (saved[cat]) g.classList.add('collapsed');
    const header = g.querySelector('.historyHeader.clickable');
    if (header) {
      header.addEventListener('click', () => {
        g.classList.toggle('collapsed');
        selectedCategory =
          (cat === 'snow') ? CATEGORY_SNOW :
          (cat === 'cortex') ? CATEGORY_CORTEX :
          (cat === 'ide') ? CATEGORY_IDE :
          (cat === 'projects') ? CATEGORY_PROJECTS :
          CATEGORY_CLI;
        saveFoldersState(groups);
      });
      const addBtn = g.querySelector('.groupNew');
      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const category =
            (cat === 'snow') ? CATEGORY_SNOW :
            (cat === 'cortex') ? CATEGORY_CORTEX :
            (cat === 'ide') ? CATEGORY_IDE :
            (cat === 'projects') ? CATEGORY_PROJECTS :
            CATEGORY_CLI;
          createSession(category);
          showChat();
          inputEl.focus();
        });
      }
    }
  }
}

function loadFoldersState() {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return typeof obj === 'object' && obj ? obj : {};
  } catch {
    return {};
  }
}

function saveFoldersState(groups) {
  const state = {};
  for (const g of groups) {
    const cat = g.getAttribute('data-cat');
    state[cat] = g.classList.contains('collapsed');
  }
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(state)); } catch {}
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function timeAgo(ts) {
  const diff = Date.now() - (ts || Date.now());
  const sec = Math.round(diff / 1000);
  if (sec < 60) return sec + 's ago';
  const min = Math.round(sec / 60);
  if (min < 60) return min + 'm ago';
  const hrs = Math.round(min / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.round(hrs / 24);
  return days + 'd ago';
}

function deleteSession(id) {
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  const deletingCurrent = sessions[idx].id === currentSessionId;
  sessions.splice(idx, 1);
  if (!sessions.length) {
    createSession();
  } else if (deletingCurrent) {
    currentSessionId = sessions[0].id;
    conversation.splice(0, conversation.length, ...sessions[0].messages);
  }
  saveSessions();
  renderHistory();
  render();
}

// Minimal home actions
if (document.getElementById('homeNew')) {
  document.getElementById('homeNew').addEventListener('click', () => {
    createSession();
    isHome = false;
    if (homeEl) homeEl.style.display = 'none';
    if (messagesEl) messagesEl.style.display = 'flex';
    if (inputRowEl) inputRowEl.style.display = 'grid';
    render();
    inputEl.focus();
  });
}
if (document.getElementById('homeOpen')) {
  document.getElementById('homeOpen').addEventListener('click', () => {
    ensureSession();
    isHome = false;
    if (homeEl) homeEl.style.display = 'none';
    if (messagesEl) messagesEl.style.display = 'flex';
    if (inputRowEl) inputRowEl.style.display = 'grid';
    render();
    inputEl.focus();
  });
}

if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    showHome();
  });
}


