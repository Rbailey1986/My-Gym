@echo off
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
for %%i in ("%SCRIPT_DIR%..\..") do set "PROJECT_ROOT=%%~fi"
set "DATA_DIR=%SCRIPT_DIR%data"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
set "DOWNLOADS_DIR=%USERPROFILE%\Downloads"

set "CMD_ARGS="
:arg_loop
if "%~1"=="" goto run_docker
set "ARG=%~1"
set "ARG=!ARG:%DOWNLOADS_DIR%=/downloads!"
set "ARG=!ARG:\=/!"
set "CMD_ARGS=!CMD_ARGS! !ARG!"
shift
goto arg_loop

:run_docker
docker run --rm -i --security-opt seccomp=unconfined -v "%PROJECT_ROOT%:/workspace" -v "%cd%:/work" -v "%DATA_DIR%:/root" -v "%DOWNLOADS_DIR%:/downloads" -w /work swift-xtool:latest /workspace/tools/xtool/bundle/AppRun %CMD_ARGS%
endlocal
