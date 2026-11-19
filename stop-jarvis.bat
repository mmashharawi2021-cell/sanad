@echo off
chcp 65001 >nul
echo 🛑 جاري إيقاف خدمات جارفيس ومحركات الذكاء الاصطناعي...
taskkill /f /im node.exe 2>nul
taskkill /f /im ollama.exe 2>nul
echo.
echo ✅ تم إيقاف جميع خدمات جارفيس بنجاح.
timeout /t 3 >nul
