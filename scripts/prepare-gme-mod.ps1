# Prepares the map editor mod payload the Windows installer bundles
# (src-tauri/tauri.windows.conf.json → resources "gme-mod/**/*"):
#   src-tauri/gme-mod/plugins/GmeRmgMod.dll   — the mod (built from gme-mod/)
#   src-tauri/gme-mod/bepinex/...             — BepInEx 6 IL2CPP, installed into the game if missing
# Run before `npm run tauri:build` on Windows; the release workflow runs it too.
# The output folder is git-ignored (BepInEx is downloaded, never committed).

$ErrorActionPreference = 'Stop'

# Pinned BepInEx build — keep in sync with the PackageReference in gme-mod/GmeRmgMod.csproj.
$BepInExBuild = '785'
$BepInExFile = 'BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.785+6abdba4.zip'
$BepInExSha256 = '2A7CBF74D26ABE4765C3E662DB1721B923BAC39849EBFEF2CA5DC7DE7E2D9B7F'
$BepInExUrl = "https://builds.bepinex.dev/projects/bepinex_be/$BepInExBuild/$([uri]::EscapeDataString($BepInExFile))"
$BepInExLicenseUrl = 'https://raw.githubusercontent.com/BepInEx/BepInEx/master/LICENSE'

$repo = Split-Path -Parent $PSScriptRoot
$out = Join-Path $repo 'src-tauri\gme-mod'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force (Join-Path $out 'plugins') | Out-Null

# 1. The mod
Write-Host 'Building the map editor mod...'
dotnet build (Join-Path $repo 'gme-mod\GmeRmgMod.csproj') -c Release -nologo -v q
if ($LASTEXITCODE -ne 0) { throw "dotnet build failed ($LASTEXITCODE)" }
Copy-Item (Join-Path $repo 'gme-mod\bin\Release\net6.0\GmeRmgMod.dll') (Join-Path $out 'plugins')

# 2. BepInEx (cached in %TEMP% between local runs)
$zip = Join-Path ([IO.Path]::GetTempPath()) $BepInExFile
if (-not (Test-Path $zip) -or (Get-FileHash $zip -Algorithm SHA256).Hash -ne $BepInExSha256) {
    Write-Host "Downloading $BepInExFile..."
    Invoke-WebRequest -UseBasicParsing -Uri $BepInExUrl -OutFile $zip
}
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash
if ($hash -ne $BepInExSha256) { throw "BepInEx download checksum mismatch: $hash" }
Expand-Archive -Path $zip -DestinationPath (Join-Path $out 'bepinex') -Force
Invoke-WebRequest -UseBasicParsing -Uri $BepInExLicenseUrl -OutFile (Join-Path $out 'bepinex\BepInEx\LICENSE-BepInEx.txt')

Write-Host "Map editor mod payload ready in $out"
