$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$projectDir = "C:\Users\mozar\Desktop\opencode"
$vbsPath = Join-Path $projectDir "JARVIS.vbs"
$icoPath = Join-Path $projectDir "public\jarvis.ico"

$wshShell = New-Object -ComObject WScript.Shell

$shortcutSanad = $wshShell.CreateShortcut((Join-Path $desktopPath "SANAD.lnk"))
$shortcutSanad.TargetPath = "wscript.exe"
$shortcutSanad.Arguments = "`"$vbsPath`""
$shortcutSanad.WorkingDirectory = $projectDir
$shortcutSanad.IconLocation = "$icoPath,0"
$shortcutSanad.Description = "SANAD - سند المساعد الذكي المستقل"
$shortcutSanad.Save()

$shortcutJarvis = $wshShell.CreateShortcut((Join-Path $desktopPath "JARVIS.lnk"))
$shortcutJarvis.TargetPath = "wscript.exe"
$shortcutJarvis.Arguments = "`"$vbsPath`""
$shortcutJarvis.WorkingDirectory = $projectDir
$shortcutJarvis.IconLocation = "$icoPath,0"
$shortcutJarvis.Description = "SANAD - سند المساعد الذكي المستقل"
$shortcutJarvis.Save()

Write-Output "SANAD.lnk created on Desktop successfully."
