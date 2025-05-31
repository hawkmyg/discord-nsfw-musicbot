@echo off
echo ======================================
echo   Starting the Discord Bot Server
echo ======================================
node bot.js
if errorlevel 1 (
    echo [ERROR] Failed to start Discord Bot Server
) else (
    echo [OK] Discord Bot Server started
)

pause