const { ipcRenderer } = require('electron');

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 加载配置
  const config = await ipcRenderer.invoke('get-config');
  if (config) {
    if (document.getElementById('photoshopPath')) document.getElementById('photoshopPath').value = config.photoshopPath || '';
    if (document.getElementById('jsxPath')) document.getElementById('jsxPath').value = config.jsxPath || '';
    if (document.getElementById('inputDir')) document.getElementById('inputDir').value = config.inputDir || '';
    if (document.getElementById('outputDir')) document.getElementById('outputDir').value = config.outputDir || '';
    if (document.getElementById('rulesJsonPath')) document.getElementById('rulesJsonPath').value = config.rulesJsonPath || '';
  }

  // 绑定文件选择按钮
  const selectPhotoshop = document.getElementById('selectPhotoshop');
  if (selectPhotoshop) {
    selectPhotoshop.addEventListener('click', async () => {
      const path = await ipcRenderer.invoke('select-file', [
        { name: 'Photoshop', extensions: ['exe'] }
      ]);
      if (path && document.getElementById('photoshopPath')) {
        document.getElementById('photoshopPath').value = path;
      }
    });
  }

  const selectJsx = document.getElementById('selectJsx');
  if (selectJsx) {
    selectJsx.addEventListener('click', async () => {
      const path = await ipcRenderer.invoke('select-file', [
        { name: 'JSX Files', extensions: ['jsx'] }
      ]);
      if (path && document.getElementById('jsxPath')) {
        document.getElementById('jsxPath').value = path;
      }
    });
  }

  const selectInput = document.getElementById('selectInput');
  if (selectInput) {
    selectInput.addEventListener('click', async () => {
      const path = await ipcRenderer.invoke('select-directory');
      if (path && document.getElementById('inputDir')) {
        document.getElementById('inputDir').value = path;
      }
    });
  }

  const selectOutput = document.getElementById('selectOutput');
  if (selectOutput) {
    selectOutput.addEventListener('click', async () => {
      const path = await ipcRenderer.invoke('select-directory');
      if (path && document.getElementById('outputDir')) {
        document.getElementById('outputDir').value = path;
      }
    });
  }

  const selectRules = document.getElementById('selectRules');
  if (selectRules) {
    selectRules.addEventListener('click', async () => {
      const path = await ipcRenderer.invoke('select-file', [
        { name: 'JSON Files', extensions: ['json'] }
      ]);
      if (path && document.getElementById('rulesJsonPath')) {
        document.getElementById('rulesJsonPath').value = path;
      }
    });
  }

  // 保存配置
  const saveConfig = document.getElementById('saveConfig');
  if (saveConfig) {
    saveConfig.addEventListener('click', async () => {
      const config = {
        photoshopPath: document.getElementById('photoshopPath')?.value || '',
        jsxPath: document.getElementById('jsxPath')?.value || '',
        inputDir: document.getElementById('inputDir')?.value || '',
        outputDir: document.getElementById('outputDir')?.value || '',
        rulesJsonPath: document.getElementById('rulesJsonPath')?.value || ''
      };
      await ipcRenderer.invoke('save-config', config);
      alert('配置已保存！');
    });
  }

  // 运行批处理
  const runBatch = document.getElementById('runBatch');
  if (runBatch) {
    runBatch.addEventListener('click', async () => {
      const config = {
        photoshopPath: document.getElementById('photoshopPath')?.value || '',
        jsxPath: document.getElementById('jsxPath')?.value || '',
        inputDir: document.getElementById('inputDir')?.value || '',
        outputDir: document.getElementById('outputDir')?.value || '',
        rulesJsonPath: document.getElementById('rulesJsonPath')?.value || ''
      };

      runBatch.disabled = true;
      runBatch.textContent = '运行中...';

      const result = await ipcRenderer.invoke('run-batch', config);
      
      runBatch.disabled = false;
      runBatch.textContent = '开始运行';

      if (result.ok) {
        alert('批处理完成！');
      } else {
        alert(`批处理失败：${result.msg || result.error}`);
      }
    });
  }
});
