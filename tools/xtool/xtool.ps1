# Wrapper to run xtool on Windows via Docker
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path "$scriptDir\..\..").Path
$currentDir = (Get-Location).Path

docker run --rm -i --security-opt seccomp=unconfined -v "${projectRoot}:/workspace" -v "${currentDir}:/work" -w /work ubuntu:latest /workspace/tools/xtool/bundle/AppRun $args
