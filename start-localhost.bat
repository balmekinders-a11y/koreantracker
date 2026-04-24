@echo off
setlocal

cd /d "%~dp0"

echo Starting Korean Tracker at http://localhost:5500
start "" "http://localhost:5500"

where py >nul 2>&1
if %errorlevel%==0 (
  py -m http.server 5500
  goto :eof
)

where python >nul 2>&1
if %errorlevel%==0 (
  python -m http.server 5500
  goto :eof
)

echo.
echo Python launcher (py) or python was not found in PATH.
echo Install Python and try again.
pause
