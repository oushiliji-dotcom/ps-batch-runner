const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 配置相关
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // 文件选择
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  
  // Photoshop运行
  runPhotoshop: (config) => ipcRenderer.invoke('run-photoshop', config),
  
  // 日志监听
  onLogMessage: (callback) => {
    ipcRenderer.on('log-message', (event, message) => callback(message));
  }
});
