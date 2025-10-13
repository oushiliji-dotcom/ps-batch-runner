const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// ★★★ 修改点 1: 定义一个在打包后也能正确找到 resources 文件夹的路径 ★★★
// 检查是否在打包环境中。'.asar' 是 Electron 打包文件的特征。
const isPackaged = __dirname.includes('.asar');
// 如果在打包环境中, __dirname 指向 app.asar 内部, 我们需要它的上一级目录 (resources)
// 如果在开发环境中, __dirname 就是项目根目录
const resourcesPath = isPackaged ? path.join(__dirname, '..') : __dirname;


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
    // ★★★ 修改点 2: 使用我们新定义的、更可靠的 resourcesPath ★★★
    const batchTemplatePath = path.join(resourcesPath, 'jsx', 'batch-template.jsx');
    
    // 增加一个日志来确认最终路径是否正确
    console.log('尝试读取内置脚本路径:', batchTemplatePath);
    if (!fs.existsSync(batchTemplatePath)) {
        console.error('严重错误: 内置的 batch-template.jsx 文件未找到!');
        return [];
    }

    const content = fs.readFileSync(batchTemplatePath, 'utf8');
    const match = content.match(/var\s+targetFolderNames\s*=\s*(\[[\s\S]*?\]);/);
    if (match) {
      const arrayStr = match[1];
      // 使用更安全的方法解析数组，避免使用 eval
      return JSON.parse(arrayStr.replace(/'/g, '"')); 
    }
  } catch (error) {
    console.error('读取 targetFolderNames 失败:', error);
  }
  return [];
}

// ... (中间其他函数未改变，保持原样) ...
// 提取SKU前缀（取文件名的前6位）
function extractSKUPrefix(filename) {
  const baseName = path.basename(filename, path.extname(filename));
  return baseName.substring(0, 6);
}

// 选择JSX脚本
function selectJSXScript(inputFile, jsxDir) {
  console.log(`为文件 ${inputFile} 选择JSX脚本`);
  
  const prefix = extractSKUPrefix(inputFile);
  if (!prefix) {
    console.log(`无法从文件名 ${inputFile} 提取SKU前缀`);
    return null;
  }
  console.log(`提取到SKU前缀: ${prefix}`);
  
  const targetFolderNames = getTargetFolderNames();
  // 增加日志输出，显示读取到的数组
  console.log('从内置脚本读取到的 targetFolderNames:', targetFolderNames);

  if (targetFolderNames.includes(prefix)) {
    const batchTemplatePath = path.join(resourcesPath, 'jsx', 'batch-template.jsx');
    if (fs.existsSync(batchTemplatePath)) {
      console.log(`在内置脚本的 targetFolderNames 中找到匹配的前缀: ${prefix}`);
      return batchTemplatePath;
    } else {
      console.error(`内置脚本 batch-template.jsx 文件不存在: ${batchTemplatePath}`);
    }
  }
  
  console.log(`在内置脚本中未找到 ${prefix}，开始搜索外部JSX目录: ${jsxDir}`);
  if (!fs.existsSync(jsxDir)) {
    console.error(`外部JSX目录不存在: ${jsxDir}`);
    return null;
  }
  
  try {
    const jsxFiles = fs.readdirSync(jsxDir).filter(file => file.endsWith('.jsx'));
    console.log(`外部JSX目录中找到 ${jsxFiles.length} 个JSX文件:`, jsxFiles);
    
    for (const jsxFile of jsxFiles) {
      const jsxFileName = path.basename(jsxFile, '.jsx');
      if (jsxFileName.includes(prefix)) {
        const jsxPath = path.join(jsxDir, jsxFile);
        console.log(`找到匹配的外部JSX脚本: ${jsxPath}`);
        return jsxPath;
      }
    }
  } catch (error) {
    console.error('搜索外部JSX文件时出错:', error);
  }
  
  console.log(`未找到匹配 ${prefix} 的JSX脚本`);
  return null;
}

