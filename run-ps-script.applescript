-- AppleScript for running Photoshop JSX scripts
-- 这个脚本模拟拖拽JSX文件到Photoshop的操作

on run argv
    -- 获取JSX脚本路径（这里接收的是wrapper脚本路径）
    if (count of argv) > 0 then
        set jsxScriptPath to item 1 of argv
    else
        set jsxScriptPath to "/Users/jili/Documents/PS脚本工具/jsx/batch-template.jsx"
    end if
    
    -- 检查JSX文件是否存在
    try
        set jsxFile to POSIX file jsxScriptPath as alias
    on error
        display dialog "JSX脚本文件不存在: " & jsxScriptPath buttons {"确定"} default button 1
        return
    end try
    
    -- 启动Photoshop
    try
        tell application "Adobe Photoshop 2022"
            activate
            -- 等待Photoshop完全启动
            delay 3
            
            -- 执行JSX脚本
            do javascript file jsxFile
            
        end tell
        
        -- 显示成功消息
        display notification "Photoshop脚本执行完成" with title "批处理工具"
        
    on error errMsg
        -- 如果Photoshop 2022不存在，尝试其他版本
        try
            tell application "Adobe Photoshop 2023"
                activate
                delay 3
                do javascript file jsxFile
            end tell
            display notification "Photoshop脚本执行完成" with title "批处理工具"
        on error
            try
                tell application "Adobe Photoshop 2024"
                    activate
                    delay 3
                    do javascript file jsxFile
                end tell
                display notification "Photoshop脚本执行完成" with title "批处理工具"
            on error errMsg2
                display dialog "无法启动Photoshop或执行脚本: " & errMsg2 buttons {"确定"} default button 1
            end try
        end try
    end try
end run