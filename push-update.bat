@echo off
setlocal

REM Run from this script's directory (repo root).
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not available in PATH.
  echo Install Git and restart your terminal.
  exit /b 1
)

REM Optional custom commit message:
REM   push-update.bat "your commit message"
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update Korean Tracker"

echo [INFO] Staging all changes...
git add -A
if errorlevel 1 (
  echo [ERROR] Failed to stage changes.
  exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
  echo [INFO] No staged changes to commit. Nothing to push.
  exit /b 0
)

echo [INFO] Committing changes...
git commit -m "%MSG%"
if errorlevel 1 (
  echo [ERROR] Commit failed.
  exit /b 1
)

echo [INFO] Pushing to remote...
git push
if errorlevel 1 (
  echo [ERROR] Push failed.
  exit /b 1
)

echo [OK] Changes pushed. GitHub Actions will deploy automatically.
exit /b 0
