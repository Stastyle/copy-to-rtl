const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitoringSettings', {
  getApps: () => ipcRenderer.invoke('get-monitored-apps'),
  saveApps: (apps) => ipcRenderer.invoke('set-monitored-apps', apps),
  close: () => ipcRenderer.invoke('close-monitoring-settings'),
});