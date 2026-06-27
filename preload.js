const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rtlApp', {
  onClipboardUpdate: (callback) => {
    ipcRenderer.on('clipboard-update', (_event, payload) => callback(payload));
  },
  onMonitoringChanged: (callback) => {
    ipcRenderer.on('monitoring-changed', (_event, active) => callback(active));
  },
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  getMonitoring: () => ipcRenderer.invoke('get-monitoring'),
  setMonitoring: (value) => ipcRenderer.invoke('set-monitoring', value),
  openMonitoringSettings: () => ipcRenderer.invoke('open-monitoring-settings'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  snapLayout: () => ipcRenderer.invoke('snap-layout'),
});