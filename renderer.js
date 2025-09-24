console.log('渲染进程开始初始化...');

// 日志输出函数
function logToUI(message, isError = false) {
  const logElement = document.querySelector('.log-output');
  if (logElement) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = isError ? '❌ [错误]' : '📝 [信息]';
    const logMessage = `${timestamp} ${prefix} ${message}\n`;
    logElement.textContent += logMessage;
    logElement.scrollTop = logElement.scrollHeight;
  }
  console.log(message);
}

// 等待页面加载完成
document.addEventListener('DOMContentLoaded', async () => {
  logToUI('步骤1：页面DOM加载完成');
  
  try {
    // 检查Node.js集成
    logToUI('步骤2：检查Node.js集成是否启用...');
    if (typeof require === 'undefined') {
      throw new Error('Node.js集成未启用，无法使用Electron功能');
    }
    logToUI('步骤2：✅ Node.js集成检查通过');
    
    // 加载IPC模块
    logToUI('步骤3：尝试加载IPC通信模块...');
    const { ipcRenderer } = require('electron');
    logToUI('步骤3：✅ IPC通信模块加载成功');
    
    // 检查UI元素
    logToUI('步骤4：检查页面UI元素是否存在...');
    const requiredElements = ['inputDir', 'outputDir', 'jsxFile', 'selectInputDir', 'selectOutputDir', 'selectJsxFile', 'saveConfig', 'runBatch'];
    const missingElements = [];
    
    requiredElements.forEach(id => {
      const element = document.getElementById(id);
      if (!element) {
        missingElements.push(id);
      }
    });
    
    if (missingElements.length > 0) {
      throw new Error(`缺少必要的UI元素: ${missingElements.join(', ')}`);
    }
    logToUI('步骤4：✅ 所有必要的UI元素都存在');
    
    // 加载配置
    logToUI('步骤5：开始从主进程加载配置...');
    const config = await ipcRenderer.invoke('read-config');
    logToUI(`步骤5：✅ 配置加载成功: ${JSON.stringify(config, null, 2)}`);
    
    // 填充表单
    logToUI('步骤6：开始填充表单字段...');
    if (config.inputDir) {
      document.getElementById('inputDir').value = config.inputDir;
      logToUI(`步骤6a：✅ 输入目录已填充: ${config.inputDir}`);
    }
    
    if (config.outputDir) {
      document.getElementById('outputDir').value = config.outputDir;
      logToUI(`步骤6b：✅ 输出目录已填充: ${config.outputDir}`);
    }
    
    if (config.jsxFile) {
      document.getElementById('jsxFile').value = config.jsxFile;
      logToUI(`步骤6c：✅ JSX文件路径已填充: ${config.jsxFile}`);
    }
    
    // 绑定事件处理器
    logToUI('步骤7：开始绑定事件处理器...');
    
    // 选择输入目录
    document.getElementById('selectInputDir').addEventListener('click', async () => {
      logToUI('步骤8a：用户点击选择输入目录按钮');
      try {
        const dir = await ipcRenderer.invoke('select-directory');
        if (dir) {
          document.getElementById('inputDir').value = dir;
          logToUI(`步骤8a：✅ 输入目录已更新: ${dir}`);
        } else {
          logToUI('步骤8a：用户取消了目录选择');
        }
      } catch (error) {
        logToUI(`步骤8a：❌ 选择输入目录失败: ${error.message}`, true);
      }
    });
    
    // 选择输出目录
    document.getElementById('selectOutputDir').addEventListener('click', async () => {
      logToUI('步骤8b：用户点击选择输出目录按钮');
      try {
        const dir = await ipcRenderer.invoke('select-directory');
        if (dir) {
          document.getElementById('outputDir').value = dir;
          logToUI(`步骤8b：✅ 输出目录已更新: ${dir}`);
        } else {
          logToUI('步骤8b：用户取消了目录选择');
        }
      } catch (error) {
        logToUI(`步骤8b：❌ 选择输出目录失败: ${error.message}`, true);
      }
    });
    
    // 选择JSX文件
    document.getElementById('selectJsxFile').addEventListener('click', async () => {
      logToUI('步骤8c：用户点击选择JSX文件按钮');
      try {
        const file = await ipcRenderer.invoke('select-jsx-file');
        if (file) {
          document.getElementById('jsxFile').value = file;
          logToUI(`步骤8c：✅ JSX文件已更新: ${file}`);
        } else {
          logToUI('步骤8c：用户取消了文件选择');
        }
      } catch (error) {
        logToUI(`步骤8c：❌ 选择JSX文件失败: ${error.message}`, true);
      }
    });
    
    // 保存配置
    document.getElementById('saveConfig').addEventListener('click', async () => {
      logToUI('步骤9：用户点击保存配置按钮');
      try {
        const newConfig = {
          inputDir: document.getElementById('inputDir').value,
          outputDir: document.getElementById('outputDir').value,
          jsxFile: document.getElementById('jsxFile').value
        };
        
        logToUI(`步骤9：准备保存配置: ${JSON.stringify(newConfig, null, 2)}`);
        
        const result = await ipcRenderer.invoke('save-config', newConfig);
        if (result.success) {
          logToUI('步骤9：✅ 配置保存成功');
          alert('配置已保存');
        } else {
          throw new Error(result.error || '未知错误');
        }
      } catch (error) {
        logToUI(`步骤9：❌ 配置保存失败: ${error.message}`, true);
        alert('保存失败: ' + error.message);
      }
    });
    
    // 运行批处理
    document.getElementById('runBatch').addEventListener('click', async () => {
      logToUI('步骤10：用户点击运行批处理按钮');
      
      try {
        // 收集配置
        const config = {
          inputDir: document.getElementById('inputDir').value.trim(),
          outputDir: document.getElementById('outputDir').value.trim(),
          jsxFile: document.getElementById('jsxFile').value.trim()
        };
        
        logToUI(`步骤10a：收集到的配置信息: ${JSON.stringify(config, null, 2)}`);
        
        // 验证配置
        logToUI('步骤10b：开始验证配置完整性...');
        const missingFields = [];
        if (!config.inputDir) missingFields.push('输入目录');
        if (!config.outputDir) missingFields.push('输出目录');
        if (!config.jsxFile) missingFields.push('JSX文件');
        
        if (missingFields.length > 0) {
          throw new Error(`请填写完整的配置信息，缺少: ${missingFields.join(', ')}`);
        }
        logToUI('步骤10b：✅ 配置验证通过');
        
        // 检查路径是否存在
        logToUI('步骤10c：开始检查文件和目录是否存在...');
        const fs = require('fs');
        
        if (!fs.existsSync(config.inputDir)) {
          throw new Error(`输入目录不存在: ${config.inputDir}`);
        }
        logToUI(`步骤10c1：✅ 输入目录存在: ${config.inputDir}`);
        
        if (!fs.existsSync(config.outputDir)) {
          throw new Error(`输出目录不存在: ${config.outputDir}`);
        }
        logToUI(`步骤10c2：✅ 输出目录存在: ${config.outputDir}`);
        
        if (!fs.existsSync(config.jsxFile)) {
          throw new Error(`JSX文件不存在: ${config.jsxFile}`);
        }
        logToUI(`步骤10c3：✅ JSX文件存在: ${config.jsxFile}`);
        
        // 检查输入目录中的文件
        logToUI('步骤10d：检查输入目录中的文件...');
        const files = fs.readdirSync(config.inputDir);
        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|bmp|tiff|psd)$/i.test(file));
        logToUI(`步骤10d：✅ 在输入目录中找到 ${imageFiles.length} 个图片文件`);
        
        if (imageFiles.length === 0) {
          logToUI('步骤10d：⚠️ 警告：输入目录中没有找到图片文件');
        } else {
          logToUI(`步骤10d：图片文件列表: ${imageFiles.slice(0, 5).join(', ')}${imageFiles.length > 5 ? '...' : ''}`);
        }
        
        // 执行批处理
        logToUI('步骤10e：开始执行Photoshop批处理...');
        const result = await ipcRenderer.invoke('run-batch', config);
        
        if (result.success) {
          logToUI('步骤10e：✅ 批处理启动成功');
          logToUI(`步骤10e：返回信息: ${result.message || '无额外信息'}`);
          alert('批处理已启动，请查看Photoshop窗口');
        } else {
          throw new Error(result.error || '批处理启动失败');
        }
        
      } catch (error) {
        logToUI(`步骤10：❌ 批处理执行失败: ${error.message}`, true);
        logToUI(`步骤10：错误堆栈: ${error.stack}`, true);
        alert('启动失败: ' + error.message);
      }
    });
    
    logToUI('步骤7：✅ 所有事件处理器绑定完成');
    logToUI('🎉 初始化完成！应用已准备就绪');
    
  } catch (error) {
    logToUI(`❌ 渲染进程初始化失败: ${error.message}`, true);
    logToUI(`❌ 错误堆栈: ${error.stack}`, true);
    
    // 显示错误信息到UI
    const logElement = document.querySelector('.log-output');
    if (logElement) {
      logElement.textContent = `初始化失败: ${error.message}\n\n详细错误信息:\n${error.stack}`;
    }
  }
});

console.log('渲染进程脚本加载完成');
