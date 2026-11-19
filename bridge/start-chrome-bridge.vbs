' ZCode Browser Bridge - Chrome instance (port 8918), hidden window
' Isolated from the Edge instance (8917) so two extensions never share one command queue.
Dim fso, sh, here, nodeExe, script
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(here, "server.mjs")
nodeExe = "C:\Users\J26060131\Node\node-v24.20.0-win-x64\node.exe"

If Not fso.FileExists(nodeExe) Then nodeExe = "node"

sh.Environment("Process")("ZCB_PORT") = "8918"
' Auto-run enabled: the headless session now has a dedicated browser-ext-chrome
' MCP server (port 8918) and the prompt tells it to use that one.
sh.Environment("Process")("ZCB_AUTORUN") = "true"

sh.CurrentDirectory = here
sh.Run """" & nodeExe & """ """ & script & """ --serve-only", 0, False
