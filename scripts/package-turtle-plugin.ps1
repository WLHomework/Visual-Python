[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$sourceRoot = Join-Path $repoRoot "examples\plugins\turtle"
$artifactsRoot = Join-Path $repoRoot "artifacts"
$requiredFiles = @("plugin.json", "index.js", "README.md")
$manifestPath = Join-Path $sourceRoot "plugin.json"

foreach ($name in $requiredFiles) {
  $path = Join-Path $sourceRoot $name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing Turtle plugin source file: $path"
  }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.id -ne "visual-python.turtle") {
  throw "Unexpected plugin id: $($manifest.id)"
}
if ($manifest.version -ne "1.0.2") {
  throw "Unexpected plugin version: $($manifest.version)"
}
if ([string]$manifest.apiVersion -ne "1") {
  throw "Unexpected plugin API version: $($manifest.apiVersion)"
}
if ($manifest.entry -ne "index.js") {
  throw "Unexpected plugin entry: $($manifest.entry)"
}

New-Item -ItemType Directory -Path $artifactsRoot -Force | Out-Null
$zipPath = Join-Path $artifactsRoot "visual-python-turtle-plugin-$($manifest.version).zip"
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("visual-python-turtle-" + [guid]::NewGuid().ToString("N"))

try {
  New-Item -ItemType Directory -Path $stagingRoot | Out-Null
  foreach ($name in $requiredFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $stagingRoot $name)
  }

  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Compress-Archive -LiteralPath ($requiredFiles | ForEach-Object { Join-Path $stagingRoot $_ }) -DestinationPath $zipPath -CompressionLevel Optimal

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $actualEntries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") } | Sort-Object)
    $expectedEntries = @($requiredFiles | Sort-Object)
    if (($actualEntries -join "|") -ne ($expectedEntries -join "|")) {
      throw "Unexpected ZIP entries: $($actualEntries -join ', ')"
    }
  }
  finally {
    $archive.Dispose()
  }

  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
  Write-Output "Package: $zipPath"
  Write-Output "SHA256: $hash"
}
finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
