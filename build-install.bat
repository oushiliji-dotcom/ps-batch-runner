@echo off
REM PS批量脚本工具 - Windows安装脚本
REM 前置条件：已安装 Node.js（下载地址：https://nodejs.org/）

cd /d "%~dp0"
echo 正在安装依赖...
call npm install
if %errorlevel% neq 0 (
    echo 依赖安装失败，请检查网络连接或Node.js安装。
    pause
    exit /b 1
)

echo.
echo 正在编译 Windows 可执行文件...
call npm run build:win
if %errorlevel% neq 0 (
    echo 编译失败，请检查错误信息。
    pause
    exit /b 1
)

echo.
echo 编译完成！可执行文件位于：dist\PSBatchRunner.exe
echo 使用方法：
echo 1. 双击 PSBatchRunner.exe 启动本地服务器
echo 2. 打开浏览器访问 http://localhost:3017
echo 3. 配置 Photoshop 路径、JSX 脚本路径、输入输出目录
echo 4. 点击"开始运行"进行批处理
echo.
echo 注意事项：
echo - 需要 Adobe Photoshop 已安装且可正常启动
echo - JSX 脚本请参考 jsx\batch-template.jsx 模板编写
echo - 配置会自动保存到用户文件夹 AppData\Roaming\ps-batch-runner\
echo.
pause