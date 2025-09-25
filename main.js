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
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('log-message', message);
  }
}

// 递归扫描目录，获取所有文件夹名称
function scanInputDirectory(inputDir) {
  const folderNames = [];
  
  function scanRecursive(dir) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          folderNames.push(item.name);
          const subDir = path.join(dir, item.name);
          scanRecursive(subDir);
        }
      }
    } catch (e) {
      sendLog(`⚠️ 扫描目录失败: ${dir} - ${e.message}`);
    }
  }
  
  scanRecursive(inputDir);
  return folderNames;
}

// 根据文件夹名称决定使用哪个 JSX 脚本
function selectJSXScript(folderNames, jsxDir) {
  // 定义不同类型的文件夹名称模式和对应的 JSX 脚本
  const scriptRules = [
    {
      name: 'batch-template.jsx',
      description: '默认批处理脚本',
      patterns: ['M001MT', 'M002MT', 'W013GZ', 'W003MM', 'W013LS', 'M013MT', 'W013LM', 'W036MZ', 'W003MN', 'C013SS', 'C012SS', 'W003SS', 'W034MW', 'W011MW', 'W011MR', 'W033BM', 'W011MB', 'W013SS', 'W034MW', 'A012SS', 'A010MZ', 'W010MZ', 'A012MS', 'A013MS', 'A037MS', 'W013WZ', 'W058MH', 'M003MT', 'A013BZ', 'W034ML', 'W010BM', 'W010LZ', 'A013WZ', 'P013WZ', 'A050DA', 'A050DB', 'A050DC', 'C086MU', 'M013ST', 'A060MB', 'A060MC', 'A060ME', 'A050DG', 'A060MG', 'A060MA', 'A050CB', 'A050CA', 'A050AA', 'A050AB', 'A060MH', 'A060MI', 'P003OL', 'M023AT', 'M023BT', 'M024BT', 'M024CT', 'M024MT', 'M056MT', 'M109AT', 'M109MT', 'M115MT', 'W032BT', 'W032BM', 'W058MV', 'W010MM', 'A060MD', 'M029MS', 'W012TA', 'W012TB', 'W012TC', 'A013SA', 'W003LS', 'A060AC', 'W121MA', 'W121MS', 'A060ML']
    }
    // 可以在这里添加更多的脚本规则
    // {
    //   name: 'special-processing.jsx',
    //   description: '特殊处理脚本',
    //   patterns: ['SPECIAL01', 'SPECIAL02']
    // }
  ];
  
  // 检查找到的文件夹名称，匹配对应的脚本
  for (const rule of scriptRules) {
    const matchedFolders = folderNames.filter(name => rule.patterns.includes(name));
    if (matchedFolders.length > 0) {
      const scriptPath = path.join(jsxDir, rule.name);
      if (fs.existsSync(scriptPath)) {
        return {
          script: scriptPath,
          description: rule.description,
          matchedFolders: matchedFolders
        };
      }
    }
  }
  
  // 如果没有匹配的特定脚本，返回默认脚本
  const defaultScript = path.join(jsxDir, 'batch-template.jsx');
  if (fs.existsSync(defaultScript)) {
    return {
      script: defaultScript,
      description: '默认批处理脚本（通用处理）',
      matchedFolders: []
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
  sendLog(`配置参数检查:`);
  sendLog(`  Photoshop路径: ${photoshopPath}`);
  sendLog(`  输入目录: ${inputDir}`);
  sendLog(`  输出目录: ${outputDir}`);
  sendLog(`  规则JSON: ${rulesJsonPath || '(未设置)'}`);
  
  if (!photoshopPath || !inputDir || !outputDir) {
    const msg = '缺少必要参数：photoshopPath / inputDir / outputDir';
    sendLog(`❌ 参数验证失败: ${msg}`);
    return { ok: false, msg };
  }

  // 检查文件和目录是否存在
  sendLog('\n文件和目录检查:');
  
  try {
    if (!fs.existsSync(photoshopPath)) {
      const msg = `Photoshop.exe 不存在: ${photoshopPath}`;
      sendLog(`❌ ${msg}`);
      return { ok: false, msg };
    }
    sendLog(`✅ Photoshop.exe 存在`);
    
    if (!fs.existsSync(inputDir)) {
      const msg = `输入目录不存在: ${inputDir}`;
      sendLog(`❌ ${msg}`);
      return { ok: false, msg };
    }
    sendLog(`✅ 输入目录存在`);
    
    // 检查输出目录，不存在则尝试创建
    if (!fs.existsSync(outputDir)) {
      sendLog(`⚠️ 输出目录不存在，尝试创建: ${outputDir}`);
      try {
        fs.mkdirSync(outputDir, { recursive: true });
        sendLog(`✅ 输出目录创建成功`);
      } catch (e) {
        const msg = `无法创建输出目录: ${e.message}`;
        sendLog(`❌ ${msg}`);
        return { ok: false, msg };
      }
    } else {
      sendLog(`✅ 输出目录存在`);
    }
    
    if (rulesJsonPath && !fs.existsSync(rulesJsonPath)) {
      sendLog(`⚠️ 规则JSON文件不存在: ${rulesJsonPath}`);
    } else if (rulesJsonPath) {
      sendLog(`✅ 规则JSON文件存在`);
    }
    
  } catch (e) {
    const msg = `文件检查过程中出错: ${e.message}`;
    sendLog(`❌ ${msg}`);
    return { ok: false, msg };
  }

  // 第一步：扫描输入目录，获取所有文件夹名称
  sendLog('\n📁 第一步：扫描输入目录...');
  const folderNames = scanInputDirectory(inputDir);
  sendLog(`发现 ${folderNames.length} 个文件夹:`);
  folderNames.forEach(name => sendLog(`  - ${name}`));
  
  // 第二步：根据文件夹名称选择对应的 JSX 脚本
  sendLog('\n🔍 第二步：选择处理脚本...');
  const jsxDir = path.join(__dirname, 'jsx');
  const selectedScript = selectJSXScript(folderNames, jsxDir);
  
  if (!selectedScript) {
    const msg = '未找到合适的 JSX 脚本';
    sendLog(`❌ ${msg}`);
    return { ok: false, msg };
  }
  
  sendLog(`✅ 选择脚本: ${path.basename(selectedScript.script)}`);
  sendLog(`   描述: ${selectedScript.description}`);
  if (selectedScript.matchedFolders.length > 0) {
    sendLog(`   匹配的文件夹: ${selectedScript.matchedFolders.join(', ')}`);
  } else {
    sendLog(`   使用通用处理模式`);
  }

  sendLog('\n🚀 第三步：准备启动 Photoshop...');
  
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PS_INPUT_DIR: inputDir,
      PS_OUTPUT_DIR: outputDir,
      PS_RULES_JSON: rulesJsonPath || '',
    });

    sendLog(`环境变量设置:`);
    sendLog(`  PS_INPUT_DIR = ${env.PS_INPUT_DIR}`);
    sendLog(`  PS_OUTPUT_DIR = ${env.PS_OUTPUT_DIR}`);
    sendLog(`  PS_RULES_JSON = ${env.PS_RULES_JSON}`);
    
    sendLog(`\n执行命令: "${photoshopPath}" "${selectedScript.script}"`);
    sendLog('启动 Photoshop 进程...');

    const child = spawn(photoshopPath, [selectedScript.script], {
      env,
      windowsHide: false,
      detached: false,
    });

    let stdout = '', stderr = '';
    
    child.stdout && child.stdout.on('data', d => {
      const data = d.toString();
      stdout += data;
      sendLog(`[STDOUT] ${data.trim()}`);
    });
    
    child.stderr && child.stderr.on('data', d => {
      const data = d.toString();
      stderr += data;
      sendLog(`[STDERR] ${data.trim()}`);
    });

    child.on('error', (err) => {
      const msg = `进程启动失败: ${err.message}`;
      sendLog(`❌ ${msg}`);
      resolve({ ok: false, error: String(err), stdout, stderr });
    });

    child.on('close', (code) => {
      sendLog(`\nPhotoshop 进程结束，退出码: ${code}`);
      if (code === 0) {
        sendLog('✅ 处理完成');
      } else {
        sendLog(`❌ 处理失败，退出码: ${code}`);
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
