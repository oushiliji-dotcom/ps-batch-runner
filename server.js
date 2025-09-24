app.post('/api/run', (req, res) => {
  // ... existing code ...
  const {
    photoshopPath, // Photoshop.exe 路径
    jsxPath,       // 要运行的 JSX 脚本路径
    inputDir,      // 输入目录
    outputDir,     // 输出目录
    rulesJsonPath, // 规则定义文件（可选）
    headless,      // 是否隐藏窗口（仅供后续扩展）
    // 新增：代码文件夹（当输入目录不含SKU前缀时，在此目录继续查找）
    codeDir
  } = cfg;

  // 放宽条件：至少提供 inputDir 或 codeDir 其中之一
  if (!photoshopPath || !jsxPath || (!inputDir && !codeDir) || !outputDir) {
    return res.status(400).json({ ok: false, msg: '缺少必要参数：photoshopPath / jsxPath / (inputDir|codeDir) / outputDir' });
  }

  // 将业务参数通过环境变量传入 ExtendScript
  const env = Object.assign({}, process.env, {
    PS_INPUT_DIR: inputDir || '',
    PS_OUTPUT_DIR: outputDir,
    PS_RULES_JSON: rulesJsonPath || '',
    // 新增：代码文件夹
    PS_CODE_DIR: codeDir || ''
  });

  const child = spawn(photoshopPath, [jsxPath], {
    env,
    windowsHide: !!headless,
    detached: false,
  });
  // ... existing code ...
});
