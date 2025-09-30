@echo off
REM Photoshop脚本执行器 - 批处理版本
REM 支持拖拽JSX文件到此BAT文件上执行
REM 使用VBScript COM接口与Photoshop通信

setlocal enabledelayedexpansion

REM 获取当前批处理文件所在目录
set "SCRIPT_DIR=%~dp0"
set "VBS_SCRIPT=%SCRIPT_DIR%run-ps-script.vbs"

REM 检查VBScript文件是否存在
if not exist "%VBS_SCRIPT%" (
    echo 错误: 找不到VBScript文件: %VBS_SCRIPT%
    pause
    exit /b 1
)

REM 检查是否有参数传入（拖拽的文件）
if "%~1"=="" (
    echo 使用方法: 
    echo 1. 将JSX脚本文件拖拽到此BAT文件上
    echo 2. 或者在命令行中运行: run-ps-script.bat "脚本路径.jsx"
    pause
    exit /b 1
)

REM 处理所有拖拽的文件
:process_files
if "%~1"=="" goto end

set "JSX_FILE=%~1"

echo.
echo ========================================
echo 正在处理文件: %JSX_FILE%
echo ========================================

REM 检查文件扩展名
if /i not "%~x1"==".jsx" (
    echo 警告: 文件 "%JSX_FILE%" 不是JSX脚本文件
    echo 跳过处理...
    goto next_file
)

REM 调用VBScript执行Photoshop脚本
cscript //NoLogo "%VBS_SCRIPT%" "%JSX_FILE%"

if errorlevel 1 (
    echo 错误: 脚本执行失败
) else (
    echo 脚本执行成功!
)

:next_file
shift
goto process_files

:end
echo.
echo 所有文件处理完成
pause