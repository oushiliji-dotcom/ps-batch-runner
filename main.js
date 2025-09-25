const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3017;
const URL = `http://localhost:${PORT}`;

let mainWindow = null;

// 防止 server.js 自动打开系统浏览器
process.env.AUTO_OPEN = '0';
// 尝试启动内置服务（express）
try {
  require(path.join(__dirname, 'server.js'));
  // 如果 server.js 内部已经监听，会直接复用
} catch (e) {
  console.error('[main] 启动内置 server.js 失败:', e);
}

// 等待服务就绪
function waitForServer(url, timeoutMs = 20000, intervalMs = 300) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, res => {
        // 任意 2xx/3xx 视为可用
        if (res.statusCode && res.statusCode < 400) {
          res.resume();
          resolve();
        } else {
          res.resume();
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Server not ready, status=${res.statusCode}`));
          } else {
            setTimeout(tryOnce, intervalMs);
          }
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Server not ready (conn error)'));
        else setTimeout(tryOnce, intervalMs);
      });
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    }
  });

  waitForServer(URL)
    .then(() => {
      mainWindow.loadURL(URL);
      mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
      // 如需调试请取消注释
      // mainWindow.webContents.openDevTools({ mode: 'detach' });
    })
    .catch(err => {
      console.error('[main] 服务未就绪:', err);
      // 显示一个简单错误页，避免纯白
      const html = `<html><body style="font-family:system-ui;padding:24px">
        <h2>服务启动失败</h2>
        <p>未能连接到 ${URL}</p>
        <pre>${String(err)}</pre>
      </body></html>`;
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      mainWindow.show();
    });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// 单实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
