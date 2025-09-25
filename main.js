const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3017;
const URL = `http://localhost:${PORT}`;

let mainWindow = null;

// 阻止 server.js 自动打开系统浏览器
process.env.AUTO_OPEN = '0';
// 启动内置服务
try {
  require(path.join(__dirname, 'server.js'));
} catch (e) {
  console.error('[main] 启动内置 server.js 遇到异常:', e);
}

function waitForServer(url, timeoutMs = 20000, intervalMs = 300) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, res => {
        if (res.statusCode && res.statusCode < 400) { res.resume(); resolve(); }
        else { res.resume(); Date.now() - start > timeoutMs ? reject(new Error(`Server not ready, status=${res.statusCode}`)) : setTimeout(tryOnce, intervalMs); }
      });
      req.on('error', () => { Date.now() - start > timeoutMs ? reject(new Error('Server not ready (conn error)')) : setTimeout(tryOnce, intervalMs); });
      req.end();
    };
    tryOnce();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, devTools: true }
  });

  waitForServer(URL)
    .then(() => {
      mainWindow.loadURL(URL);
      mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
    })
    .catch(err => {
      console.error('[main] 等待服务失败:', err);
      const html = `<html><body style="font-family:system-ui;padding:24px">
        <h2>服务启动失败</h2><p>未能连接到 ${URL}</p><pre>${String(err)}</pre></body></html>`;
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      mainWindow.show();
    });

  mainWindow.on('closed', () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
