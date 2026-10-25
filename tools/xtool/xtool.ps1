# Wrapper to run xtool on Windows via Docker with persistent data & downloads access
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path "$scriptDir\..\..").Path
$currentDir = (Get-Location).Path
$dataDir = "$scriptDir\data"
if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
$downloadsDir = "$env:USERPROFILE\Downloads"

$dockerArgs = $args | ForEach-Object {
    if ($_ -like "*\Downloads\*") {
        $_ -replace [regex]::Escape($downloadsDir), "/downloads" -replace '\\', '/'
    } else {
        $_
    }
}

docker run --rm -i --security-opt seccomp=unconfined `
    -v "${projectRoot}:/workspace" `
    -v "${currentDir}:/work" `
    -v "${dataDir}:/root" `
    -v "${downloadsDir}:/downloads" `
    -w /work `
    swift-xtool:latest /workspace/tools/xtool/bundle/AppRun @dockerArgs
