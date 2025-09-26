const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
const configPath = path.join(__dirname, 'config.json');

// 发送日志到前端
function sendLog(message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('log-message', message);
  }
  console.log('[main]', message);
}

// 读取配置
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    sendLog(`读取配置失败: ${error.message}`);
  }
  return {
    photoshopPath: '',
    jsxPath: '',
    inputDir: '',
    outputDir: '',
    rulesJsonPath: ''
  };
}

// 保存配置
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    sendLog('配置已保存');
    return { success: true };
  } catch (error) {
    sendLog(`保存配置失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 递归扫描目录
function scanInputDirectory(inputDir) {
  const folders = [];
  
  function scanRecursive(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          folders.push(item);
          scanRecursive(fullPath);
        }
      }
    } catch (error) {
      sendLog(`扫描目录失败 ${dir}: ${error.message}`);
    }
  }
  
  scanRecursive(inputDir);
  return folders;
}

// 根据文件夹名称选择JSX脚本
function selectJSXScript(folders, jsxDir) {
  // 脚本选择规则
  const scriptRules = [
    {
      script: 'batch-template.jsx',
      patterns: ['模板', 'template', '批处理', 'batch']
    }
  ];
  
  // 检查是否有匹配的文件夹
  for (const rule of scriptRules) {
    for (const pattern of rule.patterns) {
      if (folders.some(folder => folder.toLowerCase().includes(pattern.toLowerCase()))) {
        const scriptPath = path.join(jsxDir, rule.script);
        if (fs.existsSync(scriptPath)) {
          return scriptPath;
        }
      }
    }
  }
  
  // 默认使用batch-template.jsx
  const defaultScript = path.join(jsxDir, 'batch-template.jsx');
  if (fs.existsSync(defaultScript)) {
    return defaultScript;
  }
  
  return null;
}

// 创建窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    sendLog('应用启动完成');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 处理器
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  return saveConfig(config);
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-file', async (event, filters = []) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('run-photoshop', async (event, config) => {
  return new Promise((resolve) => {
    sendLog('=== 开始Photoshop批处理 ===');
    
    // 参数检查
    if (!config.photoshopPath || !fs.existsSync(config.photoshopPath)) {
      const error = `Photoshop路径无效: ${config.photoshopPath}`;
      sendLog(error);
      return resolve({ success: false, error });
    }
    
    if (!config.inputDir || !fs.existsSync(config.inputDir)) {
      const error = `输入目录无效: ${config.inputDir}`;
      sendLog(error);
      return resolve({ success: false, error });
    }
    
    if (!config.outputDir) {
      const error = '输出目录不能为空';
      sendLog(error);
      return resolve({ success: false, error });
    }
    
    // 创建输出目录
    try {
      if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
        sendLog(`创建输出目录: ${config.outputDir}`);
      }
    } catch (error) {
      const errorMsg = `创建输出目录失败: ${error.message}`;
      sendLog(errorMsg);
      return resolve({ success: false, error: errorMsg });
    }
    
    // 扫描输入目录
    sendLog(`扫描输入目录: ${config.inputDir}`);
    const folders = scanInputDirectory(config.inputDir);
    sendLog(`发现文件夹: ${folders.length}个 - ${folders.join(', ')}`);
    
    // 选择JSX脚本
    let jsxPath = config.jsxPath;
    if (!jsxPath || !fs.existsSync(jsxPath)) {
      const jsxDir = path.join(__dirname, 'jsx');
      jsxPath = selectJSXScript(folders, jsxDir);
      if (!jsxPath) {
        const error = 'JSX脚本路径无效且无法自动选择脚本';
        sendLog(error);
        return resolve({ success: false, error });
      }
      sendLog(`自动选择JSX脚本: ${jsxPath}`);
    } else {
      sendLog(`使用指定JSX脚本: ${jsxPath}`);
    }
    
    // 设置环境变量
    const env = {
      ...process.env,
      PS_INPUT_DIR: config.inputDir,
      PS_OUTPUT_DIR: config.outputDir
    };
    
    if (config.rulesJsonPath && fs.existsSync(config.rulesJsonPath)) {
      env.PS_RULES_JSON = config.rulesJsonPath;
      sendLog(`使用规则文件: ${config.rulesJsonPath}`);
    }
    
    sendLog(`环境变量设置完成`);
    sendLog(`PS_INPUT_DIR: ${env.PS_INPUT_DIR}`);
    sendLog(`PS_OUTPUT_DIR: ${env.PS_OUTPUT_DIR}`);
    
    // 启动Photoshop进程
    const args = ['-r', jsxPath];
    sendLog(`启动Photoshop: ${config.photoshopPath} ${args.join(' ')}`);
    
    const psProcess = spawn(config.photoshopPath, args, {
      env,
      cwd: __dirname
    });
    
    let stdout = '';
    let stderr = '';
    
    psProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      sendLog(`[PS-STDOUT] ${output.trim()}`);
    });
    
    psProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      sendLog(`[PS-STDERR] ${output.trim()}`);
    });
    
    psProcess.on('close', (code) => {
      sendLog(`Photoshop进程结束，退出码: ${code}`);
      
      if (code === 0) {
        sendLog('=== Photoshop批处理完成 ===');
        resolve({
          success: true,
          code,
          stdout,
          stderr,
          message: '处理完成'
        });
      } else {
        sendLog('=== Photoshop批处理失败 ===');
        resolve({
          success: false,
          code,
          stdout,
          stderr,
          error: `Photoshop进程异常退出，代码: ${code}`
        });
      }
    });
    
    psProcess.on('error', (error) => {
      const errorMsg = `启动Photoshop失败: ${error.message}`;
      sendLog(errorMsg);
      resolve({
        success: false,
        error: errorMsg,
        stdout,
        stderr
      });
    });
  });
});

// 应用事件
app.whenReady().then(() => {
  createWindow();
});

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
