import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  sendChat: (messages, model) => ipcRenderer.invoke('chat:send', { messages, model })
});


