// #target photoshop
/*
  增强版批处理脚本 - 包含详细日志和错误处理
*/

// 日志函数
function writeLog(message) {
  var logFile = getenv('PS_LOG_FILE');
  if (logFile) {
    try {
      var file = new File(logFile);
      file.open('a');
      file.writeln(new Date().toISOString() + ' - ' + message);
      file.close();
    } catch (e) {
      // 如果无法写入日志文件，至少输出到控制台
      $.writeln('LOG: ' + message);
    }
  } else {
    $.writeln('LOG: ' + message);
  }
}

function getenv(k) { 
  try { 
    return $.getenv(k) || ''; 
  } catch(e) { 
    writeLog('获取环境变量失败: ' + k + ' - ' + e.message);
    return ''; 
  } 
}

// 禁用对话框
app.displayDialogs = DialogModes.NO;

writeLog('=== JSX 脚本开始执行 ===');

var INPUT = getenv('PS_INPUT_DIR');
var OUTPUT = getenv('PS_OUTPUT_DIR');
var RULES = getenv('PS_RULES_JSON');
var TOTAL_IMAGES = parseInt(getenv('PS_TOTAL_IMAGES') || '0');

writeLog('环境变量读取:');
writeLog('  INPUT: ' + INPUT);
writeLog('  OUTPUT: ' + OUTPUT);
writeLog('  RULES: ' + RULES);
writeLog('  TOTAL_IMAGES: ' + TOTAL_IMAGES);

if (!INPUT || !OUTPUT) {
  var errorMsg = '缺少环境变量: PS_INPUT_DIR / PS_OUTPUT_DIR';
  writeLog('❌ ' + errorMsg);
  alert(errorMsg);
  throw new Error('Missing env');
}

var inputFolder = new Folder(INPUT);
var outputFolder = new Folder(OUTPUT);

if (!inputFolder.exists) {
  var errorMsg = '输入目录不存在: ' + INPUT;
  writeLog('❌ ' + errorMsg);
  alert(errorMsg);
  throw new Error('no input');
}

if (!outputFolder.exists) {
  writeLog('创建输出目录: ' + OUTPUT);
  outputFolder.create();
}

writeLog('✅ 目录检查完成');

// 递归搜索特定名称的文件夹
function findAllFoldersByName(rootPath, targetFolderNames) {
  writeLog('开始搜索目标文件夹...');
  var matchedFolders = [];
  var searchedCount = 0;
  
  function searchFolders(folderPath) {
    var rootFolder = new Folder(folderPath);
    if (!rootFolder.exists) {
      writeLog('⚠️ 文件夹不存在: ' + folderPath);
      return;
    }
    
    var entries = rootFolder.getFiles();
    for (var i = 0; i < entries.length; i++) {
      var item = entries[i];
      if (item instanceof Folder) {
        searchedCount++;
        if (searchedCount % 10 === 0) {
          writeLog('已搜索 ' + searchedCount + ' 个文件夹...');
        }
        
        // 检查文件夹名是否在目标列表中
        for (var j = 0; j < targetFolderNames.length; j++) {
          if (item.name === targetFolderNames[j]) {
            matchedFolders.push(item);
            writeLog('✅ 找到匹配文件夹: ' + item.name);
            break;
          }
        }
        searchFolders(item.fsName); // 递归搜索子文件夹
      }
    }
  }
  
  searchFolders(rootPath);
  writeLog('搜索完成，共搜索 ' + searchedCount + ' 个文件夹，找到 ' + matchedFolders.length + ' 个匹配项');
  return matchedFolders;
}

function processAndExportImages(folder, actionSetName, actionName, actionName2) {
  writeLog('开始处理文件夹: ' + folder.name);
  
  // 支持多种文件类型
  var files = folder.getFiles(function(file) {
    return (file instanceof File) && (/\.(jpg|jpeg|png|tif|tiff|psd)$/i).test(file.name);
  });
  
  if (files.length === 0) {
    writeLog('⚠️ 文件夹中没有图像文件: ' + folder.name);
    return;
  }
  
  writeLog('找到 ' + files.length + ' 个图像文件');
  var processedFiles = 0;
  var errorFiles = 0;
  
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    writeLog('处理文件 (' + (i + 1) + '/' + files.length + '): ' + file.name);
    
    try {
      var doc = app.open(file);
      
      try {
        var w = doc.width.as('px');
        var h = doc.height.as('px');
        writeLog('  图像尺寸: ' + w + 'x' + h);
        
        var actionToUse = actionName;
        
        // 特殊文件夹的横竖判断
        if (folder.name === 'M001MT' || folder.name === 'M002MT' || folder.name === 'W011MW' || 
            folder.name === 'W011MB' || folder.name === 'W058MH' || folder.name === 'W011MR' || 
            folder.name === 'A060AC') {
          if (w > h) {
            actionToUse = actionName;
            writeLog('  使用横向动作: ' + actionToUse);
          } else {
            actionToUse = actionName2;
            writeLog('  使用竖向动作: ' + actionToUse);
          }
        } else {
          writeLog('  使用默认动作: ' + actionToUse);
        }
        
        // 执行动作
        try {
          app.doAction(actionToUse, actionSetName);
          writeLog('  ✅ 动作执行成功');
        } catch (actionError) {
          writeLog('  ⚠️ 动作执行失败: ' + actionError.message + '，使用通用处理');
          // 通用处理：调整大小并保存
          var maxSide = 1024;
          var ratio = w > h ? maxSide / w : maxSide / h;
          if (ratio < 1) {
            doc.resizeImage(UnitValue(w * ratio, 'px'), UnitValue(h * ratio, 'px'), null, ResampleMethod.BICUBIC);
            writeLog('  调整尺寸为: ' + (w * ratio) + 'x' + (h * ratio));
          }
        }

        // 导出文件
        try {
          exportSlices(doc, file.name, 1, OUTPUT);
          writeLog('  ✅ 导出成功');
          processedFiles++;
        } catch (exportError) {
          writeLog('  ❌ 导出失败: ' + exportError.message);
          errorFiles++;
        }
        
      } catch (processError) {
        writeLog('  ❌ 处理失败: ' + processError.message);
        errorFiles++;
      } finally {
        doc.close(SaveOptions.DONOTSAVECHANGES);
      }
      
    } catch (openError) {
      writeLog('  ❌ 无法打开文件: ' + openError.message);
      errorFiles++;
    }
  }
  
  writeLog('文件夹 ' + folder.name + ' 处理完成:');
  writeLog('  成功: ' + processedFiles + ' 个文件');
  writeLog('  失败: ' + errorFiles + ' 个文件');
}

