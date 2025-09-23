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

function getenv(k){ try { return $.getenv(k) || ''; } catch(e){ return ''; } }
var INPUT = getenv('PS_INPUT_DIR');
var OUTPUT = getenv('PS_OUTPUT_DIR');
var RULES = getenv('PS_RULES_JSON');

if(!INPUT || !OUTPUT){ alert('缺少环境变量: PS_INPUT_DIR / PS_OUTPUT_DIR'); throw new Error('Missing env'); }

var inputFolder = new Folder(INPUT);
var outputFolder = new Folder(OUTPUT);
if(!inputFolder.exists){ alert('输入目录不存在: '+INPUT); throw new Error('no input'); }
if(!outputFolder.exists){ outputFolder.create(); }

// 可选读取规则（当前逻辑不强依赖，可在未来扩展）
var rules = null;
if(RULES){ try{ var rf = new File(RULES); if(rf.exists){ rf.open('r'); var txt = rf.read(); rf.close(); rules = JSON.parse(txt); } }catch(err){ rules = null; }
}

// 递归搜索特定名称的文件夹并返回所有匹配的文件夹
function findAllFoldersByName(rootPath, targetFolderNames){
  var matchedFolders = [];
  function searchFolders(folderPath){
    var rootFolder = new Folder(folderPath);
    if(!rootFolder.exists){ alert('根文件夹不存在，请检查路径：' + folderPath); return; }
    var entries = rootFolder.getFiles();
    for(var i=0;i<entries.length;i++){
      var item = entries[i];
      if(item instanceof Folder){
        // 检查文件夹名是否在目标列表中
        for(var j=0;j<targetFolderNames.length;j++){
          if(item.name === targetFolderNames[j]){ matchedFolders.push(item); break; }
        }
        searchFolders(item.fsName); // 递归搜索子文件夹
      }
    }
  }
  searchFolders(rootPath);
  return matchedFolders;
}

function processAndExportImages(folder, actionSetName, actionName, actionName2){
  // 支持多种文件类型
  var files = folder.getFiles(function(file){ return (file instanceof File) && (/\.(jpg|jpeg|png|tif|tiff|psd)$/i).test(file.name); });
  if(files.length === 0){ /* 无图则跳过该文件夹 */ return; }
  var sliceCounter = 1;
  for(var i=0;i<files.length;i++){
    var file = files[i];
    var doc = app.open(file);
    try{
      var w = doc.width.as('px');
      var h = doc.height.as('px');
      if(folder.name === 'M001MT' || folder.name === 'M002MT' || folder.name === 'W011MW' || folder.name === 'W011MB' || folder.name === 'W058MH' || folder.name === 'W011MR' || folder.name === 'A060AC'){
        if(w > h){ try{ app.doAction(actionName, actionSetName); }catch(e){ /* 动作缺失则忽略并回退 */ } }
        else { try{ app.doAction(actionName2, actionSetName); }catch(e){ /* 动作缺失则忽略并回退 */ } }
      }else{
        try{ app.doAction(actionName, actionSetName); }catch(e){ /* 动作缺失则忽略并回退 */ }
      }

      // 导出（按图层数计数命名，避免覆盖），保存到 OUTPUT
      exportSlices(doc, file.name, sliceCounter, OUTPUT);
      sliceCounter += doc.artLayers.length;
    }catch(err){ /* 可扩展写入日志 */ }
    finally{ doc.close(SaveOptions.DONOTSAVECHANGES); }
  }
}

function exportSlices(doc, baseFileName, startNumber, outDir){
  var options = new ExportOptionsSaveForWeb();
  options.format = SaveDocumentType.JPEG;
  options.quality = 90;
  var base = baseFileName.replace(/\.(jpg|jpeg|png|tif|tiff|psd)$/i, "");
  for(var j=0;j<doc.artLayers.length-1;j++){
    // 这里按图层数量导出整图，文件名带序号避免覆盖（ExtendScript 没有原生 slice，这里遵循用户代码的思路）
    var outName = base + '-' + (startNumber + j) + '.jpg';
    var outFile = new File(outDir + '/' + outName);
    doc.exportDocument(outFile, ExportType.SAVEFORWEB, options);
  }
}

// 用户提供的目标文件夹名称列表（原样集成）
var targetFolderNames = ['M001MT','M002MT','W013GZ','W003MM','W013LS','M013MT','W013LM','W036MZ','W003MN','C013SS','C012SS','W003SS','W034MW','W011MW','W011MR','W033BM','W011MB','W013SS','W034MW','A012SS','A010MZ','W010MZ','A012MS','A013MS','A037MS','W013WZ','W058MH','M003MT','A013BZ','W034ML','W010BM','W010LZ','A013WZ','P013WZ','A050DA','A050DB','A050DC','C086MU','M013ST','A060MB','A060MC','A060ME','A050DG','A060MG','A060MA','A050CB','A050CA','A050AA','A050AB','A060MH','A060MI','P003OL','M023AT','M023BT','M024BT','M024CT','M024MT','M056MT','M109AT','M109MT','M115MT','W032BT','W032BM','W058MV','W010MM','A060MD','M029MS','W012TA','W012TB','W012TC','A013SA','W003LS','A060AC','W121MA','W121MS','A060ML'];

// 执行：先在 INPUT 下查找匹配的目标文件夹，若找到则按动作批处理，否则执行通用模板处理
var matched = findAllFoldersByName(INPUT, targetFolderNames);
if(matched.length > 0){
  for(var k=0;k<matched.length;k++){
    var folder = matched[k];
    var actionSetName = 'TIN';
    var actionName = folder.name;      // 根据文件夹名称选择动作
    var actionName2 = actionName + '-'; // 高大于宽时的动作（约定命名）
    processAndExportImages(folder, actionSetName, actionName, actionName2);
  }
}else{
  // 回退通用批处理（遍历 INPUT 根目录下的文件）
  var exts = ['psd','jpg','jpeg','png','tif','tiff'];
  var files = inputFolder.getFiles(function(f){ if(f instanceof File){ var e=(f.name.split('.').pop()||'').toLowerCase(); return exts.indexOf(e)>=0; } return false; });
  function processOne(file){
    app.open(file);
    var doc = app.activeDocument;
    // 示例处理：导出为 JPEG，最大边 1024
    var maxSide = 1024;
    var w = doc.width.as('px');
    var h = doc.height.as('px');
    var ratio = w>h ? maxSide/w : maxSide/h;
    if(ratio < 1){ doc.resizeImage(UnitValue(w*ratio,'px'), UnitValue(h*ratio,'px'), null, ResampleMethod.BICUBIC); }
    var outPath = OUTPUT + '/' + file.displayName.replace(/\.[^.]+$/, '') + '.jpg';
    var jpg = new JPEGSaveOptions(); jpg.quality = 10;
    doc.saveAs(new File(outPath), jpg, true);
    doc.close(SaveOptions.DONOTSAVECHANGES);
  }
  for(var i=0;i<files.length;i++){ try{ processOne(files[i]); }catch(err){ /* 记录错误：可扩展写入日志 */ } }
}

// 设置状态供宿主读取
$.setenv('PS_LAST_RUN_DONE','1');
// app.bringToFront();