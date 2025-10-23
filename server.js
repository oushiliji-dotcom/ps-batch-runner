const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// ★★★ 我们的新“GPS导航仪” ★★★
const isPackaged = __dirname.includes('.asar');
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

// ★★★ 修改点 1: 彻底删除 getTargetFolderNames() 函数 ★★★
// (那个导致所有问题的函数已经不存在了)

// 提取SKU前缀（取文件名的前6位）
function extractSKUPrefix(filename) {
  const baseName = path.basename(filename, path.extname(filename));
  return baseName.substring(0, 6);
}

// ★★★ 修改点 2: 升级 selectJSXScript 函数 ★★★
// 它现在接收一个从UI传来的 targetFolderNames 数组
function selectJSXScript(inputFile, jsxDir, targetFolderNames) {
  console.log(`为文件 ${inputFile} 选择JSX脚本`);
  
  const prefix = extractSKUPrefix(inputFile);
  if (!prefix) {
    console.log(`无法从文件名 ${inputFile} 提取SKU前缀`);
    return null;
  }
  console.log(`提取到SKU前缀: ${prefix}`);

  // 增加日志输出，显示从UI读取到的数组
  console.log('从UI配置读取到的 targetFolderNames:', targetFolderNames);

  // ★★★ 核心逻辑改变: 不再读文件，而是直接使用传入的数组 ★★★
  if (targetFolderNames.includes(prefix)) {
    const batchTemplatePath = path.join(resourcesPath, 'jsx', 'batch-template.jsx');
    if (fs.existsSync(batchTemplatePath)) {
      console.log(`在UI配置的 targetFolderNames 中找到匹配的前缀: ${prefix}`);
      return batchTemplatePath;
    } else {
      console.error(`内置脚本 batch-template.jsx 文件不存在: ${batchTemplatePath}`);
    }
  }
  
  // (后续的独立脚本查找逻辑保持不变)
  console.log(`在UI配置中未找到 ${prefix}，开始搜索外部JSX目录: ${jsxDir}`);
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

// ... (executePhotoshopScript 函数保持不变) ...
function executePhotoshopScript(scriptPath, env, photoshopPath) {
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
app.use('/', express.static(path.join(resourcesPath, 'web')));

// ★★★ 修改点 3: 彻底删除 /api/target-folders 路由 ★★★
// (这个API已经没有意义了)

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
    headless,
    targetFolderNames // ★★★ 接收来自UI的新字段 ★★★
  } = cfg;

  if (!inputDir || !outputDir) {
    return res.status(400).json({ ok: false, msg: '缺少必要参数：inputDir / outputDir' });
  }
  
  // ★★★ 修改点 4: 解析来自UI的SKU列表字符串 ★★★
  const userTargetFolders = (targetFolderNames || '')
                            .split(',') // 用逗号分隔
                            .map(s => s.trim()) // 去掉多余的空格
                            .filter(Boolean); // 去掉空字符串

  try {
    const inputFiles = fs.readdirSync(inputDir);
    const processableFiles = [];
    const unprocessableFiles = [];

    const jsxDir = cfg.jsxPath || path.join(resourcesPath, 'jsx');
    console.log('使用的JSX目录:', jsxDir);

    if (!fs.existsSync(jsxDir)) {
      return res.status(400).json({ error: `JSX目录不存在: ${jsxDir}。请在设置中配置正确的JSX脚本路径。` });
    }

    // 分类文件
    for (const file of inputFiles) {
      const filePath = path.join(inputDir, file);
      if (fs.statSync(filePath).isFile()) {
        // ★★★ 修改点 5: 将解析好的数组传递给 selectJSXScript ★★★
        const selectedScript = selectJSXScript(file, jsxDir, userTargetFolders);
        if (selectedScript) {
          processableFiles.push({ file, script: selectedScript });
        } else {
          unprocessableFiles.push(file);
        }
      }
    }
    
    // ... (后续的处理逻辑保持不变) ...
    console.log(`可处理文件: ${processableFiles.length} 个`);
    console.log(`无法处理文件: ${unprocessableFiles.length} 个`);
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
    console.error('处理过程中出错:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3017;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`PS Batch Runner server started at ${url}`);
});