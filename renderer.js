const { ipcRenderer } = require('electron');

function log(message, type = 'info') {
  const logEl = document.getElementById('log');
  const ts = new Date().toLocaleTimeString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  if (logEl) {
    logEl.textContent += `[${ts}] ${prefix} ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}
function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function ensureDom(ids) {
  const missing = ids.filter(id => !document.getElementById(id));
  if (missing.length) {
    log(`缺少必要的UI元素: ${missing.join(', ')}`, 'error');
    throw new Error(`缺少必要的UI元素: ${missing.join(', ')}`);
  }
}

async function init() {
  log('渲染进程开始初始化...');
  setStatus('初始化中...');

  // 步骤1：页面DOM加载完成
  log('步骤1：页面DOM加载完成');

  // 步骤2：检查 Node.js 集成是否启用
  try {
    const ok = typeof require === 'function' && !!process && !!process.versions && !!process.versions.electron;
    if (!ok) throw new Error('Node.js集成未启用，无法使用Electron内核');
    log('步骤2：✅ Node.js集成检测通过');
  } catch (e) {
    log(`渲染进程初始化失败：${e.message}`, 'error');
    setStatus('初始化失败');
    return;
  }

  // 步骤3：尝试加载IPC通信模块
  try { if (!ipcRenderer) throw new Error('无法加载ipcRenderer'); log('步骤3：✅ IPC通信模块加载成功'); }
  catch (e) { log(`渲染进程初始化失败：${e.message}`, 'error'); setStatus('初始化失败'); return; }

  // 步骤4：检查页面UI元素是否存在
  const ids = [
    'settingsBtn','runBtn','inputDir','selectInputDir','status','log',
    'settingsModal','closeSettings','photoshopPath','selectPhotoshopPath',
    'jsxPath','selectJsxFile','outputDir','selectOutputDir',
    'rulesJsonPath','selectRulesJson','saveConfig'
  ];
  try { ensureDom(ids); log('步骤4：✅ 页面UI元素检测通过'); }
  catch { setStatus('初始化失败'); return; }

  // 绑定事件
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').setAttribute('aria-hidden', 'false');
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').setAttribute('aria-hidden', 'true');
  });

  document.getElementById('selectInputDir').addEventListener('click', async () => {
    const p = await ipcRenderer.invoke('select-directory');
    if (p) document.getElementById('inputDir').value = p;
  });
  document.getElementById('selectPhotoshopPath').addEventListener('click', async () => {
    const p = await ipcRenderer.invoke('select-file', { filters: [{ name: '可执行文件', extensions: ['exe'] }] });
    if (p) document.getElementById('photoshopPath').value = p;
  });
  document.getElementById('selectJsxFile').addEventListener('click', async () => {
    const p = await ipcRenderer.invoke('select-file', { filters: [{ name: 'JSX 脚本', extensions: ['jsx'] }] });
    if (p) document.getElementById('jsxPath').value = p;
  });
  document.getElementById('selectOutputDir').addEventListener('click', async () => {
    const p = await ipcRenderer.invoke('select-directory');
    if (p) document.getElementById('outputDir').value = p;
  });
  document.getElementById('selectRulesJson').addEventListener('click', async () => {
    const p = await ipcRenderer.invoke('select-file', { filters: [{ name: 'JSON 文件', extensions: ['json'] }] });
    if (p) document.getElementById('rulesJsonPath').value = p;
  });

  document.getElementById('saveConfig').addEventListener('click', async () => {
    const cfg = {
      inputDir: document.getElementById('inputDir').value,
      photoshopPath: document.getElementById('photoshopPath').value,
      jsxPath: document.getElementById('jsxPath').value,
      outputDir: document.getElementById('outputDir').value,
      rulesJsonPath: document.getElementById('rulesJsonPath').value
    };
    const r = await ipcRenderer.invoke('save-config', cfg);
    if (r && r.success) log('配置保存成功', 'success');
    else log(`配置保存失败: ${r && r.error}`, 'error');
  });

  document.getElementById('runBtn').addEventListener('click', async () => {
    const cfg = {
      inputDir: document.getElementById('inputDir').value,
      photoshopPath: document.getElementById('photoshopPath').value,
      jsxPath: document.getElementById('jsxPath').value,
      outputDir: document.getElementById('outputDir').value,
      rulesJsonPath: document.getElementById('rulesJsonPath').value
    };
    if (!cfg.inputDir || !cfg.photoshopPath || !cfg.jsxPath || !cfg.outputDir) {
      log('请先完成所有必要配置：Photoshop.exe、JSX脚本、输入目录、输出目录', 'error');
      return;
    }
    setStatus('正在运行批处理...');
    log('开始批处理任务...');
    const r = await ipcRenderer.invoke('run-batch', cfg);
    if (r && r.success) { setStatus('批处理完成'); log('批处理任务完成', 'success'); }
    else { setStatus('批处理失败'); log(`批处理失败: ${r && r.error}`, 'error'); }
  });

  // 读取配置
  try {
    const cfg = await ipcRenderer.invoke('read-config');
    ['inputDir','photoshopPath','jsxPath','outputDir','rulesJsonPath'].forEach(k => {
      if (cfg && cfg[k]) { const el = document.getElementById(k); if (el) el.value = cfg[k]; }
    });
  } catch (e) {
    log(`读取配置失败: ${e.message}`, 'error');
  }

  setStatus('就绪');
  log('渲染进程初始化完成', 'success');
}

document.addEventListener('DOMContentLoaded', init);
