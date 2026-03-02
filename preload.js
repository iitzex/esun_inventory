const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  listInventory: () => ipcRenderer.invoke('list-inventory'),
  readInventory: (filename) => ipcRenderer.invoke('read-inventory', filename),
  downloadInventory: () => ipcRenderer.invoke('download-inventory'),
  readBalance: (filename) => ipcRenderer.invoke('read-balance', filename),
  saveSelfTxt: (content) => ipcRenderer.invoke('save-self-txt', content),
  getHomeInfo: () => ipcRenderer.invoke('get-home-info'),
  getNewsInfo: () => ipcRenderer.invoke('get-news-info')
});
