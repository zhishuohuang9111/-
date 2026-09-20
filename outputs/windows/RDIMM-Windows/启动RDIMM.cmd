@echo off
setlocal
title RDIMM Sample Manager
pushd "%~dp0"
if not exist "runtime\node.exe" (
  echo Please extract the entire ZIP file first.
  pause
  exit /b 1
)
"runtime\node.exe" --no-warnings server.cjs --open
if errorlevel 1 (
  echo Startup failed. See the message above.
  pause
)
popd
