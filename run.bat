@echo off
cd /d "%~dp0"
echo Checking dependencies...
npm install 2>nul | echo.

echo Checking Ollama service...
tasklist /fi "imagename eq ollama.exe" 2>nul | find /i "ollama.exe" >nul || (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start "" /min "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    )
)

echo Starting development server...
start "" npm run dev
timeout /t 2 >nul
echo Opening browser http://localhost:3000...
start http://localhost:3000