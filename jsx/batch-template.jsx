// #target photoshop  // 由 Photoshop.exe 直接执行时可省略，保留注释避免通用 Linter 报错
/*
  集成用户提供的判断逻辑：
  - 通过输入目录递归查找目标文件夹名
  - 针对匹配的文件夹，根据图片横竖执行不同的动作（actionName / actionName2）
  - 导出为 JPEG（Save For Web），输出到输出目录
  - 若未匹配到目标文件夹或动作不存在，回退到通用批处理（最大边 1024 导出 JPG）

  环境变量（由宿主 server.js 注入）：
  - PS_INPUT_DIR: 输入目录
  - PS_OUTPUT_DIR: 输出目录
  - PS_RULES_JSON: 规则 JSON（可选，不在此逻辑中强依赖）
*/

// 在脚本的最开始
$.writeln('=== batch-template.jsx开始执行 ===');

// 包装在 try-catch 中以捕获具体错误
try {
  // 读取环境变量设置 - 增强版本
  function getenv(k){ 
    try { 
      var value = $.getenv(k) || ''; 
      $.writeln('环境变量 ' + k + ': ' + (value ? value : '(空值)'));
      return value;
    } catch(e){ 
      $.writeln('读取环境变量 ' + k + ' 失败: ' + e.toString());
      return ''; 
    } 
  }
  
  var INPUT = getenv('PS_INPUT_DIR');
  var OUTPUT = getenv('PS_OUTPUT_DIR');
  var RULES = getenv('PS_RULES_JSON');

  $.writeln('读取到输入目录: ' + INPUT);
  $.writeln('读取到输出目录: ' + OUTPUT);

  // 如果环境变量为空，尝试使用默认值或提示用户
  if(!INPUT || !OUTPUT){ 
    $.writeln('警告：环境变量为空，尝试使用备用方案');
    
    // 备用方案：尝试从当前脚本目录推断路径
    if(!INPUT) {
      var scriptFile = new File($.fileName);
      var scriptFolder = scriptFile.parent.parent; // 上两级目录
      INPUT = scriptFolder.fsName;
      $.writeln('使用脚本目录作为输入目录: ' + INPUT);
    }
    
    if(!OUTPUT) {
      OUTPUT = INPUT + '/output';
      $.writeln('使用默认输出目录: ' + OUTPUT);
    }
  }

  var inputFolder = new Folder(INPUT);
  var outputFolder = new Folder(OUTPUT);
  
  $.writeln('检查输入文件夹存在性: ' + inputFolder.exists);
  if(!inputFolder.exists){ 
    throw new Error('输入目录不存在: '+INPUT); 
  }
  if(!outputFolder.exists){ 
    outputFolder.create(); 
    $.writeln('创建输出目录: ' + OUTPUT);
  }

  // 可选读取规则（当前逻辑不强依赖，可在未来扩展）
  var rules = null;
  if(RULES){ 
    try{ 
      var rf = new File(RULES); 
      if(rf.exists){ 
        rf.open('r'); 
        var txt = rf.read(); 
        rf.close(); 
        rules = JSON.parse(txt); 
        $.writeln('成功读取规则文件');
      } 
    }catch(err){ 
      $.writeln('读取规则文件失败: ' + err.toString());
      rules = null; 
    }
  }

  // 从文件名中提取SKU前缀的函数
  function extractSKUPrefix(filename) {
    // 匹配类似 A060MB-TX-001.png 或 M001MT-001.jpg 中的 SKU 部分
    // 支持多种格式：字母+数字+字母的组合
    var patterns = [
      /^([A-Z]\d{3}[A-Z]{2})/,  // 原始模式：A060MB
      /^([A-Z]\d{3}[A-Z]{1,3})/, // 扩展模式：支持1-3个字母结尾
      /^([A-Z]{1,2}\d{3}[A-Z]{1,3})/ // 更灵活的模式
    ];
    
    for (var i = 0; i < patterns.length; i++) {
      var match = filename.match(patterns[i]);
      if (match) {
        var extracted = match[1];
        $.writeln('文件 ' + filename + ' 提取SKU: ' + extracted + ' (使用模式' + (i+1) + ')');
        return extracted;
      }
    }
    
    $.writeln('警告: 无法从文件名 ' + filename + ' 中提取SKU前缀');
    return null;
  }

  // 扫描输入目录中的所有图片文件并按SKU前缀分组
  function scanAndGroupFiles(inputPath) {
    $.writeln('开始扫描输入目录: ' + inputPath);
    var inputFolder = new Folder(inputPath);
    if (!inputFolder.exists) {
      throw new Error('输入目录不存在: ' + inputPath);
    }

    var imageExtensions = ['png', 'jpg', 'jpeg', 'psd', 'tif', 'tiff'];
    var allFiles = inputFolder.getFiles(function(file) {
      if (file instanceof File) {
        var ext = file.name.split('.').pop().toLowerCase();
        return imageExtensions.indexOf(ext) >= 0;
      }
      return false;
    });

    $.writeln('找到 ' + allFiles.length + ' 个图片文件');

    // 按SKU前缀分组
    var groupedFiles = {};
    var processedCount = 0;
    
    for (var i = 0; i < allFiles.length; i++) {
      var file = allFiles[i];
      var skuPrefix = extractSKUPrefix(file.name);
      
      if (skuPrefix) {
        if (!groupedFiles[skuPrefix]) {
          groupedFiles[skuPrefix] = [];
        }
        groupedFiles[skuPrefix].push(file);
        processedCount++;
        $.writeln('文件 ' + file.name + ' -> SKU前缀: ' + skuPrefix);
      } else {
        $.writeln('无法识别SKU前缀的文件: ' + file.name);
      }
    }

    $.writeln('成功分组 ' + processedCount + ' 个文件，共 ' + Object.keys(groupedFiles).length + ' 个SKU组');
    return groupedFiles;
  }

  // 处理单个文件的函数
  function processImageFile(file, outputPath) {
    $.writeln('处理文件: ' + file.name);
    
    try {
      app.open(file);
      var doc = app.activeDocument;
      
      // 示例处理：调整尺寸并导出为JPEG
      var maxSide = 1024;
      var w = doc.width.as('px');
      var h = doc.height.as('px');
      $.writeln('原始尺寸: ' + w + 'x' + h);
      
      var ratio = w > h ? maxSide / w : maxSide / h;
      if (ratio < 1) {
        $.writeln('需要缩放，比例: ' + ratio);
        doc.resizeImage(UnitValue(w * ratio, 'px'), UnitValue(h * ratio, 'px'), null, ResampleMethod.BICUBIC);
        $.writeln('缩放后尺寸: ' + doc.width.as('px') + 'x' + doc.height.as('px'));
      }
      
      var outputFile = new File(outputPath + '/' + file.displayName.replace(/\.[^.]+$/, '') + '.jpg');
      $.writeln('保存到: ' + outputFile.fsName);
      
      var jpgOptions = new JPEGSaveOptions();
      jpgOptions.quality = 10;
      doc.saveAs(outputFile, jpgOptions, true);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      
      $.writeln('✓ 文件 ' + file.name + ' 处理完成');
      return true;
    } catch (err) {
      $.writeln('✗ 处理文件 ' + file.name + ' 时出错: ' + err.toString());
      try {
        if (app.documents.length > 0) {
          app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
      } catch (e) {}
      return false;
    }
  }

  // 用户提供的目标文件夹名列表（主程序读取此变量）
  var targetFolderNames = ['M001MT','M002MT','W013GZ','W003MM','W013LS','M013MT','W013LM','W036MZ','W003MN','C013SS','C012SS','W003SS','W034MW','W011MW','W011MR','W033BM','W011MB','W013SS','W034MW','A012SS','A010MZ','W010MZ','A012MS','A013MS','A037MS','W013WZ','W058MH','M003MT','A013BZ','W034ML','W010BM','W010LZ','A013WZ','P013WZ','A050DA','A050DB','A050DC','C086MU','M013ST','A060MB','A060MC','A060ME','A050DG','A060MG','A060MA','A050CB','A050CA','A050AA','A050AB','A060MH','A060MI','P003OL','M023AT','M023BT','M024BT','M024CT','M024MT','M056MT','M109AT','M109MT','M115MT','W032BT','W032BM','W058MV','W010MM','A060MD','M029MS','W012TA','W012TB','W012TC','A013SA','W003LS','A060AC','W121MA','W121MS','A060ML'];

  $.writeln('目标文件夹名列表包含 ' + targetFolderNames.length + ' 个项目');
  $.writeln('targetFolderNames数组验证: ' + (targetFolderNames.length > 0 ? '正常' : '异常-数组为空'));
  
  // 输出前几个项目用于调试
  if(targetFolderNames.length > 0) {
    $.writeln('前5个目标文件夹名: ' + targetFolderNames.slice(0, 5).join(', '));
  }

  // 主处理逻辑
  $.writeln('=== 开始基于文件的批处理 ===');
  
  // 扫描并分组文件
  var groupedFiles = scanAndGroupFiles(INPUT);
  var skuGroups = Object.keys(groupedFiles);
  
  if (skuGroups.length === 0) {
    $.writeln('警告: 未找到任何可识别的SKU文件');
    throw new Error('输入目录中没有找到符合命名规范的图片文件');
  }

  $.writeln('找到以下SKU组: ' + skuGroups.join(', '));

  // 处理每个SKU组 - 只处理目标列表中的SKU
  var totalProcessed = 0;
  var totalErrors = 0;
  var skippedSKUs = [];

  for (var i = 0; i < skuGroups.length; i++) {
    var sku = skuGroups[i];
    
    // 检查SKU是否在目标列表中
    if (targetFolderNames.indexOf(sku) >= 0) {
      var files = groupedFiles[sku];
      
      $.writeln('--- 处理目标SKU组: ' + sku + ' (' + files.length + ' 个文件) ---');
      
      // 为每个SKU创建输出子目录
      var skuOutputDir = OUTPUT + '/' + sku;
      var skuOutputFolder = new Folder(skuOutputDir);
      if (!skuOutputFolder.exists) {
        skuOutputFolder.create();
        $.writeln('创建SKU输出目录: ' + skuOutputDir);
      }
      
      // 处理该SKU组的所有文件
      for (var j = 0; j < files.length; j++) {
        if (processImageFile(files[j], skuOutputDir)) {
          totalProcessed++;
        } else {
          totalErrors++;
        }
      }
    } else {
      // 跳过不在目标列表中的SKU
      skippedSKUs.push(sku);
      $.writeln('跳过非目标SKU: ' + sku + ' (' + groupedFiles[sku].length + ' 个文件)');
    }
  }

  // 输出跳过的SKU统计
  if (skippedSKUs.length > 0) {
    $.writeln('跳过的SKU组: ' + skippedSKUs.join(', '));
  }

  $.writeln('=== 批处理完成 ===');
  $.writeln('总计处理: ' + totalProcessed + ' 个文件');
  $.writeln('处理失败: ' + totalErrors + ' 个文件');
  $.writeln('目标文件夹组数量: ' + (skuGroups.length - skippedSKUs.length));
  $.writeln('跳过文件夹组数量: ' + skippedSKUs.length);

  // 设置状态供宿主读取
  $.setenv('PS_LAST_RUN_DONE','1');
  $.setenv('PS_PROCESSED_COUNT', totalProcessed.toString());
  $.setenv('PS_ERROR_COUNT', totalErrors.toString());
  $.writeln('=== batch-template.jsx执行完毕 ===');
  $.writeln('最终统计: 成功处理 ' + totalProcessed + ' 个文件，失败 ' + totalErrors + ' 个文件');

} catch (e) {
  // 捕获任何错误并打印出来！！！
  var errorMsg = '!!! JSX脚本发生严重错误: ' + e.toString();
  if (e.line) {
    errorMsg += ' (行号: ' + e.line + ')';
  }
  if (e.fileName) {
    errorMsg += ' (文件: ' + e.fileName + ')';
  }
  $.writeln(errorMsg);
  
  // 打印调试信息
  $.writeln('调试信息:');
  $.writeln('- 输入目录: ' + (typeof INPUT !== 'undefined' ? INPUT : '未定义'));
  $.writeln('- 输出目录: ' + (typeof OUTPUT !== 'undefined' ? OUTPUT : '未定义'));
  $.writeln('- 规则文件: ' + (typeof RULES !== 'undefined' ? RULES : '未定义'));
  $.writeln('- 总处理文件数: ' + (typeof totalProcessed !== 'undefined' ? totalProcessed : '未定义'));
  $.writeln('- 错误文件数: ' + (typeof totalErrors !== 'undefined' ? totalErrors : '未定义'));
  
  // 设置错误状态
  $.setenv('PS_LAST_RUN_ERROR', errorMsg);
  $.setenv('PS_LAST_RUN_DONE', '0');
  
  // 不重新抛出错误，让脚本正常退出
  // throw e;
}
