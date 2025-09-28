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
  const prefix = extractSKUPrefix(inputFile);
  console.log(`提取的SKU前缀: ${prefix}`);
  
  // 首先检查 batch-template.jsx 中的 targetFolderNames
  const targetFolderNames = getTargetFolderNames();
  console.log(`targetFolderNames 数组:`, targetFolderNames);
  
  if (targetFolderNames.includes(prefix)) {
    const batchTemplatePath = path.join(jsxDir, 'batch-template.jsx');
    if (fs.existsSync(batchTemplatePath)) {
      console.log(`在 targetFolderNames 中找到匹配的前缀 ${prefix}，使用 batch-template.jsx`);
      return batchTemplatePath;
    }
  }
  
  // 如果在 targetFolderNames 中没找到，搜索JSX文件夹
  console.log(`在 targetFolderNames 中未找到 ${prefix}，搜索JSX文件夹...`);
  
  try {
    const jsxFiles = fs.readdirSync(jsxDir).filter(file => file.endsWith('.jsx'));
    console.log(`JSX文件夹中的文件:`, jsxFiles);
    
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
  return null;
}

// 创建脚本包装器
function createScriptWrapper(selectedScript, inputFile, outputDir) {
  const wrapperContent = `
// 动态生成的脚本包装器
#include "${selectedScript}"

// 设置输入文件和输出目录
var inputFile = "${inputFile.replace(/\\/g, '\\\\')}";
var outputDir = "${outputDir.replace(/\\/g, '\\\\')}";

// 执行主要逻辑
try {
  // 这里可以添加具体的处理逻辑
  $.writeln("处理文件: " + inputFile);
  $.writeln("输出目录: " + outputDir);
} catch (e) {
  $.writeln("错误: " + e.toString());
}
`;

  const tempDir = os.tmpdir();
  const wrapperPath = path.join(tempDir, `ps-wrapper-${Date.now()}.jsx`);
  fs.writeFileSync(wrapperPath, wrapperContent, 'utf8');
  return wrapperPath;
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
app.post('/api/run', (req, res) => {
  const cfg = Object.assign(readConfig(), req.body || {});
  const {
    photoshopPath,
    inputDir,
    outputDir,
    rulesJsonPath,
    headless
  } = cfg;

  if (!photoshopPath || !inputDir || !outputDir) {
    return res.status(400).json({ 
      ok: false, 
      msg: '缺少必要参数：photoshopPath / inputDir / outputDir' 
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

    // 处理第一个可处理的文件（示例）
    const firstFile = processableFiles[0];
    const inputFilePath = path.join(inputDir, firstFile.file);
    
    // 创建脚本包装器
    const wrapperPath = createScriptWrapper(firstFile.script, inputFilePath, outputDir);
    console.log('创建脚本包装器:', wrapperPath);

    // 设置环境变量
    const env = Object.assign({}, process.env, {
      PS_INPUT_DIR: inputDir,
      PS_OUTPUT_DIR: outputDir,
      PS_RULES_JSON: rulesJsonPath || '',
    });

    // 执行Photoshop
    console.log('执行Photoshop:', photoshopPath, wrapperPath);
    const child = spawn(photoshopPath, [wrapperPath], {
      env,
      windowsHide: !!headless,
      detached: false,
    });

    let stdout = '', stderr = '';
    child.stdout && child.stdout.on('data', d => {
      const output = d.toString();
      stdout += output;
      console.log('PS输出:', output);
    });
    
    child.stderr && child.stderr.on('data', d => {
      const error = d.toString();
      stderr += error;
      console.error('PS错误:', error);
    });

    child.on('error', (err) => {
      console.error('进程错误:', err);
      // 清理临时文件
      try { fs.unlinkSync(wrapperPath); } catch (_) {}
      res.status(500).json({ ok: false, error: String(err), stdout, stderr });
    });

    child.on('close', (code) => {
      console.log('Photoshop进程结束，退出代码:', code);
      // 清理临时文件
      try { fs.unlinkSync(wrapperPath); } catch (_) {}
      
      res.json({ 
        ok: code === 0, 
        code, 
        stdout, 
        stderr,
        processedCount: processableFiles.length,
        unprocessableCount: unprocessableFiles.length
      });
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
