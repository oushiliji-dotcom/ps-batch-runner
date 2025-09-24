const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
// ... existing code ...

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // 关键：启用 Node 集成与关闭隔离，确保 renderer.js 能使用 require('electron')
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // 关键：加载 web/index.html（而不是任何 http://localhost）
  win.loadFile(path.join(__dirname, 'web', 'index.html'));

  // 可选：调试
  // win.webContents.openDevTools();
}
// ... existing code ...
app.whenReady().then(createWindow);
// ... existing code ...
