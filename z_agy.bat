@echo off
title Antigravity CLI Launcher
cd /d "%~dp0"
echo Launching Antigravity CLI (agy -c) in: %CD%
powershell -NoExit -Command "agy -c"
