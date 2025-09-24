// 文件顶层变量区域
// ... existing code ...
var INPUT = getenv('PS_INPUT_DIR');
var OUTPUT = getenv('PS_OUTPUT_DIR');
var RULES = getenv('PS_RULES_JSON');
// 新增：代码文件夹
var CODE  = getenv('PS_CODE_DIR');

// 关闭 Photoshop 的对话框弹窗，避免动作缺失弹窗打断
app.displayDialogs = DialogModes.NO;

// 基本校验调整：至少要有 OUTPUT，且 INPUT 或 CODE 二选一
if(!OUTPUT){ alert('缺少环境变量: PS_OUTPUT_DIR'); throw new Error('Missing env'); }
if(!INPUT && !CODE){ alert('缺少输入目录：PS_INPUT_DIR 或 PS_CODE_DIR'); throw new Error('Missing env'); }

var inputFolder  = INPUT ? new Folder(INPUT) : null;
var codeFolder   = CODE  ? new Folder(CODE)  : null;
var outputFolder = new Folder(OUTPUT);

if(inputFolder && !inputFolder.exists){ alert('输入目录不存在: '+INPUT); throw new Error('no input'); }
if(codeFolder  && !codeFolder.exists){  alert('代码目录不存在: '+CODE);  throw new Error('no code'); }
if(!outputFolder.exists){ outputFolder.create(); }

// ... existing code ...

// 执行：先在 INPUT 下查找匹配的目标文件夹，若未命中再到 CODE 目录查找；都未命中才回退通用处理
var matchedInput = INPUT ? findAllFoldersByName(INPUT, targetFolderNames) : [];
var matchedCode  = (matchedInput.length === 0 && CODE) ? findAllFoldersByName(CODE, targetFolderNames) : [];
var matched      = matchedInput.length > 0 ? matchedInput : matchedCode;

if(matched.length > 0){
  for(var k=0;k<matched.length;k++){
    var folder = matched[k];
    var actionSetName = 'TIN';
    var actionName = folder.name;       // 根据文件夹名称选择动作
    var actionName2 = actionName + '-'; // 高大于宽时的动作（约定命名）
    processAndExportImages(folder, actionSetName, actionName, actionName2);
  }
}else{
  // 通用回退：优先在 INPUT 目录处理；若没有提供 INPUT，则转而在 CODE 目录处理
  var root = inputFolder ? inputFolder : codeFolder;
  var exts = ['psd','jpg','jpeg','png','tif','tiff'];
  var files = root.getFiles(function(f){
    if(f instanceof File){
      var e=(f.name.split('.').pop()||'').toLowerCase();
      return exts.indexOf(e)>=0;
    }
    return false;
  });
  function processOne(file){
    app.open(file);
    var doc = app.activeDocument;
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

// ... existing code ...
