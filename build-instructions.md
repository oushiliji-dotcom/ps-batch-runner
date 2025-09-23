# Windows 安装包构建指南

## 方法一：使用 GitHub Actions（推荐）

1. 将项目推送到 GitHub 仓库
2. GitHub Actions 会自动构建 Windows 安装包
3. 在 Actions 页面下载构建产物

## 方法二：本地 Windows 环境构建

### 前置要求
- Windows 10/11 系统
- Node.js 18+ 
- Inno Setup 6+

### 步骤

1. **解压源码包**
   ```cmd
   # 解压 ps-batch-runner-src.zip 到任意目录
   cd ps-batch-runner-src
   ```

2. **安装依赖**
   ```cmd
   npm install
   ```

3. **构建可执行文件**
   ```cmd
   npm run build:win
   ```
   - 生成文件：`dist/PSBatchRunner.exe`

4. **安装 Inno Setup**
   - 下载：https://jrsoftware.org/isdl.php
   - 安装 Inno Setup 6.2.2 或更高版本

5. **编译安装包**
   - 右键点击 `installer.iss`
   - 选择 "Compile"
   - 或使用命令行：
   ```cmd
   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
   ```

6. **获取安装包**
   - 生成文件：`dist/PSBatchRunner-Setup.exe`

## 方法三：在线构建服务

### AppVeyor（免费）
1. 注册 AppVeyor 账号
2. 连接 GitHub 仓库
3. 使用提供的 `appveyor.yml` 配置

### 其他选择
- GitHub Codespaces + Windows 容器
- Azure DevOps Pipeline
- 云端 Windows 虚拟机

## 故障排除

### pkg 构建失败
- 确保网络连接正常（需下载 Node.js 二进制文件）
- 尝试设置代理：`npm config set proxy http://proxy:port`
- 清理缓存：`npm cache clean --force`

### Inno Setup 编译失败
- 检查路径中是否包含中文字符
- 确保 `dist/PSBatchRunner.exe` 存在
- 检查 `installer.iss` 文件编码为 UTF-8

### 运行时错误
- 确保目标机器安装了 Visual C++ Redistributable
- 检查防火墙设置
- 以管理员权限运行

## 文件说明

- `PSBatchRunner.exe` - 免安装版可执行文件
- `PSBatchRunner-Setup.exe` - 安装向导版
- `jsx/batch-template.jsx` - Photoshop 脚本模板
- `config.json` - 配置文件