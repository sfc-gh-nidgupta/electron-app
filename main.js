import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join, dirname } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { chatWithShell } from './providers/shell.js';
import { chatWithOpenAI } from './providers/openai.js';
import { chatWithSnowflake } from './providers/snowflake.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;

function getProvider() {
  return (process.env.PROVIDER || 'shell').toLowerCase();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: 'ElectronChat',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.removeMenu();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createMainWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('chat:send', async (_event, payload) => {
  const { messages, model } = payload || {};
  const provider = getProvider();
  if (provider === 'shell') {
    return await chatWithShell(messages || []);
  }
  if (provider === 'snow' || provider === 'snowflake') {
    return await chatWithSnowflake(messages || [], model);
  }
  return await chatWithOpenAI(messages || [], model);
});

ipcMain.handle('app:getProvider', async () => {
  return { provider: getProvider() };
});

ipcMain.handle('fs:saveImage', async (_event, payload) => {
  const { data, ext } = payload || {};
  if (!data) throw new Error('No image data provided');
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const safeExt = (ext && String(ext).toLowerCase().includes('png')) ? 'png'
    : (ext && String(ext).toLowerCase().includes('jpg')) ? 'jpg'
    : (ext && String(ext).toLowerCase().includes('jpeg')) ? 'jpeg'
    : (ext && String(ext).toLowerCase().includes('webp')) ? 'webp'
    : 'png';
  const baseDir = join(app.getPath('userData'), 'attachments');
  await mkdir(baseDir, { recursive: true });
  const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${safeExt}`;
  const filePath = join(baseDir, filename);
  await writeFile(filePath, buffer);
  return { path: filePath };
});


