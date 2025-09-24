const { ipcRenderer } = require('electron');

// ... existing code ...
document.addEventListener('DOMContentLoaded', () => {
  const els = {
    status: document.getElementById('status'),
    log: document.getElementById('log'),
    inputDir: document.getElementById('inputDir'),
    photoshopPath: document.getElementById('photoshopPath'),
    jsxPath: document.getElementById('jsxPath'),
    outputDir: document.getElementById('outputDir'),
    rulesJsonPath: document.getElementById('rulesJsonPath'),
    settingsModal: document.getElementById('settingsModal'),
    settingsBtn: document.getElementById('settingsBtn'),
    closeSettings: document.getElementById('closeSettings'),
    runBtn: document.getElementById('runBtn'),
    selectInputDir: document.getElementById('selectInputDir'),
    selectPhotoshopPath: document.getElementById('selectPhotoshopPath'),
    selectJsxFile: document.getElementById('selectJsxFile'),
    selectOutputDir: document.getElementById('selectOutputDir'),
    selectRulesJson: document.getElementById('selectRulesJson'),
    saveConfig: document.getElementById('saveConfig'),
  };

  // 检查必要元素是否存在，避免旧 ID 报错
  const missing = Object.keys(els).filter(k => !els[k]).join(', ');
  if (missing) {
    console.error('缺少必要的UI元素:', missing);
    if (els.log) els.log.textContent += `缺少必要的UI元素: ${missing}\n`;
    return;
  }

  // 事件绑定（仅按新 ID）
  els.settingsBtn.addEventListener('click', () => els.settingsModal.setAttribute('aria-hidden', 'false'));
  els.closeSettings.addEventListener('click', () => els.settingsModal.setAttribute('aria-hidden', 'true'));
  els.selectInputDir.addEventListener('click', async () => { const p = await ipcRenderer.invoke('select-directory'); if (p) { els.inputDir.value = p; } });
  els.selectPhotoshopPath.addEventListener('click', async () => { const p = await ipcRenderer.invoke('select-file', { filters: [{ name: 'Executable', extensions: ['exe'] }] }); if (p) { els.photoshopPath.value = p; } });
  els.selectJsxFile.addEventListener('click', async () => { const p = await ipcRenderer.invoke('select-file', { filters: [{ name: 'JSX Files', extensions: ['jsx'] }] }); if (p) { els.jsxPath.value = p; } });
  els.selectOutputDir.addEventListener('click', async () => { const p = await ipcRenderer.invoke('select-directory'); if (p) { els.outputDir.value = p; } });
  els.selectRulesJson.addEventListener('click', async () => { const p = await ipcRenderer.invoke('select-file', { filters: [{ name: 'JSON Files', extensions: ['json'] }] }); if (p) { els.rulesJsonPath.value = p; } });

  els.saveConfig.addEventListener('click', async () => {
    const cfg = {
      inputDir: els.inputDir.value,
      photoshopPath: els.photoshopPath.value,
      jsxPath: els.jsxPath.value,
      outputDir: els.outputDir.value,
      rulesJsonPath: els.rulesJsonPath.value
    };
    const r = await ipcRenderer.invoke('save-config', cfg);
    (r && r.success) ? (els.log.textContent += '配置保存成功\n') : (els.log.textContent += `配置保存失败: ${r && r.error}\n`);
  });

  els.runBtn.addEventListener('click', async () => {
    const cfg = {
      inputDir: els.inputDir.value,
      photoshopPath: els.photoshopPath.value,
      jsxPath: els.jsxPath.value,
      outputDir: els.outputDir.value,
      rulesJsonPath: els.rulesJsonPath.value
    };
    if (!cfg.inputDir || !cfg.photoshopPath || !cfg.jsxPath || !cfg.outputDir) {
      els.log.textContent += '请先完成所有必要配置\n';
      return;
    }
    els.status.textContent = '正在运行批处理...';
    const r = await ipcRenderer.invoke('run-batch', cfg);
    if (r && r.success) { els.status.textContent = '批处理完成'; els.log.textContent += '批处理完成\n'; }
    else { els.status.textContent = '批处理失败'; els.log.textContent += `批处理失败: ${r && r.error}\n`; }
  });

  // 读取配置
  (async () => {
    const cfg = await ipcRenderer.invoke('read-config');
    if (cfg) {
      ['inputDir','photoshopPath','jsxPath','outputDir','rulesJsonPath'].forEach(k => { if (cfg[k]) { els[k].value = cfg[k]; } });
    }
    els.status.textContent = '就绪';
  })();
});
// ... existing code ...
