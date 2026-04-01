@echo off
echo ==========================================
echo  Agile Velocity Tool - Standalone Builder
echo ==========================================
echo.

:: Install dependencies including singlefile plugin
echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed
  pause
  exit /b 1
)

echo.
echo [2/3] Building standalone HTML...
call npm run build:standalone
if errorlevel 1 (
  echo ERROR: Build failed
  pause
  exit /b 1
)

echo.
echo [3/3] Done!
echo.
echo Output: dist-standalone\index.html
echo Just double-click that file to open the app in your browser.
echo No server or installation needed.
echo.
pause

