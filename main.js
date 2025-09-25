const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let mainWindow = null;

// 配置文件路径
const userHome = os.homedir();
const appDataRoot = process.platform === 'win32'
  ? (process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming'))
  : path.join(userHome, '.config');
const dataDir = path.join(appDataRoot, 'ps-batch-runner');
const CONFIG_PATH = path.join(dataDir, 'config.json');

// 确保配置目录存在
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
}

// 配置读写函数
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

function writeConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { console.error('写入配置失败:', e); }
}

// IPC 处理器
ipcMain.handle('get-config', () => readConfig());
ipcMain.handle('save-config', (event, config) => { writeConfig(config); return { ok: true }; });

ipcMain.handle('run-photoshop', async (event, config) => {
  const { photoshopPath, jsxPath, inputDir, outputDir, rulesJsonPath } = config;
  
  if (!photoshopPath || !jsxPath || !inputDir || !outputDir) {
    return { ok: false, msg: '缺少必要参数：photoshopPath / jsxPath / inputDir / outputDir' };
  }

  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PS_INPUT_DIR: inputDir,
      PS_OUTPUT_DIR: outputDir,
      PS_RULES_JSON: rulesJsonPath || '',
    });

    const child = spawn(photoshopPath, [jsxPath], {
      env,
      windowsHide: false,
      detached: false,
    });

    let stdout = '', stderr = '';
    child.stdout && child.stdout.on('data', d => stdout += d.toString());
    child.stderr && child.stderr.on('data', d => stderr += d.toString());

    child.on('error', (err) => {
      resolve({ ok: false, error: String(err), stdout, stderr });
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
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
