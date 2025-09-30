' Photoshop脚本执行器 - VBScript COM自动化版本
' 使用COM接口直接与Photoshop通信，提供更稳定的脚本执行方式
' 
' 使用方法: 
' cscript run-ps-script.vbs "脚本路径.jsx"
' 或者直接拖拽JSX文件到此VBS文件上

Option Explicit

Dim objArgs, scriptPath, psApp, psDoc
Dim fso, objShell

' 创建文件系统对象和Shell对象
Set fso = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

' 获取命令行参数
Set objArgs = WScript.Arguments

' 检查参数
If objArgs.Count = 0 Then
    WScript.Echo "错误: 请提供JSX脚本文件路径"
    WScript.Echo "使用方法: cscript run-ps-script.vbs ""脚本路径.jsx"""
    WScript.Quit 1
End If

scriptPath = objArgs(0)

' 检查脚本文件是否存在
If Not fso.FileExists(scriptPath) Then
    WScript.Echo "错误: 脚本文件不存在: " & scriptPath
    WScript.Quit 1
End If

' 转换为绝对路径
scriptPath = fso.GetAbsolutePathName(scriptPath)

WScript.Echo "正在启动Photoshop并执行脚本: " & scriptPath

On Error Resume Next

' 尝试连接到现有的Photoshop实例，如果失败则启动新实例
Set psApp = GetObject(, "Photoshop.Application")

If Err.Number <> 0 Then
    ' 没有运行的Photoshop实例，尝试启动新的
    Err.Clear
    
    ' 尝试不同版本的Photoshop COM对象
    Dim psVersions, i
    psVersions = Array("Photoshop.Application.130", "Photoshop.Application.120", "Photoshop.Application.110", "Photoshop.Application")
    
    For i = 0 To UBound(psVersions)
        Set psApp = CreateObject(psVersions(i))
        If Err.Number = 0 Then
            WScript.Echo "成功启动Photoshop版本: " & psVersions(i)
            Exit For
        End If
        Err.Clear
    Next
    
    If psApp Is Nothing Then
        WScript.Echo "错误: 无法启动Photoshop。请确保Photoshop已正确安装。"
        WScript.Quit 1
    End If
End If

' 设置Photoshop不显示对话框
psApp.DisplayDialogs = 3  ' psDisplayNoDialogs

' 执行JSX脚本
Err.Clear
psApp.DoJavaScript fso.OpenTextFile(scriptPath, 1).ReadAll()

If Err.Number <> 0 Then
    WScript.Echo "错误: 执行脚本时发生错误: " & Err.Description
    WScript.Quit 1
Else
    WScript.Echo "脚本执行成功!"
End If

' 清理COM对象
Set psApp = Nothing
Set fso = Nothing
Set objShell = Nothing

WScript.Echo "脚本执行完成"