const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const errorEl = document.getElementById('error');
const modelEl = document.getElementById('model');
const clearBtn = document.getElementById('clear');
const runIndicatorEl = document.getElementById('runIndicator');
const historyCliEl = document.getElementById('history-cli');
const historySnowEl = document.getElementById('history-snow');
const historyCortexEl = document.getElementById('history-cortex');
const historyIdeEl = document.getElementById('history-ide');
const newChatSidebarBtn = document.getElementById('newChatSidebar');
const themeSwitchEl = document.getElementById('themeSwitch');
const attachBtn = document.getElementById('attach');
const fileInputEl = document.getElementById('fileInput');
const attachPreviewEl = document.getElementById('attachPreview');
const homeEl = document.getElementById('home');
const inputRowEl = document.getElementById('inputRow');
const homeNewBtn = document.getElementById('homeNew');
const homeOpenBtn = document.getElementById('homeOpen');
const homeBtn = document.getElementById('homeBtn');

const STORAGE_KEY = 'electronChat.sessions.v1';
let sessions = [];
let currentSessionId = null;
const conversation = [];
let isRunning = false;
let pendingAttachments = [];
let isHome = true;

// Categories
const CATEGORY_CLI = 'Command Line';
const CATEGORY_SNOW = 'Snowflake CLI';
const CATEGORY_CORTEX = 'Cortex';
const CATEGORY_IDE = 'IDE';
let defaultCategory = CATEGORY_CLI;
let selectedCategory = null;
const FOLDERS_KEY = 'electronChat.folders.v1'; // {cli:true|false, snow:true|false, ...} true = collapsed

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
    case CATEGORY_CLI:
    default: return historyCliEl;
  }
}

function keyFromCategory(category) {
  if (category === CATEGORY_SNOW) return 'snow';
  if (category === CATEGORY_CORTEX) return 'cortex';
  if (category === CATEGORY_IDE) return 'ide';
  return 'cli';
}

function render() {
  if (isHome) {
    return;
  }
  messagesEl.innerHTML = '';
  for (const m of conversation) {
    const bubble = document.createElement('div');
    bubble.className = `message ${m.role}`;
    if (m.role === 'assistant') {
      const pre = document.createElement('pre');
      pre.textContent = m.content;
      bubble.appendChild(pre);
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
    messagesEl.appendChild(bubble);
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
  [historyCliEl, historySnowEl, historyCortexEl, historyIdeEl].forEach(c => { if (c) c.innerHTML = ''; });
  for (const s of sessions) {
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
      currentSessionId = s.id;
      conversation.splice(0, conversation.length, ...s.messages);
      showChat();
      renderHistory();
      render();
      inputEl.focus();
    });
    container.appendChild(item);
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  errorEl.textContent = '';
  setRunning(true);

  conversation.push({ role: 'user', content: text });
  if (pendingAttachments.length) {
    conversation[conversation.length - 1].attachments = pendingAttachments.slice();
  }
  const session = getCurrentSession();
  if (session) {
    session.messages = [...conversation];
    if (!session.title || session.title === 'New chat') {
      const base = text || (pendingAttachments[0]?.name || 'New chat');
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
    const model = modelEl ? (modelEl.value.trim() || undefined) : undefined;
    const result = await window.api.sendChat(conversation, model);
    const content = result?.content ?? '';
    conversation.push({ role: 'assistant', content });
    const s2 = getCurrentSession();
    if (s2) {
      s2.messages = [...conversation];
      s2.updatedAt = Date.now();
      saveSessions();
    }
  } catch (err) {
    errorEl.textContent = err?.message || String(err);
  } finally {
    render();
    setRunning(false);
    inputEl.focus();
  }
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
          CATEGORY_CLI;
        saveFoldersState(groups);
      });
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


