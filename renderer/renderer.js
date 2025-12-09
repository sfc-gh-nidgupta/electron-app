const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const errorEl = document.getElementById('error');
const modelEl = document.getElementById('model');
const clearBtn = document.getElementById('clear');
const runIndicatorEl = document.getElementById('runIndicator');
const historyEl = document.getElementById('history');
const newChatSidebarBtn = document.getElementById('newChatSidebar');

const STORAGE_KEY = 'electronChat.sessions.v1';
let sessions = [];
let currentSessionId = null;
const conversation = [];
let isRunning = false;

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

function createSession() {
  const id = uid();
  const now = Date.now();
  const session = { id, title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
  sessions.unshift(session);
  currentSessionId = id;
  conversation.splice(0, conversation.length);
  renderHistory();
  render();
  saveSessions();
}

function ensureSession() {
  sessions = loadSessions();
  if (!sessions.length) {
    createSession();
  } else {
    // ensure updatedAt exists and sort by it
    sessions.forEach(s => { if (!s.updatedAt) s.updatedAt = s.createdAt || Date.now(); });
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    currentSessionId = sessions[0].id;
    conversation.splice(0, conversation.length, ...sessions[0].messages);
  }
}

function getCurrentSession() {
  return sessions.find(s => s.id === currentSessionId);
}

function render() {
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
    messagesEl.appendChild(bubble);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderHistory() {
  if (!historyEl) return;
  historyEl.innerHTML = '';
  for (const s of sessions) {
    const item = document.createElement('div');
    item.className = 'historyItem' + (s.id === currentSessionId ? ' active' : '');
    item.title = new Date(s.updatedAt || s.createdAt).toLocaleString();

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = s.title || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const time = document.createElement('span');
    time.textContent = timeAgo(s.updatedAt || s.createdAt);
    meta.appendChild(document.createElement('span')).textContent = ''; // spacer
    meta.appendChild(time);

    const preview = document.createElement('div');
    preview.className = 'preview';
    const last = (s.messages || []).slice().reverse().find(m => m?.role === 'user');
    preview.textContent = last?.content ? truncate(last.content, 64) : '';

    item.appendChild(title);
    item.appendChild(meta);
    if (preview.textContent) item.appendChild(preview);

    item.addEventListener('click', () => {
      currentSessionId = s.id;
      conversation.splice(0, conversation.length, ...s.messages);
      renderHistory();
      render();
      inputEl.focus();
    });
    historyEl.appendChild(item);
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  errorEl.textContent = '';
  setRunning(true);

  conversation.push({ role: 'user', content: text });
  const session = getCurrentSession();
  if (session) {
    session.messages = [...conversation];
    if (!session.title || session.title === 'New chat') {
      session.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    }
    session.updatedAt = Date.now();
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    saveSessions();
    renderHistory();
  }
  render();

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
  clearBtn.addEventListener('click', clearChat);
}
if (newChatSidebarBtn) {
  newChatSidebarBtn.addEventListener('click', createSession);
}

ensureSession();
renderHistory();
render();
inputEl.focus();

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


