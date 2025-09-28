const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// 运行环境与数据目录（pkg 打包后 __dirname 位于只读快照，需写入用户目录）
const isPkg = typeof process.pkg !== 'undefined';
const userHome = os.homedir();
const appDataRoot = process.platform === 'win32'
  ? (process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming'))
  : path.join(userHome, '.config');
const dataDir = isPkg ? path.join(appDataRoot, 'ps-batch-runner') : __dirname;
if (!fs.existsSync(dataDir)) { try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {} }

// 简单的磁盘持久化配置（放在可写目录）
const CONFIG_PATH = path.join(dataDir, 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { console.error('写入配置失败:', e); } }

// 从 batch-template.jsx 中读取 targetFolderNames 数组
function getTargetFolderNames() {
  try {
    const batchTemplatePath = path.join(__dirname, 'jsx', 'batch-template.jsx');
    if (!fs.existsSync(batchTemplatePath)) {
      console.log('[getTargetFolderNames] batch-template.jsx 文件不存在');
      return [];
    }
    
    const content = fs.readFileSync(batchTemplatePath, 'utf8');
    const match = content.match(/var\s+targetFolderNames\s*=\s*\[(.*?)\]/s);
    
    if (match) {
      const arrayContent = match[1];
      const names = arrayContent.split(',').map(item => 
        item.trim().replace(/['"]/g, '')
      ).filter(item => item.length > 0);
      
      console.log(`[getTargetFolderNames] 成功读取 ${names.length} 个目标文件夹名称`);
      return names;
    } else {
      console.log('[getTargetFolderNames] 未找到 targetFolderNames 数组');
      return [];
    }
  } catch (error) {
    console.error('[getTargetFolderNames] 读取失败:', error);
    return [];
  }
}

// 从文件名中提取前6位作为SKU前缀
function extractSKUPrefix(filename) {
  const nameWithoutExt = path.parse(filename).name;
  const prefix = nameWithoutExt.substring(0, 6);
  console.log(`[extractSKUPrefix] 文件: ${filename}, 提取前缀: ${prefix}`);
  return prefix;
}

// 选择合适的JSX脚本
function selectJSXScript(inputDir, jsxDir) {
  console.log(`[selectJSXScript] 开始选择JSX脚本`);
  console.log(`[selectJSXScript] 输入目录: ${inputDir}`);
  console.log(`[selectJSXScript] JSX目录: ${jsxDir}`);
  
  try {
    // 获取输入目录中的文件和文件夹
    const items = fs.readdirSync(inputDir);
    console.log(`[selectJSXScript] 输入目录中的项目: ${items.join(', ')}`);
    
    // 获取 targetFolderNames 数组
    const targetFolderNames = getTargetFolderNames();
    
    // 获取JSX目录中的所有JSX文件
    const jsxFiles = fs.readdirSync(jsxDir).filter(file => 
      file.toLowerCase().endsWith('.jsx')
    );
    console.log(`[selectJSXScript] JSX目录中的文件: ${jsxFiles.join(', ')}`);
    
    // 检查第一个文件/文件夹的前缀
    if (items.length > 0) {
      const firstItem = items[0];
      const prefix = extractSKUPrefix(firstItem);
      
      // 首先检查是否在 targetFolderNames 中
      if (targetFolderNames.includes(prefix)) {
        const batchTemplatePath = path.join(__dirname, 'jsx', 'batch-template.jsx');
        console.log(`[selectJSXScript] 前缀 ${prefix} 在 targetFolderNames 中，使用 batch-template.jsx`);
        return batchTemplatePath;
      }
      
      // 在JSX目录中查找匹配的脚本 - 修复匹配逻辑
      console.log(`[selectJSXScript] 在JSX目录中查找包含前缀 ${prefix} 的脚本`);
      for (const jsxFile of jsxFiles) {
        // 检查JSX文件名是否包含这个前缀
        const jsxFileName = path.parse(jsxFile).name; // 去掉扩展名
        console.log(`[selectJSXScript] 检查JSX文件: ${jsxFileName} 是否包含前缀: ${prefix}`);
        
        if (jsxFileName.includes(prefix)) {
          const selectedScript = path.join(jsxDir, jsxFile);
          console.log(`[selectJSXScript] 找到匹配的JSX脚本: ${selectedScript}`);
          return selectedScript;
        }
      }
      
      console.log(`[selectJSXScript] 未找到包含前缀 ${prefix} 的JSX脚本`);
    }
    
    // 如果没有找到匹配的脚本，使用第一个JSX文件作为默认
    if (jsxFiles.length > 0) {
      const defaultScript = path.join(jsxDir, jsxFiles[0]);
      console.log(`[selectJSXScript] 使用默认JSX脚本: ${defaultScript}`);
      return defaultScript;
    }
    
    console.log(`[selectJSXScript] JSX目录中没有找到任何JSX文件`);
    return null;
    
  } catch (error) {
    console.error('[selectJSXScript] 选择JSX脚本时出错:', error);
    return null;
  }
}

// 处理无法处理的文件
function handleUnprocessableFiles(inputDir) {
  try {
    const unprocessableDir = path.join(path.dirname(inputDir), '无法执行的文件');
    
    // 创建"无法执行的文件"目录
    if (!fs.existsSync(unprocessableDir)) {
      fs.mkdirSync(unprocessableDir, { recursive: true });
      console.log(`[handleUnprocessableFiles] 创建目录: ${unprocessableDir}`);
    }
    
    // 移动文件
    const items = fs.readdirSync(inputDir);
    for (const item of items) {
      const sourcePath = path.join(inputDir, item);
      const targetPath = path.join(unprocessableDir, item);
      
      fs.renameSync(sourcePath, targetPath);
      console.log(`[handleUnprocessableFiles] 移动文件: ${item} -> 无法执行的文件`);
    }
    
    return true;
  } catch (error) {
    console.error('[handleUnprocessableFiles] 处理无法处理的文件时出错:', error);
    return false;
  }
}

// 创建脚本包装器
function createScriptWrapper(jsxScript, inputDir, outputDir) {
  const wrapperContent = `
// 脚本包装器 - 设置环境变量和工作目录
try {
  // 设置环境变量
  $.setenv('INPUT_DIR', '${inputDir.replace(/\\/g, '\\\\')}');
  $.setenv('OUTPUT_DIR', '${outputDir.replace(/\\/g, '\\\\')}');
  
  // 记录开始执行
  $.writeln('[Wrapper] 开始执行JSX脚本: ${jsxScript}');
  $.writeln('[Wrapper] 输入目录: ${inputDir}');
  $.writeln('[Wrapper] 输出目录: ${outputDir}');
  
  // 执行主脚本
  $.evalFile('${jsxScript.replace(/\\/g, '\\\\')}');
  
  $.writeln('[Wrapper] JSX脚本执行完成');
} catch (error) {
  $.writeln('[Wrapper] 执行JSX脚本时出错: ' + error.toString());
  throw error;
}
`;
  
  const wrapperPath = path.join(__dirname, 'temp-wrapper.jsx');
  fs.writeFileSync(wrapperPath, wrapperContent, 'utf8');
  return wrapperPath;
}

// 静态页面（可从打包资源快照中读取）
app.use('/', express.static(path.join(__dirname, 'web')));

// 获取和保存配置
app.get('/api/config', (req, res) => res.json(readConfig()));
app.post('/api/config', (req, res) => { writeConfig(req.body || {}); res.json({ ok: true }); });

// 运行脚本
app.post('/api/run', (req, res) => {
  const cfg = Object.assign(readConfig(), req.body || {});
  const {
    photoshopPath, // Photoshop.exe 路径
    jsxPath,       // JSX 脚本文件夹路径
    inputDir,      // 输入目录
    outputDir,     // 输出目录
    rulesJsonPath, // 规则定义文件（可选）
    headless       // 是否隐藏窗口（仅供后续扩展）
  } = cfg;

  if (!photoshopPath || !jsxPath || !inputDir || !outputDir) {
    return res.status(400).json({ ok: false, msg: '缺少必要参数：photoshopPath / jsxPath / inputDir / outputDir' });
  }

  console.log('[api/run] 开始处理Photoshop任务');
  console.log('[api/run] 配置:', JSON.stringify(cfg, null, 2));

  try {
    // 验证必要的路径
    if (!fs.existsSync(inputDir)) {
      return res.status(400).json({ ok: false, msg: `输入目录不存在: ${inputDir}` });
    }
    
    if (!fs.existsSync(photoshopPath)) {
      return res.status(400).json({ ok: false, msg: `Photoshop路径不存在: ${photoshopPath}` });
    }
    
    if (!fs.existsSync(jsxPath)) {
      return res.status(400).json({ ok: false, msg: `JSX路径不存在: ${jsxPath}` });
    }
    
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[api/run] 创建输出目录: ${outputDir}`);
    }
    
    // 选择合适的JSX脚本
    const selectedScript = selectJSXScript(inputDir, jsxPath);
    
    if (!selectedScript) {
      // 如果没有找到合适的脚本，移动文件到"无法执行的文件"目录
      console.log('[api/run] 未找到合适的JSX脚本，移动文件到"无法执行的文件"目录');
      const moved = handleUnprocessableFiles(inputDir);
      
      if (moved) {
        return res.json({
          ok: true,
          msg: '未找到匹配的JSX脚本，文件已移动到"无法执行的文件"目录'
        });
      } else {
        return res.status(500).json({ ok: false, msg: '未找到匹配的JSX脚本，且移动文件失败' });
      }
    }
    
    // 验证选中的脚本文件存在
    if (!fs.existsSync(selectedScript)) {
      return res.status(400).json({ ok: false, msg: `选中的JSX脚本不存在: ${selectedScript}` });
    }
    
    console.log(`[api/run] 使用JSX脚本: ${selectedScript}`);
    
    // 创建脚本包装器
    const wrapperScript = createScriptWrapper(selectedScript, inputDir, outputDir);
    
    // 将业务参数通过环境变量传入 ExtendScript
    const env = Object.assign({}, process.env, {
      PS_INPUT_DIR: inputDir,
      PS_OUTPUT_DIR: outputDir,
      PS_RULES_JSON: rulesJsonPath || '',
      INPUT_DIR: inputDir,
      OUTPUT_DIR: outputDir
    });

    console.log(`[api/run] 执行命令: "${photoshopPath}" "${wrapperScript}"`);
    
    // Windows 调用 Photoshop 直接传入 JSX 路径可执行
    const child = spawn(photoshopPath, [wrapperScript], {
      env,
      windowsHide: !!headless,
      detached: false,
    });

    let stdout = '', stderr = '';
    child.stdout && child.stdout.on('data', d => {
      const output = d.toString();
      stdout += output;
      console.log('[PS stdout]', output);
    });
    child.stderr && child.stderr.on('data', d => {
      const output = d.toString();
      stderr += output;
      console.log('[PS stderr]', output);
    });

    child.on('error', (err) => {
      console.error('[api/run] 启动Photoshop进程失败:', err);
      
      // 清理临时包装器文件
      try {
        if (fs.existsSync(wrapperScript)) {
          fs.unlinkSync(wrapperScript);
        }
      } catch (cleanupError) {
        console.error('[api/run] 清理临时文件失败:', cleanupError);
      }
      
      res.status(500).json({ ok: false, error: String(err), stdout, stderr });
    });
    
    child.on('close', (code) => {
      console.log(`[api/run] Photoshop进程退出，退出码: ${code}`);
      
      // 清理临时包装器文件
      try {
        if (fs.existsSync(wrapperScript)) {
          fs.unlinkSync(wrapperScript);
          console.log('[api/run] 清理临时包装器文件');
        }
      } catch (cleanupError) {
        console.error('[api/run] 清理临时文件失败:', cleanupError);
      }
      
      res.json({ ok: code === 0, code, stdout, stderr });
    });
    
  } catch (error) {
    console.error('[api/run] 处理失败:', error);
    res.status(500).json({ ok: false, msg: error.message });
  }
});

const PORT = process.env.PORT || 3017;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`PS Batch Runner server started at ${url}`);
  // Windows 上默认打开浏览器（可通过设置环境变量 AUTO_OPEN=0 关闭）
  if (process.platform === 'win32' && process.env.AUTO_OPEN !== '0') {
    try { spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {}
  }
});
