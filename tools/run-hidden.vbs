' Starts the Comic Reader server with no visible window (background).
' Used by the Startup shortcut so the reader is always running after login.
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projectDir
' NO_OPEN=1 so it doesn't pop a browser on login; log to %LOCALAPPDATA%.
sh.Run "cmd /c set ""NO_OPEN=1"" && node server.js > ""%LOCALAPPDATA%\comic-reader.log"" 2>&1", 0, False
