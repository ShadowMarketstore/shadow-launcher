const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shadowAPI', {
  scanProducts: () => ipcRenderer.invoke('scan-products'),
  executeScripts: (files) => ipcRenderer.invoke('execute-scripts', files),
  restartPC: () => ipcRenderer.invoke('restart-pc'),
  openScriptsFolder: () => ipcRenderer.invoke('open-scripts-folder')
});
