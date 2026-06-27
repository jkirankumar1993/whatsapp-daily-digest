Option Explicit

Dim shell, fso, projectDir, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = projectDir
command = """C:\Program Files\nodejs\node.exe"" --import tsx src\server.ts"

' Launch Node directly without a console window.
shell.Run command, 0, False
