# Windows系统 Photoshop脚本执行方案

本工具在Windows系统下提供了多种稳定的Photoshop脚本执行方式，解决了传统方法中可能出现的重复执行和不稳定问题。

## 🚀 执行方式概览

### 1. VBScript COM自动化（推荐）
- **文件**: `run-ps-script.vbs`
- **优势**: 直接与Photoshop COM接口通信，最稳定
- **使用方法**: 
  ```cmd
  cscript run-ps-script.vbs "脚本路径.jsx"
  ```

### 2. PowerShell COM自动化（备用）
- **文件**: `run-ps-script-powershell.ps1`
- **优势**: 现代化PowerShell语法，错误处理更完善
- **使用方法**: 
  ```powershell
  powershell -ExecutionPolicy Bypass -File run-ps-script-powershell.ps1 "脚本路径.jsx"
  ```

### 3. 批处理文件（拖拽支持）
- **文件**: `run-ps-script.bat`
- **优势**: 支持拖拽JSX文件执行，用户友好
- **使用方法**: 直接将JSX文件拖拽到BAT文件上

## 🔧 技术原理

### COM接口自动化
所有Windows方案都基于Adobe Photoshop的COM接口：

1. **连接Photoshop实例**
   - 优先连接现有运行的Photoshop
   - 如果没有运行实例，自动启动新的

2. **版本兼容性**
   - 自动检测并支持多个Photoshop版本
   - 支持Photoshop 2020、2021、2022等

3. **脚本执行**
   - 使用`DoJavaScript`方法执行JSX脚本
   - 禁用对话框避免用户交互中断

## 📋 使用步骤

### 方式一：通过主程序自动选择
1. 运行主程序 `npm start` 或 `node server.js`
2. 程序会自动检测Windows系统并使用VBScript方式
3. 如果VBScript失败，自动切换到PowerShell方式

### 方式二：直接使用批处理文件
1. 将JSX脚本文件拖拽到 `run-ps-script.bat` 上
2. 系统会自动调用VBScript执行脚本
3. 支持同时拖拽多个JSX文件

### 方式三：命令行执行
```cmd
# 使用VBScript
cscript //NoLogo run-ps-script.vbs "your-script.jsx"

# 使用PowerShell
powershell -ExecutionPolicy Bypass -File run-ps-script-powershell.ps1 "your-script.jsx"
```

## ⚠️ 注意事项

### 系统要求
- Windows 7 或更高版本
- 已安装Adobe Photoshop（2020或更高版本推荐）
- 启用Windows Script Host（默认启用）

### 权限设置
- **VBScript**: 通常无需特殊权限
- **PowerShell**: 可能需要设置执行策略
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

### 故障排除

#### 1. "无法启动Photoshop"错误
- 确保Photoshop已正确安装
- 检查Photoshop是否支持COM自动化
- 尝试手动启动Photoshop一次

#### 2. "脚本执行失败"错误
- 检查JSX脚本语法是否正确
- 确保脚本文件路径不包含特殊字符
- 查看详细错误信息进行调试

#### 3. PowerShell执行策略错误
```powershell
# 临时允许脚本执行
powershell -ExecutionPolicy Bypass -File script.ps1

# 永久设置（推荐）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## 🔄 与macOS版本的区别

| 特性 | Windows版本 | macOS版本 |
|------|-------------|-----------|
| 主要技术 | COM自动化 | AppleScript |
| 执行方式 | VBScript/PowerShell | osascript |
| 拖拽支持 | ✅ 批处理文件 | ✅ AppleScript |
| 版本检测 | ✅ 自动检测 | ✅ 自动检测 |
| 错误处理 | ✅ 完善 | ✅ 完善 |

## 📈 性能优化

1. **实例复用**: 优先使用现有Photoshop实例，避免重复启动
2. **超时控制**: 设置60秒超时，防止无限等待
3. **内存管理**: 自动清理COM对象，防止内存泄漏
4. **错误恢复**: 多重备用方案，提高成功率

## 🎯 最佳实践

1. **推荐使用VBScript方式**：最稳定，兼容性最好
2. **保持Photoshop更新**：新版本COM接口更稳定
3. **避免同时运行多个脚本**：可能导致冲突
4. **定期清理临时文件**：保持系统整洁

## 📝 注意事项

1. **权限要求**: 确保Photoshop已安装且有足够权限
2. **脚本路径**: 使用绝对路径或确保相对路径正确
3. **Photoshop版本**: 支持CC 2015及以上版本
4. **系统兼容性**: Windows 7/8/10/11 (x64)

## 🔄 构建状态

- **最新更新**: 2024-10-11 - 修复Windows构建图标尺寸问题
- **构建状态**: 优化图标配置，支持256x256高分辨率图标
- **版本**: v0.1.0

---

*本工具由设计工坊开发，致力于提供稳定可靠的Photoshop自动化解决方案。*

通过这些多样化的执行方式，Windows用户可以根据自己的需求和环境选择最适合的Photoshop脚本执行方案。