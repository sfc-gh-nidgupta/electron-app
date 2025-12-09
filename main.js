import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { chatWithShell } from './providers/shell.js';
import { chatWithOpenAI } from './providers/openai.js';
import { chatWithSnowflake } from './providers/snowflake.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;

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
  const provider = (process.env.PROVIDER || 'shell').toLowerCase();
  if (provider === 'shell') {
    return await chatWithShell(messages || []);
  }
  if (provider === 'snow' || provider === 'snowflake') {
    return await chatWithSnowflake(messages || [], model);
  }
  return await chatWithOpenAI(messages || [], model);
});


