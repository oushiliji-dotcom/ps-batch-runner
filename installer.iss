; Inno Setup Script for PS Batch Runner (Windows Installer)
; 需要在 Windows 上安装 Inno Setup 6+，右键本文件 -> Compile 即可生成安装包

#define MyAppName "PS Batch Runner"
#define MyAppVersion "0.1.0"
#define MyAppPublisher ""
#define MyAppExeName "PSBatchRunner.exe"

[Setup]
AppId={{A2A4E3B5-12B1-4F9A-9F6E-2D6E7A2F10A1}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={pf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=dist
OutputBaseFilename=PSBatchRunner-Setup
ArchitecturesInstallIn64BitMode=x64
Compression=lzma2
SolidCompression=yes
DisableDirPage=no
DisableProgramGroupPage=yes
WizardStyle=modern

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages/ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; 复制打包产物（可执行文件）
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; 附带 JSX 模板，安装到程序目录便于选择
Source: "jsx\*"; DestDir: "{app}\jsx"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "额外任务"; Flags: unchecked

[Run]
; 安装完成后直接启动应用（Electron 桌面版）
Filename: "{app}\{#MyAppExeName}"; Description: "启动应用"; Flags: nowait postinstall skipifsilent
