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
; 仅需安装编译后的 exe（资源已由 pkg 打包进入 exe）
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; 同时安装可外部引用的 JSX 模板，便于在界面中直接选择
Source: "jsx\*"; DestDir: "{app}\jsx"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "额外任务"; Flags: unchecked

[Run]
; 安装完成后可选立即启动服务并打开浏览器
Filename: "{app}\{#MyAppExeName}"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent
Filename: "{cmd}"; Parameters: "/C start http://localhost:3017/"; Flags: runhidden postinstall skipifsilent
