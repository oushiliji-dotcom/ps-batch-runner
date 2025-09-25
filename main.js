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

// 向渲染进程发送日志
function sendLog(message) {
  console.log('[MAIN]', message); // 同时输出到控制台用于调试
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.send('log-message', message);
    } catch (e) {
      console.error('发送日志失败:', e);
    }
  }
}

// 递归扫描目录，获取所有文件夹名称和文件信息
function scanInputDirectory(inputDir) {
  const result = {
    folderNames: [],
    totalFolders: 0,
    totalFiles: 0,
    imageFiles: 0
  };
  
  function scanRecursive(dir) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          result.folderNames.push(item.name);
          result.totalFolders++;
          const subDir = path.join(dir, item.name);
          scanRecursive(subDir);
        } else if (item.isFile()) {
          result.totalFiles++;
          // 检查是否为图像文件
          if (/\.(jpg|jpeg|png|tif|tiff|psd)$/i.test(item.name)) {
            result.imageFiles++;
          }
        }
      }
    } catch (e) {
      sendLog(`⚠️ 扫描目录失败: ${dir} - ${e.message}`);
    }
  }
  
  scanRecursive(inputDir);
  return result;
}

// 根据文件夹名称决定使用哪个 JSX 脚本
function selectJSXScript(folderNames, jsxDir) {
  const targetFolderNames = ['M001MT','M002MT','W013GZ','W003MM','W013LS','M013MT','W013LM','W036MZ','W003MN','C013SS','C012SS','W003SS','W034MW','W011MW','W011MR','W033BM','W011MB','W013SS','W034MW','A012SS','A010MZ','W010MZ','A012MS','A013MS','A037MS','W013WZ','W058MH','M003MT','A013BZ','W034ML','W010BM','W010LZ','A013WZ','P013WZ','A050DA','A050DB','A050DC','C086MU','M013ST','A060MB','A060MC','A060ME','A050DG','A060MG','A060MA','A050CB','A050CA','A050AA','A050AB','A060MH','A060MI','P003OL','M023AT','M023BT','M024BT','M024CT','M024MT','M056MT','M109AT','M109MT','M115MT','W032BT','W032BM','W058MV','W010MM','A060MD','M029MS','W012TA','W012TB','W012TC','A013SA','W003LS','A060AC','W121MA','W121MS','A060ML'];
  
  const matchedFolders = folderNames.filter(name => targetFolderNames.includes(name));
  const scriptPath = path.join(jsxDir, 'batch-template.jsx');
  
  if (fs.existsSync(scriptPath)) {
    return {
      script: scriptPath,
      description: matchedFolders.length > 0 ? '专用批处理脚本' : '通用批处理脚本',
      matchedFolders: matchedFolders
    };
  }
  
  return null;
}

// IPC 处理器
ipcMain.handle('get-config', () => readConfig());
ipcMain.handle('save-config', (event, config) => { writeConfig(config); return { ok: true }; });

