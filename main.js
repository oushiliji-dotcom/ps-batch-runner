const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 日志发送函数
function sendLog(message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('log-message', message);
  }
}

// 配置管理
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
  return {
    photoshopPath: '',
    jsxPath: '',
    inputDir: '',
    outputDir: '',
    rulesJsonPath: ''
  };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('保存配置失败:', error);
    return false;
  }
}

// 扫描目录获取文件列表
function scanDirectory(dirPath) {
  try {
    sendLog(`正在扫描目录: ${dirPath}`);
    const items = fs.readdirSync(dirPath);
    sendLog(`目录中找到 ${items.length} 个项目`);
    
    const allImageFiles = [];
    
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        sendLog(`扫描子文件夹: ${item}`);
        try {
          const subFiles = fs.readdirSync(itemPath);
          const imageFiles = subFiles.filter(file => {
            const filePath = path.join(itemPath, file);
            const isFile = fs.statSync(filePath).isFile();
            const isImageFile = /\.(jpg|jpeg|png|tiff|tif|psd|bmp)$/i.test(file);
            
            if (isFile && isImageFile) {
              sendLog(`  找到图片文件: ${item}/${file}`);
              return true;
            } else if (isFile) {
              sendLog(`  跳过非图片文件: ${item}/${file}`);
            }
            return false;
          });
          
          // 将子文件夹中的图片文件添加到总列表，保持相对路径
          imageFiles.forEach(file => {
            allImageFiles.push(path.join(item, file));
          });
          
          sendLog(`  子文件夹 ${item} 中找到 ${imageFiles.length} 个图片文件`);
        } catch (subError) {
          sendLog(`  扫描子文件夹 ${item} 失败: ${subError.message}`);
        }
      } else if (stat.isFile()) {
        const isImageFile = /\.(jpg|jpeg|png|tiff|tif|psd|bmp)$/i.test(item);
        if (isImageFile) {
          sendLog(`找到根目录图片文件: ${item}`);
          allImageFiles.push(item);
        } else {
          sendLog(`跳过根目录非图片文件: ${item}`);
        }
      }
    });
    
    sendLog(`总共找到 ${allImageFiles.length} 个图片文件`);
    return allImageFiles;
  } catch (error) {
    sendLog(`扫描目录失败: ${error.message}`);
    console.error('扫描目录失败:', error);
    return [];
  }
}

