const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
const DATA_DIR = path.join(app.getPath('userData'), 'ps-batch-runner');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
ensureDir(DATA_DIR);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
  // 如需调试可打开：mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// IPC：读取/保存配置
ipcMain.handle('read-config', async () => {
  try { return fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {}; }
  catch (e) { return {}; }
});
ipcMain.handle('save-config', async (_e, cfg) => {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

// 选择目录/文件
ipcMain.handle('select-directory', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('select-file', async (_e, options = {}) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || []
  });
  return r.canceled ? null : r.filePaths[0];
});

// 运行批处理（调用 Photoshop 执行 JSX）
ipcMain.handle('run-batch', async (_e, cfg) => {
  return new Promise(resolve => {
    try {
      const { photoshopPath, jsxPath, inputDir, outputDir, rulesJsonPath } = cfg || {};
      if (!photoshopPath || !jsxPath || !inputDir || !outputDir) {
        return resolve({ success: false, error: '缺少必要参数' });
      }
      const env = Object.assign({}, process.env, {
        PS_INPUT_DIR: inputDir,
        PS_OUTPUT_DIR: outputDir,
        PS_RULES_JSON: rulesJsonPath || ''
      });
      const child = spawn(photoshopPath, [jsxPath], { env, windowsHide: false });
      child.on('error', err => resolve({ success: false, error: String(err) }));
      child.on('close', code => resolve({ success: code === 0, code }));
    } catch (e) {
      resolve({ success: false, error: String(e) });
    }
  });
});