ipcMain.handle('run-photoshop', async (event, config) => {
  const { photoshopPath, inputDir, outputDir, rulesJsonPath } = config;
  
  sendLog('=== 开始执行 Photoshop 批处理 ===');
  sendLog(`时间: ${new Date().toLocaleString()}`);
  sendLog(`配置参数:`);
  sendLog(`  Photoshop路径: ${photoshopPath}`);
  sendLog(`  输入目录: ${inputDir}`);
  sendLog(`  输出目录: ${outputDir}`);
  sendLog(`  规则JSON: ${rulesJsonPath || '(未设置)'}`);
  
  if (!photoshopPath || !inputDir || !outputDir) {
    const msg = '❌ 缺少必要参数：photoshopPath / inputDir / outputDir';
    sendLog(msg);
    return { ok: false, msg };
  }

  // 文件和目录检查
  sendLog('\n📋 检查文件和目录...');
  
  try {
    if (!fs.existsSync(photoshopPath)) {
      const msg = `❌ Photoshop.exe 不存在: ${photoshopPath}`;
      sendLog(msg);
      return { ok: false, msg };
    }
    sendLog(`✅ Photoshop.exe 存在`);
    
    if (!fs.existsSync(inputDir)) {
      const msg = `❌ 输入目录不存在: ${inputDir}`;
      sendLog(msg);
      return { ok: false, msg };
    }
    sendLog(`✅ 输入目录存在`);
    
    // 检查输出目录
    if (!fs.existsSync(outputDir)) {
      sendLog(`⚠️ 输出目录不存在，尝试创建: ${outputDir}`);
      try {
        fs.mkdirSync(outputDir, { recursive: true });
        sendLog(`✅ 输出目录创建成功`);
      } catch (e) {
        const msg = `❌ 无法创建输出目录: ${e.message}`;
        sendLog(msg);
        return { ok: false, msg };
      }
    } else {
      sendLog(`✅ 输出目录存在`);
    }
    
  } catch (e) {
    const msg = `❌ 文件检查过程中出错: ${e.message}`;
    sendLog(msg);
    return { ok: false, msg };
  }

  // 扫描输入目录
  sendLog('\n📁 扫描输入目录...');
  const scanResult = scanInputDirectory(inputDir);
  sendLog(`📊 扫描结果:`);
  sendLog(`  总文件夹数: ${scanResult.totalFolders}`);
  sendLog(`  总文件数: ${scanResult.totalFiles}`);
  sendLog(`  图像文件数: ${scanResult.imageFiles}`);
  sendLog(`  发现的文件夹: ${scanResult.folderNames.slice(0, 10).join(', ')}${scanResult.folderNames.length > 10 ? '...' : ''}`);
  
  // 选择脚本
  sendLog('\n🔍 选择处理脚本...');
  const jsxDir = path.join(__dirname, 'jsx');
  const selectedScript = selectJSXScript(scanResult.folderNames, jsxDir);
  
  if (!selectedScript) {
    const msg = '❌ 未找到合适的 JSX 脚本';
    sendLog(msg);
    return { ok: false, msg };
  }
  
  sendLog(`✅ 选择脚本: ${path.basename(selectedScript.script)}`);
  sendLog(`   描述: ${selectedScript.description}`);
  if (selectedScript.matchedFolders.length > 0) {
    sendLog(`   匹配的文件夹 (${selectedScript.matchedFolders.length}个): ${selectedScript.matchedFolders.join(', ')}`);
  } else {
    sendLog(`   使用通用处理模式`);
  }

  // 创建日志文件用于 JSX 脚本输出
  const logFile = path.join(dataDir, 'ps-log.txt');
  try {
    fs.writeFileSync(logFile, `开始处理: ${new Date().toISOString()}\n`);
  } catch (e) {
    sendLog(`⚠️ 无法创建日志文件: ${e.message}`);
  }

  sendLog('\n🚀 启动 Photoshop 进程...');
  
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PS_INPUT_DIR: inputDir,
      PS_OUTPUT_DIR: outputDir,
      PS_RULES_JSON: rulesJsonPath || '',
      PS_LOG_FILE: logFile,
      PS_TOTAL_IMAGES: scanResult.imageFiles.toString()
    });

    sendLog(`🔧 环境变量设置:`);
    sendLog(`  PS_INPUT_DIR = ${env.PS_INPUT_DIR}`);
    sendLog(`  PS_OUTPUT_DIR = ${env.PS_OUTPUT_DIR}`);
    sendLog(`  PS_RULES_JSON = ${env.PS_RULES_JSON}`);
    sendLog(`  PS_LOG_FILE = ${env.PS_LOG_FILE}`);
    sendLog(`  PS_TOTAL_IMAGES = ${env.PS_TOTAL_IMAGES}`);
    
    sendLog(`\n▶️ 执行命令: "${photoshopPath}" "${selectedScript.script}"`);

    const child = spawn(photoshopPath, [selectedScript.script], {
      env,
      windowsHide: false,
      detached: false,
    });

    let stdout = '', stderr = '';
    let processedCount = 0;
    
    // 监控日志文件变化
    let logWatcher = null;
    try {
      logWatcher = fs.watchFile(logFile, { interval: 1000 }, () => {
        try {
          const content = fs.readFileSync(logFile, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          const newLines = lines.slice(processedCount);
          newLines.forEach(line => {
            if (line.trim()) {
              sendLog(`[PS] ${line}`);
            }
          });
          processedCount = lines.length;
        } catch (e) {
          // 忽略读取错误
        }
      });
    } catch (e) {
      sendLog(`⚠️ 无法监控日志文件: ${e.message}`);
    }
    
    child.stdout && child.stdout.on('data', d => {
      const data = d.toString().trim();
      if (data) {
        stdout += data + '\n';
        sendLog(`[STDOUT] ${data}`);
      }
    });
    
    child.stderr && child.stderr.on('data', d => {
      const data = d.toString().trim();
      if (data) {
        stderr += data + '\n';
        sendLog(`[STDERR] ${data}`);
      }
    });

    child.on('error', (err) => {
      const msg = `❌ 进程启动失败: ${err.message}`;
      sendLog(msg);
      if (logWatcher) fs.unwatchFile(logFile);
      resolve({ ok: false, error: String(err), stdout, stderr });
    });

    child.on('close', (code) => {
      if (logWatcher) fs.unwatchFile(logFile);
      
      // 读取最终日志
      try {
        const finalContent = fs.readFileSync(logFile, 'utf8');
        const finalLines = finalContent.split('\n').filter(line => line.trim());
        const remainingLines = finalLines.slice(processedCount);
        remainingLines.forEach(line => {
          if (line.trim()) {
            sendLog(`[PS] ${line}`);
          }
        });
      } catch (e) {
        // 忽略
      }
      
      sendLog(`\n🏁 Photoshop 进程结束`);
      sendLog(`   退出码: ${code}`);
      sendLog(`   处理时间: ${new Date().toLocaleString()}`);
      
      if (code === 0) {
        sendLog('✅ 处理完成');
      } else {
        sendLog(`❌ 处理失败，退出码: ${code}`);
        if (stderr) {
          sendLog(`错误输出: ${stderr}`);
        }
      }
      sendLog('=== 执行结束 ===\n');
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
  
  // 调试：窗口加载完成后发送测试日志
  mainWindow.webContents.once('did-finish-load', () => {
    sendLog('应用启动完成，日志系统就绪');
  });
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
