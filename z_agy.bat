@echo off
cd /d "%~dp0"
start "" code .
start "" powershell -NoExit -Command "agy -c"
exit
