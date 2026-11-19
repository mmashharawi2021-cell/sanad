@echo off
setlocal
cd /d "%~dp0"

:: 1. Start Ollama silently if not running
tasklist /fi "imagename eq ollama.exe" 2>nul | findstr /i "ollama.exe" >nul
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start "" /b "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    )
)

:: 2. Check if dev server is running on port 3000
powershell -NoProfile -Command "try { $r = [System.Net.WebRequest]::Create('http://localhost:3000'); $r.Timeout = 1200; $resp = $r.GetResponse(); $resp.Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
    start "" /b cmd /c "npm.cmd run dev"
    :: Wait up to 6 seconds for server to start
    for /l %%i in (1, 1, 15) do (
        powershell -NoProfile -Command "try { $r = [System.Net.WebRequest]::Create('http://localhost:3000'); $r.Timeout = 800; $resp = $r.GetResponse(); $resp.Close(); exit 0 } catch { exit 1 }"
        if not errorlevel 1 goto :server_ready
        timeout /t 1 /nobreak >nul
    )
)

:server_ready
:: 3. Launch in standalone Native Desktop App window
set "BROWSER="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "BROWSER=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "BROWSER=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if defined BROWSER (
    start "" "%BROWSER%" --app=http://localhost:3000 --window-size=1280,860
) else (
    start http://localhost:3000
)

exit /b 0
