const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// 运行环境与数据目录
const isPkg = typeof process.pkg !== 'undefined';
const userHome = os.homedir();
const appDataRoot = process.platform === 'win32'
  ? (process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming'))
  : path.join(userHome, '.config');
const dataDir = isPkg ? path.join(appDataRoot, 'ps-batch-runner') : __dirname;
if (!fs.existsSync(dataDir)) { 
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {} 
}

// 配置管理
const CONFIG_PATH = path.join(dataDir, 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) { 
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { 
    console.error('写入配置失败:', e); 
  } 
}

// 从 batch-template.jsx 读取 targetFolderNames 数组
function getTargetFolderNames() {
  try {
    const batchTemplatePath = path.join(__dirname, 'jsx', 'batch-template.jsx');
    const content = fs.readFileSync(batchTemplatePath, 'utf8');
    const match = content.match(/var\s+targetFolderNames\s*=\s*(\[[\s\S]*?\]);/);
    if (match) {
      const arrayStr = match[1];
      return eval(arrayStr); // 解析数组
    }
  } catch (error) {
    console.error('读取 targetFolderNames 失败:', error);
  }
  return [];
}

// 提取SKU前缀（取文件名的前6位）
function extractSKUPrefix(filename) {
  const baseName = path.basename(filename, path.extname(filename));
  return baseName.substring(0, 6);
}

// 选择JSX脚本
function selectJSXScript(inputFile, jsxDir) {
  console.log(`为文件 ${inputFile} 选择JSX脚本`);
  
  // 提取SKU前缀
  const prefix = extractSKUPrefix(inputFile);
  if (!prefix) {
    console.log(`无法从文件名 ${inputFile} 提取SKU前缀`);
    return null;
  }
  
  console.log(`提取到SKU前缀: ${prefix}`);
  
  // 首先检查batch-template.jsx中的targetFolderNames
  const targetFolderNames = getTargetFolderNames();
  if (targetFolderNames.includes(prefix)) {
    const batchTemplatePath = path.join(jsxDir, 'batch-template.jsx');
    if (fs.existsSync(batchTemplatePath)) {
      console.log(`在batch-template.jsx的targetFolderNames中找到匹配的前缀: ${prefix}`);
      return batchTemplatePath;
    } else {
      console.error(`batch-template.jsx文件不存在: ${batchTemplatePath}`);
    }
  }
  
  // 如果在targetFolderNames中没找到，搜索JSX目录
  console.log(`在targetFolderNames中未找到 ${prefix}，开始搜索JSX目录: ${jsxDir}`);
  
  if (!fs.existsSync(jsxDir)) {
    console.error(`JSX目录不存在: ${jsxDir}`);
    return null;
  }
  
  try {
    const jsxFiles = fs.readdirSync(jsxDir).filter(file => file.endsWith('.jsx'));
    console.log(`JSX目录中找到 ${jsxFiles.length} 个JSX文件:`, jsxFiles);
    
    for (const jsxFile of jsxFiles) {
      const jsxFileName = path.basename(jsxFile, '.jsx');
      console.log(`检查JSX文件: ${jsxFile}, 文件名: ${jsxFileName}, 前缀: ${prefix}`);
      
      // 关键修复：使用 includes 而不是精确匹配
      if (jsxFileName.includes(prefix)) {
        const jsxPath = path.join(jsxDir, jsxFile);
        console.log(`找到匹配的JSX脚本: ${jsxPath}`);
        return jsxPath;
      }
    }
  } catch (error) {
    console.error('搜索JSX文件时出错:', error);
  }
  
  console.log(`未找到匹配 ${prefix} 的JSX脚本`);
  console.log(`提示: 请在 ${jsxDir} 目录下创建包含 "${prefix}" 的JSX脚本文件`);
  console.log(`或者将 "${prefix}" 添加到 batch-template.jsx 的 targetFolderNames 数组中`);
  return null;
}

// 执行Photoshop脚本的函数（专为Windows系统优化）
function executePhotoshopScript(scriptPath, env, photoshopPath) {
  return new Promise((resolve, reject) => {
    console.log('准备执行Photoshop脚本:', scriptPath);
    console.log('Photoshop路径:', photoshopPath);
    
    // 检查脚本文件是否存在
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`JSX脚本文件不存在: ${scriptPath}`));
      return;
    }

    // 检查Photoshop可执行文件是否存在
    if (!fs.existsSync(photoshopPath)) {
      reject(new Error(`Photoshop可执行文件不存在: ${photoshopPath}`));
      return;
    }

    // Windows平台直接调用Photoshop执行JSX脚本
    console.log('执行命令:', photoshopPath, [scriptPath]);
    const child = spawn(photoshopPath, [scriptPath], {
      env: Object.assign({}, process.env, env),
      windowsHide: false, // 显示Photoshop窗口以便用户查看处理进度
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '';
    
    child.stdout && child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('PS输出:', output);
    });
    
    child.stderr && child.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      console.error('PS错误:', error);
    });
    
    child.on('error', (err) => {
      console.error('执行Photoshop出错:', err);
      reject(err);
    });
    
    child.on('close', (code) => {
      console.log('Photoshop执行完成，退出代码:', code);
      resolve({ code, stdout, stderr });
    });
  });
}

