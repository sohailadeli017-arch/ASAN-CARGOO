const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cargooDB', {
  load: () => ipcRenderer.invoke('db:load'),
  save: (collection, items) => ipcRenderer.invoke('db:save', collection, items)
});
