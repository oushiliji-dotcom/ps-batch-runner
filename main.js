const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 发送日志到渲染进程
function sendLog(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-message', `[${new Date().toLocaleTimeString()}] ${message}`);
  }
  console.log(message);
}

// 读取配置
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    sendLog(`读取配置失败: ${error.message}`);
  }
  return {
    photoshopPath: '',
    jsxPath: '',
    outputDir: '',
    rulesJsonPath: ''
  };
}

// 保存配置
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    sendLog('配置已保存');
    return true;
  } catch (error) {
    sendLog(`保存配置失败: ${error.message}`);
    return false;
  }
}

// 递归扫描目录获取所有文件
function scanDirectory(dirPath) {
  const files = [];
  
  function scan(currentPath) {
    try {
      const items = fs.readdirSync(currentPath);
      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scan(fullPath); // 递归扫描子目录
        } else if (stat.isFile()) {
          // 只处理图片文件
          const ext = path.extname(item).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.psd'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      sendLog(`扫描目录失败: ${currentPath} - ${error.message}`);
    }
  }
  
  scan(dirPath);
  return files;
}

// 从batch-template.jsx中读取targetFolderNames数组
function getTargetFolderNames() {
  try {
    const batchTemplatePath = path.join(__dirname, 'jsx', 'batch-template.jsx');
    if (!fs.existsSync(batchTemplatePath)) {
      sendLog('batch-template.jsx 文件不存在');
      return [];
    }
    
    const content = fs.readFileSync(batchTemplatePath, 'utf8');
    const match = content.match(/var\s+targetFolderNames\s*=\s*\[(.*?)\]/s);
    
    if (match) {
      const arrayContent = match[1];
      const names = arrayContent.match(/'([^']+)'/g);
      if (names) {
        return names.map(name => name.replace(/'/g, ''));
      }
    }
    
    sendLog('无法从batch-template.jsx中提取targetFolderNames');
    return [];
  } catch (error) {
    sendLog(`读取batch-template.jsx失败: ${error.message}`);
    return [];
  }
}

// 选择JSX脚本
function selectJSXScript(inputFiles, jsxPath) {
  const targetFolderNames = getTargetFolderNames();
  sendLog(`从batch-template.jsx中读取到 ${targetFolderNames.length} 个目标文件夹名称`);
  
  // 提取所有文件的前6位前缀
  const prefixes = new Set();
  inputFiles.forEach(filePath => {
    const fileName = path.basename(filePath);
    const prefix = fileName.substring(0, 6).toUpperCase(); // 提取前6位并转为大写
    prefixes.add(prefix);
  });
  
  sendLog(`提取到的文件前缀: ${Array.from(prefixes).join(', ')}`);
  
  // 检查前缀是否在targetFolderNames中
  const matchedPrefixes = [];
  const unmatchedPrefixes = [];
  
  prefixes.forEach(prefix => {
    if (targetFolderNames.includes(prefix)) {
      matchedPrefixes.push(prefix);
    } else {
      unmatchedPrefixes.push(prefix);
    }
  });
  
  sendLog(`匹配的前缀: ${matchedPrefixes.join(', ')}`);
  sendLog(`未匹配的前缀: ${unmatchedPrefixes.join(', ')}`);
  
  // 如果有匹配的前缀，使用batch-template.jsx
  if (matchedPrefixes.length > 0) {
    const batchTemplatePath = path.join(__dirname, 'jsx', 'batch-template.jsx');
    sendLog(`使用batch-template.jsx处理匹配的前缀: ${matchedPrefixes.join(', ')}`);
    return {
      scriptPath: batchTemplatePath,
      matchedPrefixes,
      unmatchedPrefixes
    };
  }
  
  // 如果没有匹配的前缀，尝试在JSX文件夹中查找匹配的脚本
  if (unmatchedPrefixes.length > 0 && jsxPath) {
    try {
      const jsxFiles = fs.readdirSync(jsxPath).filter(file => 
        file.toLowerCase().endsWith('.jsx')
      );
      
      sendLog(`JSX文件夹中找到 ${jsxFiles.length} 个JSX文件`);
      
      // 尝试为每个未匹配的前缀找到对应的JSX文件
      for (const prefix of unmatchedPrefixes) {
        const matchingJsx = jsxFiles.find(jsxFile => 
          jsxFile.toUpperCase().includes(prefix)
        );
        
        if (matchingJsx) {
          const scriptPath = path.join(jsxPath, matchingJsx);
          sendLog(`为前缀 ${prefix} 找到匹配的JSX脚本: ${matchingJsx}`);
          return {
            scriptPath,
            matchedPrefixes: [prefix],
            unmatchedPrefixes: unmatchedPrefixes.filter(p => p !== prefix)
          };
        }
      }
    } catch (error) {
      sendLog(`扫描JSX文件夹失败: ${error.message}`);
    }
  }
  
  // 如果都没有找到匹配的脚本
  sendLog('未找到匹配的JSX脚本');
  return {
    scriptPath: null,
    matchedPrefixes: [],
    unmatchedPrefixes: Array.from(prefixes)
  };
}

// 创建"无法执行的文件"文件夹并移动文件
function handleUnprocessableFiles(inputFiles, unmatchedPrefixes, outputDir) {
  if (unmatchedPrefixes.length === 0) return;
  
  const unprocessableDir = path.join(outputDir, '无法执行的文件');
  
  try {
    if (!fs.existsSync(unprocessableDir)) {
      fs.mkdirSync(unprocessableDir, { recursive: true });
      sendLog(`创建"无法执行的文件"文件夹: ${unprocessableDir}`);
    }
    
    let movedCount = 0;
    inputFiles.forEach(filePath => {
      const fileName = path.basename(filePath);
      const prefix = fileName.substring(0, 6).toUpperCase();
      
      if (unmatchedPrefixes.includes(prefix)) {
        try {
          const targetPath = path.join(unprocessableDir, fileName);
          fs.copyFileSync(filePath, targetPath);
          movedCount++;
          sendLog(`移动文件到无法执行文件夹: ${fileName}`);
        } catch (error) {
          sendLog(`移动文件失败 ${fileName}: ${error.message}`);
        }
      }
    });
    
    sendLog(`共移动 ${movedCount} 个无法处理的文件到"无法执行的文件"文件夹`);
  } catch (error) {
    sendLog(`处理无法执行的文件时出错: ${error.message}`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('web/index.html');
  
  // 开发时可以打开开发者工具
  // mainWindow.webContents.openDevTools();
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
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-file', async (event, options = {}) => {
  const dialogOptions = {
    properties: ['openFile'],
    filters: options.filters || []
  };
  
  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('run-photoshop', async (event, config) => {
  return new Promise((resolve, reject) => {
    try {
      sendLog('=== 开始Photoshop批处理 ===');
      
      // 参数检查
      if (!config.inputDir || !config.outputDir || !config.photoshopPath) {
        const error = '缺少必要参数: 输入目录、输出目录或Photoshop路径';
        sendLog(error);
        reject(new Error(error));
        return;
      }
      
      // 扫描输入目录
      sendLog(`扫描输入目录: ${config.inputDir}`);
      const inputFiles = scanDirectory(config.inputDir);
      sendLog(`发现文件: ${inputFiles.length} 个`);
      
      if (inputFiles.length === 0) {
        const error = '输入目录中没有找到可处理的图片文件';
        sendLog(error);
        reject(new Error(error));
        return;
      }
      
      // 创建输出目录
      if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
        sendLog(`创建输出目录: ${config.outputDir}`);
      }
      
      // 选择JSX脚本
      const scriptResult = selectJSXScript(inputFiles, config.jsxPath);
      
      if (!scriptResult.scriptPath) {
        // 所有文件都无法处理，全部移动到"无法执行的文件"文件夹
        handleUnprocessableFiles(inputFiles, scriptResult.unmatchedPrefixes, config.outputDir);
        const message = '所有文件都无法找到匹配的JSX脚本，已移动到"无法执行的文件"文件夹';
        sendLog(message);
        resolve({ success: true, message });
        return;
      }
      
      // 处理无法执行的文件
      if (scriptResult.unmatchedPrefixes.length > 0) {
        handleUnprocessableFiles(inputFiles, scriptResult.unmatchedPrefixes, config.outputDir);
      }
      
      sendLog(`最终选择的JSX脚本: ${scriptResult.scriptPath}`);
      
      // 检查JSX脚本文件是否存在
      if (!fs.existsSync(scriptResult.scriptPath)) {
        const error = `JSX脚本文件不存在: ${scriptResult.scriptPath}`;
        sendLog(error);
        reject(new Error(error));
        return;
      }
      
      // 设置环境变量
      const env = {
        ...process.env,
        PS_INPUT_DIR: config.inputDir,
        PS_OUTPUT_DIR: config.outputDir
      };
      
      if (config.rulesJsonPath) {
        env.PS_RULES_JSON = config.rulesJsonPath;
      }
      
      sendLog('环境变量设置完成');
      sendLog(`PS_INPUT_DIR: ${config.inputDir}`);
      sendLog(`PS_OUTPUT_DIR: ${config.outputDir}`);
      
      // 启动Photoshop进程
      sendLog(`启动Photoshop进程: ${config.photoshopPath} -r ${scriptResult.scriptPath}`);
      const psProcess = spawn(config.photoshopPath, ['-r', scriptResult.scriptPath], {
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      sendLog('=== 处理开始，启动Photoshop失败 ===');
      
      // 处理输出
      psProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          sendLog(`Photoshop输出: ${output}`);
        }
      });
      
      psProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          sendLog(`Photoshop错误: ${error}`);
        }
      });
      
      // 处理进程结束
      psProcess.on('close', (code) => {
        if (code === 0) {
          sendLog('=== Photoshop处理完成 ===');
          resolve({ 
            success: true, 
            message: `处理完成！匹配前缀: ${scriptResult.matchedPrefixes.join(', ')}${scriptResult.unmatchedPrefixes.length > 0 ? `，无法处理前缀: ${scriptResult.unmatchedPrefixes.join(', ')}` : ''}` 
          });
        } else {
          const error = `Photoshop进程异常退出，退出码: ${code}`;
          sendLog(`=== Photoshop处理失败 ===`);
          sendLog(error);
          reject(new Error(error));
        }
      });
      
      psProcess.on('error', (error) => {
        const errorMsg = `启动Photoshop失败: ${error.message}`;
        sendLog(errorMsg);
        reject(new Error(errorMsg));
      });
      
    } catch (error) {
      const errorMsg = `运行出错: ${error.message}`;
      sendLog(errorMsg);
      reject(new Error(errorMsg));
    }
  });
});
