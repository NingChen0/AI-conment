; Inno Setup 安装脚本
; AI 评论助手安装程序

#define MyAppName "AI CommentHelper"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "AI Comment Assistant"
#define MyAppExeName "启动助手.bat"

[Setup]
AppId={{8F3D9E2A-1B4C-4F5E-9A8D-2C6E7B9F3A1E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\AI CommentHelper
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer
OutputBaseFilename=AI CommentHelper-安装程序
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
SetupIconFile=public\icon.ico
UninstallDisplayIcon={app}\public\icon.ico

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "aiConfig.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "aiComment.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "logger.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "pinglun_*.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "启动助手.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
