# Photoshop脚本执行器 - PowerShell COM自动化版本
# 使用COM接口直接与Photoshop通信，提供更稳定的脚本执行方式
#
# 使用方法: 
# powershell -ExecutionPolicy Bypass -File run-ps-script-powershell.ps1 "脚本路径.jsx"

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$ScriptPath
)

# 检查脚本文件是否存在
if (-not (Test-Path $ScriptPath)) {
    Write-Host "错误: 脚本文件不存在: $ScriptPath" -ForegroundColor Red
    exit 1
}

# 转换为绝对路径
$ScriptPath = Resolve-Path $ScriptPath

Write-Host "正在启动Photoshop并执行脚本: $ScriptPath" -ForegroundColor Green

try {
    # 尝试连接到现有的Photoshop实例
    $psApp = $null
    
    try {
        # 尝试获取现有的Photoshop实例
        $psApp = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Photoshop.Application")
        Write-Host "连接到现有的Photoshop实例" -ForegroundColor Yellow
    }
    catch {
        # 没有运行的Photoshop实例，尝试启动新的
        Write-Host "未找到运行中的Photoshop实例，正在启动新实例..." -ForegroundColor Yellow
        
        # 尝试不同版本的Photoshop COM对象
        $psVersions = @(
            "Photoshop.Application.130",  # Photoshop 2022
            "Photoshop.Application.120",  # Photoshop 2021
            "Photoshop.Application.110",  # Photoshop 2020
            "Photoshop.Application"       # 通用版本
        )
        
        $psApp = $null
        foreach ($version in $psVersions) {
            try {
                $psApp = New-Object -ComObject $version
                Write-Host "成功启动Photoshop版本: $version" -ForegroundColor Green
                break
            }
            catch {
                Write-Host "尝试版本 $version 失败: $($_.Exception.Message)" -ForegroundColor Yellow
                continue
            }
        }
        
        if ($psApp -eq $null) {
            throw "无法启动Photoshop。请确保Photoshop已正确安装。"
        }
    }
    
    # 设置Photoshop不显示对话框
    $psApp.DisplayDialogs = 3  # psDisplayNoDialogs
    
    # 读取JSX脚本内容
    $scriptContent = Get-Content -Path $ScriptPath -Raw -Encoding UTF8
    
    # 执行JSX脚本
    Write-Host "正在执行JSX脚本..." -ForegroundColor Yellow
    $psApp.DoJavaScript($scriptContent)
    
    Write-Host "脚本执行成功!" -ForegroundColor Green
    
}
catch {
    Write-Host "错误: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    # 清理COM对象
    if ($psApp -ne $null) {
        try {
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($psApp) | Out-Null
        }
        catch {
            # 忽略清理错误
        }
    }
    
    # 强制垃圾回收
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

Write-Host "脚本执行完成" -ForegroundColor Green