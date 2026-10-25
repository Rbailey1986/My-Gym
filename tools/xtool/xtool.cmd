@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%i in ("%SCRIPT_DIR%..\..") do set "PROJECT_ROOT=%%~fi"

docker run --rm -i --security-opt seccomp=unconfined -v "%PROJECT_ROOT%:/workspace" -v "%cd%:/work" -w /work ubuntu:latest /workspace/tools/xtool/bundle/AppRun %*
endlocal
