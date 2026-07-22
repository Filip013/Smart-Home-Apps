@echo off
title Antigravity CLI Launcher
cd /d "%~dp0"
echo Opening VS Code in: %CD%
start "" code .
echo Launching Antigravity CLI (agy -c)...
powershell -NoExit -Command "agy -c"
