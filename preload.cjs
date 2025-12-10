const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
	sendChat: (messages, model) => ipcRenderer.invoke('chat:send', { messages, model })
});

contextBridge.exposeInMainWorld('app', {
	getProvider: () => ipcRenderer.invoke('app:getProvider'),
	saveImage: (arrayBuffer, ext) => ipcRenderer.invoke('fs:saveImage', { data: Buffer.from(arrayBuffer), ext }),
	transcribeAudio: (arrayBuffer, mime) => ipcRenderer.invoke('audio:transcribe', { data: Buffer.from(arrayBuffer), mime }),
	copyToClipboard: (text) => {
		try {
			clipboard.writeText(String(text ?? ''), 'clipboard');
			return true;
		} catch {
			return false;
		}
	}
});


