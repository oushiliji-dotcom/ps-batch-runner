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

// 静态页面（可从打包资源快照中读取）
const webDir = path.join(__dirname, 'web');
console.log('=== PS Batch Runner Debug Info ===');
console.log('isPkg:', isPkg);
console.log('__dirname:', __dirname);
console.log('webDir:', webDir);
console.log('webDir exists:', fs.existsSync(webDir));
if (fs.existsSync(webDir)) {
  console.log('webDir contents:', fs.readdirSync(webDir));
} else {
  console.log('ERROR: webDir does not exist!');
}
console.log('================================');

app.use('/', express.static(webDir));

// 获取和保存配置
app.get('/api/config', (req, res) => res.json(readConfig()));
app.post('/api/config', (req, res) => { writeConfig(req.body || {}); res.json({ ok: true }); });

// 运行脚本
app.post('/api/run', (req, res) => {
  const cfg = Object.assign(readConfig(), req.body || {});
  const {
    photoshopPath, // Photoshop.exe 路径
    jsxPath,       // 要运行的 JSX 脚本路径
    inputDir,      // 输入目录
    outputDir,     // 输出目录
    rulesJsonPath, // 规则定义文件（可选）
    headless       // 是否隐藏窗口（仅供后续扩展）
  } = cfg;

  if (!photoshopPath || !jsxPath || !inputDir || !outputDir) {
    return res.status(400).json({ ok: false, msg: '缺少必要参数：photoshopPath / jsxPath / inputDir / outputDir' });
  }

  // 将业务参数通过环境变量传入 ExtendScript
  const env = Object.assign({}, process.env, {
    PS_INPUT_DIR: inputDir,
    PS_OUTPUT_DIR: outputDir,
    PS_RULES_JSON: rulesJsonPath || '',
  });

  // Windows 调用 Photoshop 直接传入 JSX 路径可执行
  const child = spawn(photoshopPath, [jsxPath], {
    env,
    windowsHide: !!headless,
    detached: false,
  });

  let stdout = '', stderr = '';
  child.stdout && child.stdout.on('data', d => stdout += d.toString());
  child.stderr && child.stderr.on('data', d => stderr += d.toString());

  child.on('error', (err) => {
    res.status(500).json({ ok: false, error: String(err), stdout, stderr });
  });
  child.on('close', (code) => {
    res.json({ ok: code === 0, code, stdout, stderr });
  });
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
