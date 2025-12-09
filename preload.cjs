const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	sendChat: (messages, model) => ipcRenderer.invoke('chat:send', { messages, model })
});

contextBridge.exposeInMainWorld('app', {
	getProvider: () => ipcRenderer.invoke('app:getProvider'),
	saveImage: (arrayBuffer, ext) => ipcRenderer.invoke('fs:saveImage', { data: Buffer.from(arrayBuffer), ext })
});