function exportSlices(doc, baseFileName, startNumber, outDir) {
  var options = new ExportOptionsSaveForWeb();
  options.format = SaveDocumentType.JPEG;
  options.quality = 90;
  
  var base = baseFileName.replace(/\.(jpg|jpeg|png|tif|tiff|psd)$/i, "");
  var layerCount = Math.max(1, doc.artLayers.length);
  
  for (var j = 0; j < layerCount; j++) {
    var outName = base + (layerCount > 1 ? '-' + (startNumber + j) : '') + '.jpg';
    var outFile = new File(outDir + '/' + outName);
    doc.exportDocument(outFile, ExportType.SAVEFORWEB, options);
  }
}

// 目标文件夹名称列表
var targetFolderNames = ['M001MT','M002MT','W013GZ','W003MM','W013LS','M013MT','W013LM','W036MZ','W003MN','C013SS','C012SS','W003SS','W034MW','W011MW','W011MR','W033BM','W011MB','W013SS','W034MW','A012SS','A010MZ','W010MZ','A012MS','A013MS','A037MS','W013WZ','W058MH','M003MT','A013BZ','W034ML','W010BM','W010LZ','A013WZ','P013WZ','A050DA','A050DB','A050DC','C086MU','M013ST','A060MB','A060MC','A060ME','A050DG','A060MG','A060MA','A050CB','A050CA','A050AA','A050AB','A060MH','A060MI','P003OL','M023AT','M023BT','M024BT','M024CT','M024MT','M056MT','M109AT','M109MT','M115MT','W032BT','W032BM','W058MV','W010MM','A060MD','M029MS','W012TA','W012TB','W012TC','A013SA','W003LS','A060AC','W121MA','W121MS','A060ML'];

// 执行主要处理逻辑
try {
  var matched = findAllFoldersByName(INPUT, targetFolderNames);
  
  if (matched.length > 0) {
    writeLog('🎯 使用专用处理模式，处理 ' + matched.length + ' 个匹配文件夹');
    
    for (var k = 0; k < matched.length; k++) {
      var folder = matched[k];
      var actionSetName = 'TIN';
      var actionName = folder.name;
      var actionName2 = actionName + '-';
      
      writeLog('处理文件夹 (' + (k + 1) + '/' + matched.length + '): ' + folder.name);
      processAndExportImages(folder, actionSetName, actionName, actionName2);
    }
    
  } else {
    writeLog('🔄 使用通用处理模式');
    
    // 通用批处理
    var exts = ['psd', 'jpg', 'jpeg', 'png', 'tif', 'tiff'];
    var files = inputFolder.getFiles(function(f) {
      if (f instanceof File) {
        var e = (f.name.split('.').pop() || '').toLowerCase();
        return exts.indexOf(e) >= 0;
      }
      return false;
    });
    
    writeLog('找到 ' + files.length + ' 个图像文件进行通用处理');
    
    function processOne(file, index) {
      writeLog('通用处理 (' + (index + 1) + '/' + files.length + '): ' + file.name);
      
      try {
        app.open(file);
        var doc = app.activeDocument;
        
        // 调整大小
        var maxSide = 1024;
        var w = doc.width.as('px');
        var h = doc.height.as('px');
        var ratio = w > h ? maxSide / w : maxSide / h;
        
        if (ratio < 1) {
          doc.resizeImage(UnitValue(w * ratio, 'px'), UnitValue(h * ratio, 'px'), null, ResampleMethod.BICUBIC);
          writeLog('  调整尺寸: ' + w + 'x' + h + ' -> ' + (w * ratio) + 'x' + (h * ratio));
        }
        
        // 保存
        var outPath = OUTPUT + '/' + file.displayName.replace(/\.[^.]+$/, '') + '.jpg';
        var jpg = new JPEGSaveOptions();
        jpg.quality = 10;
        doc.saveAs(new File(outPath), jpg, true);
        doc.close(SaveOptions.DONOTSAVECHANGES);
        
        writeLog('  ✅ 通用处理完成');
        
      } catch (err) {
        writeLog('  ❌ 通用处理失败: ' + err.message);
      }
    }
    
    for (var i = 0; i < files.length; i++) {
      processOne(files[i], i);
    }
  }
  
  writeLog('✅ 所有处理完成');
  
} catch (mainError) {
  writeLog('❌ 主要处理过程出错: ' + mainError.message);
  throw mainError;
}

// 设置完成标志
$.setenv('PS_LAST_RUN_DONE', '1');
writeLog('=== JSX 脚本执行结束 ===');
