const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	sendChat: (messages, model) => ipcRenderer.invoke('chat:send', { messages, model })
});