// 静态页面
app.use('/', express.static(path.join(__dirname, 'web')));

// API路由
app.get('/api/config', (req, res) => res.json(readConfig()));
app.post('/api/config', (req, res) => { 
  writeConfig(req.body || {}); 
  res.json({ ok: true }); 
});

// 运行Photoshop任务
app.post('/api/run', async (req, res) => {
  const cfg = Object.assign(readConfig(), req.body || {});
  const {
    photoshopPath,
    inputDir,
    outputDir,
    rulesJsonPath,
    headless
  } = cfg;

  if (!inputDir || !outputDir) {
    return res.status(400).json({ 
      ok: false, 
      msg: '缺少必要参数：inputDir / outputDir' 
    });
  }

  console.log('开始处理Photoshop任务...');
  console.log('输入目录:', inputDir);
  console.log('输出目录:', outputDir);

  try {
    // 获取输入目录中的所有文件
    const inputFiles = fs.readdirSync(inputDir);
    const processableFiles = [];
    const unprocessableFiles = [];

    const jsxDir = path.join(__dirname, 'jsx');
    console.log('JSX目录:', jsxDir);

    // 分类文件
    for (const file of inputFiles) {
      const filePath = path.join(inputDir, file);
      if (fs.statSync(filePath).isFile()) {
        const selectedScript = selectJSXScript(file, jsxDir);
        if (selectedScript) {
          processableFiles.push({ file, script: selectedScript });
        } else {
          unprocessableFiles.push(file);
        }
      }
    }

    console.log(`可处理文件: ${processableFiles.length} 个`);
    console.log(`无法处理文件: ${unprocessableFiles.length} 个`);

    // 处理无法处理的文件
    if (unprocessableFiles.length > 0) {
      const unprocessableDir = path.join(outputDir, '无法处理');
      if (!fs.existsSync(unprocessableDir)) {
        fs.mkdirSync(unprocessableDir, { recursive: true });
      }
      
      for (const file of unprocessableFiles) {
        const srcPath = path.join(inputDir, file);
        const destPath = path.join(unprocessableDir, file);
        fs.copyFileSync(srcPath, destPath);
        console.log(`移动无法处理的文件: ${file} -> 无法处理文件夹`);
      }
    }

    if (processableFiles.length === 0) {
      return res.json({ 
        ok: true, 
        message: '没有可处理的文件',
        unprocessableCount: unprocessableFiles.length
      });
    }

    // 确保Photoshop路径存在
    if (!photoshopPath) {
      return res.status(400).json({ 
        ok: false, 
        msg: '请先配置Photoshop可执行文件路径' 
      });
    }

    // 处理可处理的文件
    let successCount = 0;
    let errorCount = 0;
    const results = [];

    for (const fileInfo of processableFiles) {
      try {
        console.log(`处理文件: ${fileInfo.file}, 使用脚本: ${fileInfo.script}`);
        
        // 设置环境变量
        const env = {
          PS_INPUT_DIR: inputDir,
          PS_OUTPUT_DIR: outputDir,
          PS_RULES_JSON: rulesJsonPath || '',
          PS_CURRENT_FILE: path.join(inputDir, fileInfo.file)
        };

        // 执行Photoshop脚本
        const result = await executePhotoshopScript(fileInfo.script, env, photoshopPath);
        
        if (result.code === 0) {
          successCount++;
          console.log(`文件 ${fileInfo.file} 处理成功`);
        } else {
          errorCount++;
          console.error(`文件 ${fileInfo.file} 处理失败，退出代码: ${result.code}`);
        }
        
        results.push({
          file: fileInfo.file,
          success: result.code === 0,
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr
        });
        
      } catch (error) {
        errorCount++;
        console.error(`处理文件 ${fileInfo.file} 时出错:`, error);
        results.push({
          file: fileInfo.file,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      ok: true,
      message: `批量处理完成！成功: ${successCount}, 失败: ${errorCount}, 无法处理: ${unprocessableFiles.length}`,
      successCount,
      errorCount,
      unprocessableCount: unprocessableFiles.length,
      totalFiles: inputFiles.length,
      results
    });

  } catch (error) {
    console.error('处理过程中出错:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3017;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`PS Batch Runner server started at ${url}`);
  if (process.platform === 'win32' && process.env.AUTO_OPEN !== '0') {
    try { 
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref(); 
    } catch (_) {}
  }
});
