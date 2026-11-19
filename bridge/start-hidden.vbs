' ZCode Browser Bridge — 隐藏窗口常驻启动
' 由 install-autostart 引用；直接双击也能用。
Dim fso, sh, here, nodeExe, script
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(here, "server.mjs")
nodeExe = "C:\Users\J26060131\Node\node-v24.20.0-win-x64\node.exe"

If Not fso.FileExists(nodeExe) Then nodeExe = "node"

sh.CurrentDirectory = here
sh.Run """" & nodeExe & """ """ & script & """ --serve-only", 0, False