// 执行Photoshop脚本的函数
function executePhotoshopScript(scriptPath, env, photoshopPath) {
    // ... (此函数内容未改变，保持原样) ...
    return new Promise((resolve, reject) => {
        console.log('准备执行Photoshop脚本:', scriptPath);
        console.log('Photoshop路径:', photoshopPath);
        if (!fs.existsSync(scriptPath)) {
            reject(new Error(`JSX脚本文件不存在: ${scriptPath}`));
            return;
        }
        if (!fs.existsSync(photoshopPath)) {
            reject(new Error(`Photoshop可执行文件不存在: ${photoshopPath}`));
            return;
        }
        const child = spawn(photoshopPath, [scriptPath], {
            env: Object.assign({}, process.env, env),
            windowsHide: false,
            detached: false,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '', stderr = '';
        child.stdout && child.stdout.on('data', (data) => { stdout += data.toString(); console.log('PS输出:', data.toString()); });
        child.stderr && child.stderr.on('data', (data) => { stderr += data.toString(); console.error('PS错误:', data.toString()); });
        child.on('error', (err) => { console.error('执行Photoshop出错:', err); reject(err); });
        child.on('close', (code) => { console.log('Photoshop执行完成，退出代码:', code); resolve({ code, stdout, stderr }); });
    });
}


// 静态页面
app.use('/', express.static(path.join(resourcesPath, 'web'))); // 也使用新路径确保web页面能找到

// API
app.get('/api/target-folders', (req, res) => res.json({ folders: getTargetFolderNames() }));
app.get('/api/config', (req, res) => res.json(readConfig()));
app.post('/api/config', (req, res) => { writeConfig(req.body || {}); res.json({ ok: true }); });

// 运行Photoshop任务
app.post('/api/run', async (req, res) => {
  const cfg = Object.assign(readConfig(), req.body || {});
  const { photoshopPath, inputDir, outputDir, rulesJsonPath } = cfg;

  if (!inputDir || !outputDir) {
    return res.status(400).json({ ok: false, msg: '缺少必要参数：inputDir / outputDir' });
  }

  try {
    const inputFiles = fs.readdirSync(inputDir);
    const processableFiles = [];
    const unprocessableFiles = [];

    // ★★★ 修改点 3: 使用我们新定义的、更可靠的 resourcesPath 作为默认JSX目录 ★★★
    const jsxDir = cfg.jsxPath || path.join(resourcesPath, 'jsx');
    console.log('使用的JSX目录:', jsxDir);
    
    // ... (后续逻辑未改变，保持原样) ...
    if (!fs.existsSync(jsxDir)) {
      return res.status(400).json({ error: `JSX目录不存在: ${jsxDir}。请在设置中配置正确的JSX脚本路径。` });
    }
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
    // ... (后续逻辑未改变，保持原样) ...
    if (unprocessableFiles.length > 0) {
        const unprocessableDir = path.join(outputDir, '无法处理');
        if (!fs.existsSync(unprocessableDir)) fs.mkdirSync(unprocessableDir, { recursive: true });
        for (const file of unprocessableFiles) {
            const srcPath = path.join(inputDir, file);
            const destPath = path.join(unprocessableDir, file);
            fs.copyFileSync(srcPath, destPath);
        }
    }
    if (processableFiles.length === 0) {
      return res.json({ ok: true, message: '没有可处理的文件', unprocessableCount: unprocessableFiles.length });
    }
    if (!photoshopPath) {
      return res.status(400).json({ ok: false, msg: '请先配置Photoshop可执行文件路径' });
    }
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    for (const fileInfo of processableFiles) {
      try {
        const env = { PS_INPUT_DIR: inputDir, PS_OUTPUT_DIR: outputDir, PS_RULES_JSON: rulesJsonPath || '', PS_CURRENT_FILE: path.join(inputDir, fileInfo.file) };
        const result = await executePhotoshopScript(fileInfo.script, env, photoshopPath);
        if (result.code === 0) { successCount++; } else { errorCount++; }
        results.push({ file: fileInfo.file, success: result.code === 0, code: result.code, stdout: result.stdout, stderr: result.stderr });
      } catch (error) {
        errorCount++;
        results.push({ file: fileInfo.file, success: false, error: error.message });
      }
    }
    res.json({
      ok: true,
      message: `批量处理完成！成功: ${successCount}, 失败: ${errorCount}, 无法处理: ${unprocessableFiles.length}`,
      successCount, errorCount, unprocessableCount: unprocessableFiles.length, totalFiles: inputFiles.length, results
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3017;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`PS Batch Runner server started at ${url}`);
});