// 从batch-template.jsx读取targetFolderNames
function getTargetFolderNames(jsxPath) {
  try {
    const batchTemplatePath = path.join(jsxPath, 'batch-template.jsx');
    if (fs.existsSync(batchTemplatePath)) {
      const content = fs.readFileSync(batchTemplatePath, 'utf8');
      const match = content.match(/var\s+targetFolderNames\s*=\s*\[(.*?)\]/s);
      if (match) {
        const arrayContent = match[1];
        const names = arrayContent.match(/"([^"]+)"/g);
        if (names) {
          return names.map(name => name.replace(/"/g, ''));
        }
      }
    }
  } catch (error) {
    console.error('读取targetFolderNames失败:', error);
  }
  return [];
}

// 提取SKU前缀
function extractSKUPrefix(filename) {
  // 如果文件名包含路径分隔符，只取文件名部分
  const basename = path.basename(filename);
  const match = basename.match(/^([A-Z]+)/);
  return match ? match[1] : null;
}

// 选择JSX脚本
function selectJSXScript(inputFiles, jsxPath) {
  if (!jsxPath || !fs.existsSync(jsxPath)) {
    sendLog(`JSX目录不存在: ${jsxPath}`);
    return {};
  }

  const targetFolderNames = getTargetFolderNames(jsxPath);
  const batchTemplatePath = path.join(jsxPath, 'batch-template.jsx');
  const scriptMapping = {};
  const unmatchedPrefixes = new Set();

  for (const file of inputFiles) {
    const prefix = extractSKUPrefix(file);
    if (!prefix) {
      sendLog(`无法从文件名 ${file} 提取SKU前缀`);
      continue;
    }

    if (targetFolderNames.includes(prefix)) {
      if (fs.existsSync(batchTemplatePath)) {
        scriptMapping[file] = batchTemplatePath;
        sendLog(`文件 ${file} 使用 batch-template.jsx`);
      } else {
        sendLog(`batch-template.jsx 不存在: ${batchTemplatePath}`);
        unmatchedPrefixes.add(prefix);
      }
    } else {
      // 搜索JSX目录中的其他脚本
      try {
        const jsxFiles = fs.readdirSync(jsxPath).filter(f => f.endsWith('.jsx'));
        let found = false;
        
        for (const jsxFile of jsxFiles) {
          if (jsxFile.toLowerCase().includes(prefix.toLowerCase())) {
            const scriptPath = path.join(jsxPath, jsxFile);
            scriptMapping[file] = scriptPath;
            sendLog(`文件 ${file} 使用 ${jsxFile}`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          sendLog(`未找到匹配的JSX脚本: ${prefix}`);
          unmatchedPrefixes.add(prefix);
        }
      } catch (error) {
        sendLog(`搜索JSX目录失败: ${error.message}`);
        unmatchedPrefixes.add(prefix);
      }
    }
  }

  return { scriptMapping, unmatchedPrefixes: Array.from(unmatchedPrefixes) };
}

// 处理无法处理的文件
function handleUnprocessableFiles(inputFiles, unmatchedPrefixes, outputDir, inputDir) {
  const unprocessableDir = path.join(outputDir, '无法处理');
  
  if (!fs.existsSync(unprocessableDir)) {
    fs.mkdirSync(unprocessableDir, { recursive: true });
  }

  let movedCount = 0;
  for (const file of inputFiles) {
    const prefix = extractSKUPrefix(file);
    if (!prefix || unmatchedPrefixes.includes(prefix)) {
      try {
        const srcPath = path.join(inputDir, file);
        const destPath = path.join(unprocessableDir, file);
        fs.copyFileSync(srcPath, destPath);
        movedCount++;
        sendLog(`移动无法处理的文件: ${file}`);
      } catch (error) {
        sendLog(`移动文件失败 ${file}: ${error.message}`);
      }
    }
  }
  
  return movedCount;
}

// 创建脚本包装器
function createScriptWrapper(originalScriptPath, inputDir, outputDir, rulesJsonPath) {
  const wrapperContent = `
// 自动生成的包装脚本
#include "${originalScriptPath}"

// 设置路径变量
var inputFolder = "${inputDir.replace(/\\/g, '\\\\')}";
var outputFolder = "${outputDir.replace(/\\/g, '\\\\')}";
${rulesJsonPath ? `var rulesJsonPath = "${rulesJsonPath.replace(/\\/g, '\\\\')}";` : ''}
`;

  const wrapperPath = path.join(__dirname, 'temp_wrapper.jsx');
  fs.writeFileSync(wrapperPath, wrapperContent);
  return wrapperPath;
}

// 运行Photoshop脚本
async function runPhotoshopScript(config) {
  const { photoshopPath, jsxPath, inputDir, outputDir, rulesJsonPath } = config;
  
  sendLog('开始处理...');
  
  // 验证配置
  if (!photoshopPath || !fs.existsSync(photoshopPath)) {
    sendLog('错误: Photoshop路径无效');
    return;
  }
  
  if (!inputDir || !fs.existsSync(inputDir)) {
    sendLog('错误: 输入目录无效');
    return;
  }
  
  if (!outputDir) {
    sendLog('错误: 输出目录未设置');
    return;
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 扫描输入目录
  const inputFiles = scanDirectory(inputDir);
  if (inputFiles.length === 0) {
    sendLog('输入目录中没有找到图片文件');
    sendLog('支持的图片格式: JPG, JPEG, PNG, TIFF, TIF, PSD, BMP');
    return;
  }
  
  sendLog(`找到 ${inputFiles.length} 个文件待处理`);
  
  // 选择JSX脚本
  const { scriptMapping, unmatchedPrefixes } = selectJSXScript(inputFiles, jsxPath);
  
  // 处理无法处理的文件
  if (unmatchedPrefixes.length > 0) {
    const movedCount = handleUnprocessableFiles(inputFiles, unmatchedPrefixes, outputDir, inputDir);
    sendLog(`移动了 ${movedCount} 个无法处理的文件到"无法处理"文件夹`);
  }
  
  // 处理可以处理的文件
  let processedCount = 0;
  for (const [file, scriptPath] of Object.entries(scriptMapping)) {
    try {
      sendLog(`正在处理文件: ${file}`);
      
      // 创建脚本包装器
      const wrapperPath = createScriptWrapper(scriptPath, inputDir, outputDir, rulesJsonPath);
      
      // 执行Photoshop脚本
      await new Promise((resolve, reject) => {
        const psProcess = spawn(photoshopPath, [wrapperPath], {
          stdio: 'pipe'
        });
        
        psProcess.stdout.on('data', (data) => {
          sendLog(`PS输出: ${data.toString()}`);
        });
        
        psProcess.stderr.on('data', (data) => {
          sendLog(`PS错误: ${data.toString()}`);
        });
        
        psProcess.on('close', (code) => {
          // 清理临时文件
          try {
            fs.unlinkSync(wrapperPath);
          } catch (e) {
            // 忽略清理错误
          }
          
          if (code === 0) {
            sendLog(`文件 ${file} 处理完成`);
            processedCount++;
            resolve();
          } else {
            sendLog(`文件 ${file} 处理失败，退出码: ${code}`);
            reject(new Error(`Process exited with code ${code}`));
          }
        });
        
        psProcess.on('error', (error) => {
          sendLog(`启动Photoshop失败: ${error.message}`);
          reject(error);
        });
      });
      
    } catch (error) {
      sendLog(`处理文件 ${file} 时出错: ${error.message}`);
    }
  }
  
  sendLog(`处理完成！共处理了 ${processedCount} 个文件`);
}

// IPC处理
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

ipcMain.handle('select-file', async (event, filters = []) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('run-photoshop', async (event, config) => {
  try {
    await runPhotoshopScript(config);
    return { success: true };
  } catch (error) {
    sendLog(`运行失败: ${error.message}`);
    return { success: false, error: error.message };
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  // 加载HTML文件
  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
  
  // 开发模式下打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.on('closed', () => { mainWindow = null; });
}

// 应用程序事件
app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 防止多开
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}