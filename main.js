const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
const configPath = path.join(__dirname, 'config.json');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'renderer.js')
        },
        icon: path.join(__dirname, 'icon.ico')
    });

    mainWindow.loadFile('web/index.html');
    
    // 临时开启开发者工具来调试问题
    mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC 处理程序
ipcMain.handle('load-config', async () => {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('加载配置失败:', error);
        return {};
    }
});

ipcMain.handle('save-config', async (event, config) => {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (error) {
        console.error('保存配置失败:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('select-file', async (event, options = {}) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: options.filters || [
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, path: result.filePaths[0] };
        }
        return { success: false };
    } catch (error) {
        console.error('选择文件失败:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('select-directory', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, path: result.filePaths[0] };
        }
        return { success: false };
    } catch (error) {
        console.error('选择目录失败:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('run-batch', async (event, config) => {
    return new Promise((resolve) => {
        try {
            if (!config.photoshopPath || !config.jsxPath || !config.inputDir) {
                resolve({
                    success: false,
                    error: '缺少必要参数：Photoshop路径、JSX脚本路径或输入目录'
                });
                return;
            }

            if (!fs.existsSync(config.photoshopPath)) {
                resolve({
                    success: false,
                    error: `Photoshop 可执行文件不存在: ${config.photoshopPath}`
                });
                return;
            }

            if (!fs.existsSync(config.jsxPath)) {
                resolve({
                    success: false,
                    error: `JSX 脚本文件不存在: ${config.jsxPath}`
                });
                return;
            }

            if (!fs.existsSync(config.inputDir)) {
                resolve({
                    success: false,
                    error: `输入目录不存在: ${config.inputDir}`
                });
                return;
            }

            const args = [config.jsxPath];
            const ps = spawn(config.photoshopPath, args, {
                cwd: path.dirname(config.jsxPath)
            });

            let stdout = '';
            let stderr = '';

            ps.stdout.on('data', (data) => {
                stdout += data.toString();
                mainWindow.webContents.send('batch-output', {
                    type: 'stdout',
                    data: data.toString()
                });
            });

            ps.stderr.on('data', (data) => {
                stderr += data.toString();
                mainWindow.webContents.send('batch-output', {
                    type: 'stderr',
                    data: data.toString()
                });
            });

            ps.on('close', (code) => {
                resolve({
                    success: code === 0,
                    code: code,
                    stdout: stdout,
                    stderr: stderr
                });
            });

            ps.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    stdout: stdout,
                    stderr: stderr
                });
            });

        } catch (error) {
            resolve({
                success: false,
                error: error.message
            });
        }
    });
});
