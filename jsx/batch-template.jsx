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
  // 读取环境变量设置
  function getenv(k){ try { return $.getenv(k) || ''; } catch(e){ return ''; } }
  var INPUT = getenv('PS_INPUT_DIR');
  var OUTPUT = getenv('PS_OUTPUT_DIR');
  var RULES = getenv('PS_RULES_JSON');

  $.writeln('读取到输入目录: ' + INPUT);
  $.writeln('读取到输出目录: ' + OUTPUT);

  if(!INPUT || !OUTPUT){ 
    throw new Error('未能获取输入或输出目录环境变量！');
  }

  var inputFolder = new Folder(INPUT);
  var outputFolder = new Folder(OUTPUT);
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

  // 递归搜索特定名称的文件夹并返回所有匹配的文件夹
  function findAllFoldersByName(rootPath, targetFolderNames){
    $.writeln('开始搜索目标文件夹，根路径: ' + rootPath);
    var matchedFolders = [];
    function searchFolders(folderPath){
      var rootFolder = new Folder(folderPath);
      if(!rootFolder.exists){ 
        $.writeln('警告：文件夹不存在 - ' + folderPath);
        return; 
      }
      var entries = rootFolder.getFiles();
      $.writeln('扫描文件夹: ' + folderPath + '，找到 ' + entries.length + ' 个项目');
      
      for(var i=0;i<entries.length;i++){
        var item = entries[i];
        if(item instanceof Folder){
          $.writeln('检查文件夹: ' + item.name);
          // 检查文件夹名是否在目标列表中
          for(var j=0;j<targetFolderNames.length;j++){
            if(item.name === targetFolderNames[j]){ 
              $.writeln('找到匹配的目标文件夹: ' + item.name);
              matchedFolders.push(item); 
              break; 
            }
          }
          searchFolders(item.fsName); // 递归搜索子文件夹
        }
      }
    }
    searchFolders(rootPath);
    $.writeln('搜索完成，共找到 ' + matchedFolders.length + ' 个匹配的文件夹');
    return matchedFolders;
  }

  function processAndExportImages(folder, actionSetName, actionName, actionName2){
    $.writeln('开始处理文件夹: ' + folder.name);
    // 支持多种文件类型
    var files = folder.getFiles(function(file){ return (file instanceof File) && (/\.(jpg|jpeg|png|tif|tiff|psd)$/i).test(file.name); });
    $.writeln('文件夹 ' + folder.name + ' 中找到 ' + files.length + ' 个图片文件');
    
    if(files.length === 0){ 
      $.writeln('文件夹 ' + folder.name + ' 中没有图片文件，跳过');
      return; 
    }
    
    var sliceCounter = 1;
    for(var i=0;i<files.length;i++){
      var file = files[i];
      $.writeln('正在处理文件: ' + file.name);
      
      try {
        var doc = app.open(file);
        $.writeln('成功打开文件: ' + file.name);
        
        var w = doc.width.as('px');
        var h = doc.height.as('px');
        $.writeln('图片尺寸: ' + w + 'x' + h);
        
        // 根据文件夹名称和图片方向选择动作
        var actionToUse = actionName;
        if(folder.name === 'M001MT' || folder.name === 'M002MT' || folder.name === 'W011MW' || 
           folder.name === 'W011MB' || folder.name === 'W058MH' || folder.name === 'W011MR' || 
           folder.name === 'A060AC'){
          if(w > h){ 
            actionToUse = actionName;
            $.writeln('横向图片，使用动作: ' + actionToUse);
          } else { 
            actionToUse = actionName2;
            $.writeln('纵向图片，使用动作: ' + actionToUse);
          }
        } else {
          $.writeln('使用默认动作: ' + actionToUse);
        }
        
        // 尝试执行动作
        try{ 
          $.writeln('尝试执行动作: ' + actionToUse + ' (动作集: ' + actionSetName + ')');
          app.doAction(actionToUse, actionSetName); 
          $.writeln('动作执行成功');
        }catch(actionError){ 
          $.writeln('动作执行失败: ' + actionError.toString());
          $.writeln('将使用默认处理方式');
        }

        // 导出（按图层数计数命名，避免覆盖），保存到 OUTPUT
        $.writeln('开始导出文件');
        exportSlices(doc, file.name, sliceCounter, OUTPUT);
        sliceCounter += doc.artLayers.length;
        
        $.writeln('文件 ' + file.name + ' 处理完成');
      } catch(fileError) {
        $.writeln('处理文件时出错 ' + file.name + ': ' + fileError.toString());
      } finally { 
        if(doc) {
          doc.close(SaveOptions.DONOTSAVECHANGES); 
          $.writeln('关闭文档: ' + file.name);
        }
      }
    }
    $.writeln('文件夹 ' + folder.name + ' 处理完成');
  }

  function exportSlices(doc, baseFileName, startNumber, outDir){
    $.writeln('导出切片，基础文件名: ' + baseFileName);
    var options = new ExportOptionsSaveForWeb();
    options.format = SaveDocumentType.JPEG;
    options.quality = 90;
    var base = baseFileName.replace(/\.(jpg|jpeg|png|tif|tiff|psd)$/i, "");
    
    var layerCount = doc.artLayers.length;
    $.writeln('文档有 ' + layerCount + ' 个图层');
    
    for(var j=0;j<layerCount-1;j++){
      // 这里按图层数量导出整图，文件名带序号避免覆盖（ExtendScript 没有原生 slice，这里遵循用户代码的思路）
      var outName = base + '-' + (startNumber + j) + '.jpg';
      var outFile = new File(outDir + '/' + outName);
      $.writeln('导出文件: ' + outName);
      
      try {
        doc.exportDocument(outFile, ExportType.SAVEFORWEB, options);
        $.writeln('成功导出: ' + outName);
      } catch(exportError) {
        $.writeln('导出失败 ' + outName + ': ' + exportError.toString());
      }
    }
  }

  // 用户提供的目标文件夹名称列表（原样集成）
  var targetFolderNames = ['M001MT','M002MT','W013GZ','W003MM','W013LS','M013MT','W013LM','W036MZ','W003MN','C013SS','C012SS','W003SS','W034MW','W011MW','W011MR','W033BM','W011MB','W013SS','W034MW','A012SS','A010MZ','W010MZ','A012MS','A013MS','A037MS','W013WZ','W058MH','M003MT','A013BZ','W034ML','W010BM','W010LZ','A013WZ','P013WZ','A050DA','A050DB','A050DC','C086MU','M013ST','A060MB','A060MC','A060ME','A050DG','A060MG','A060MA','A050CB','A050CA','A050AA','A050AB','A060MH','A060MI','P003OL','M023AT','M023BT','M024BT','M024CT','M024MT','M056MT','M109AT','M109MT','M115MT','W032BT','W032BM','W058MV','W010MM','A060MD','M029MS','W012TA','W012TB','W012TC','A013SA','W003LS','A060AC','W121MA','W121MS','A060ML'];

  $.writeln('目标文件夹列表包含 ' + targetFolderNames.length + ' 个项目');

  // 执行：先在 INPUT 下查找匹配的目标文件夹，若找到则按动作批处理，否则执行通用模板处理
  var matched = findAllFoldersByName(INPUT, targetFolderNames);
  if(matched.length > 0){
    $.writeln('找到匹配的文件夹，开始批处理');
    for(var k=0;k<matched.length;k++){
      var folder = matched[k];
      var actionSetName = 'TIN';
      var actionName = folder.name;      // 根据文件夹名称选择动作
      var actionName2 = actionName + '-'; // 高大于宽时的动作（约定命名）
      $.writeln('处理文件夹: ' + folder.name + '，动作: ' + actionName + '/' + actionName2);
      processAndExportImages(folder, actionSetName, actionName, actionName2);
    }
  }else{
    $.writeln('未找到匹配的文件夹，执行通用批处理');
    // 回退通用批处理（遍历 INPUT 根目录下的文件）
    var exts = ['psd','jpg','jpeg','png','tif','tiff'];
    var files = inputFolder.getFiles(function(f){ if(f instanceof File){ var e=(f.name.split('.').pop()||'').toLowerCase(); return exts.indexOf(e)>=0; } return false; });
    $.writeln('根目录找到 ' + files.length + ' 个图片文件');
    
    function processOne(file){
      $.writeln('通用处理文件: ' + file.name);
      app.open(file);
      var doc = app.activeDocument;
      // 示例处理：导出为 JPEG，最大边 1024
      var maxSide = 1024;
      var w = doc.width.as('px');
      var h = doc.height.as('px');
      $.writeln('原始尺寸: ' + w + 'x' + h);
      
      var ratio = w>h ? maxSide/w : maxSide/h;
      if(ratio < 1){ 
        $.writeln('需要缩放，比例: ' + ratio);
        doc.resizeImage(UnitValue(w*ratio,'px'), UnitValue(h*ratio,'px'), null, ResampleMethod.BICUBIC); 
        $.writeln('缩放后尺寸: ' + doc.width.as('px') + 'x' + doc.height.as('px'));
      }
      
      var outPath = OUTPUT + '/' + file.displayName.replace(/\.[^.]+$/, '') + '.jpg';
      $.writeln('保存到: ' + outPath);
      var jpg = new JPEGSaveOptions(); jpg.quality = 10;
      doc.saveAs(new File(outPath), jpg, true);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      $.writeln('文件 ' + file.name + ' 通用处理完成');
    }
    
    for(var i=0;i<files.length;i++){ 
      try{ 
        processOne(files[i]); 
      }catch(err){ 
        $.writeln('通用处理文件出错 ' + files[i].name + ': ' + err.toString());
      } 
    }
  }

  // 设置状态供宿主读取
  $.setenv('PS_LAST_RUN_DONE','1');
  $.writeln('=== batch-template.jsx执行完毕 ===');

} catch (e) {
  // 捕获任何错误并打印出来！！！
  $.writeln('!!! JSX脚本发生严重错误: ' + e.toString() + ' (行号: ' + e.line + ')');
  // 抛出错误，让PS以非零退出码退出
  throw e;
}
