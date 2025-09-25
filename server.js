// server.js（完整可替换版）
// 关键：先 const app = express() 再使用 app，避免“app is not defined”

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

console.log('[server] booting...');

const app = express();
app.use(cors());
app.use(express.json());

// 运行环境与数据目录（asar 打包后的 __dirname 只读，配置写用户目录）
const isPkg = typeof process.pkg !== 'undefined';
const userHome = os.homedir();
const appDataRoot = process.platform === 'win32'
  ? (process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming'))
  : path.join(userHome, '.config');
const dataDir = isPkg ? path.join(appDataRoot, 'ps-batch-runner') : __dirname;
if (!fs.existsSync(dataDir)) { try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {} }

// 简单的磁盘持久化配置
const CONFIG_PATH = path.join(dataDir, 'config.json');
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; } }
function writeConfig(cfg) { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { console.error('写入配置失败:', e); } }

// 静态页面
app.use('/', express.static(path.join(__dirname, 'web')));

// 获取/保存配置
app.get('/api/config', (req, res) => res.json(readConfig()));
app.post('/api/config', (req, res) => { writeConfig(req.body || {}); res.json({ ok: true }); });

// 运行脚本
app.post('/api/run', (req, res) => {
  const cfg = Object.assign(readConfig(), req.body || {});
  const { photoshopPath, jsxPath, inputDir, outputDir, rulesJsonPath, headless } = cfg;

  if (!photoshopPath || !jsxPath || !inputDir || !outputDir) {
    return res.status(400).json({ ok: false, msg: '缺少必要参数：photoshopPath / jsxPath / inputDir / outputDir' });
  }

  const env = Object.assign({}, process.env, {
    PS_INPUT_DIR: inputDir,
    PS_OUTPUT_DIR: outputDir,
    PS_RULES_JSON: rulesJsonPath || '',
  });

  const child = require('child_process').spawn(photoshopPath, [jsxPath], {
    env, windowsHide: !!headless, detached: false,
  });

  let stdout = '', stderr = '';
  child.stdout && child.stdout.on('data', d => stdout += d.toString());
  child.stderr && child.stderr.on('data', d => stderr += d.toString());

  child.on('error', (err) => res.status(500).json({ ok: false, error: String(err), stdout, stderr }));
  child.on('close', (code) => res.json({ ok: code === 0, code, stdout, stderr }));
});

const PORT = process.env.PORT || 3017;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`[server] started at ${url}`);
  if (process.platform === 'win32' && process.env.AUTO_OPEN !== '0') {
    try { spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {}
  }
});
