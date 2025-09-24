const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

// 数据目录配置
const userHome = os.homedir();
const appDataRoot = process.platform === 'win32'
  ? (process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming'))
  : path.join(userHome, '.config');
const dataDir = path.join(appDataRoot, 'ps-batch-runner');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
}

const CONFIG_PATH = path.join(dataDir, 'config.json');

// 配置文件操作
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

function writeConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { console.error('写入配置失败:', e); }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 加载本地HTML文件
  mainWindow.loadFile('web/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 处理程序
ipcMain.handle('get-config', () => {
  return readConfig();
});

ipcMain.handle('save-config', (event, config) => {
  writeConfig(config);
  return { ok: true };
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('run-batch', async (event, config) => {
  return new Promise((resolve) => {
    const { photoshopPath, jsxPath, inputDir, outputDir, rulesJsonPath } = config;

    if (!photoshopPath || !jsxPath || !inputDir || !outputDir) {
      resolve({ ok: false, msg: '缺少必要参数：photoshopPath / jsxPath / inputDir / outputDir' });
      return;
    }

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
