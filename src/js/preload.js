const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  listInventory: () => ipcRenderer.invoke('list-inventory'),
  readInventory: (filename) => ipcRenderer.invoke('read-inventory', filename),
  downloadInventory: () => ipcRenderer.invoke('download-inventory'),
  saveSelfTxt: (content) => ipcRenderer.invoke('save-self-txt', content),
  getHomeInfo: () => ipcRenderer.invoke('get-home-info'),
  getNewsInfo: (range) => ipcRenderer.invoke('get-news-info', range),
});
