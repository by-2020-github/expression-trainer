$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$LogFile = Join-Path $Root 'startup.log'

function Log($m) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $m"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Has-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = ($machine + ';' + $user)
  if ($env:Path -notmatch 'nodejs') {
    $env:Path = 'C:\Program Files\nodejs;' + $env:Path
  }
}

function Popup($text, $title, $icon) {
  try {
    $ws = New-Object -ComObject WScript.Shell
    $ws.Popup($text, 6, $title, $icon) | Out-Null
  } catch { }
}

trap {
  Log "FAILED: $($_.Exception.Message)"
  Popup "Setup failed: $($_.Exception.Message)", 'Startup Error', 16
  exit 1
}

Log '==== setup begin ===='

# ---------- 1. Node.js / npm ----------
if (-not (Has-Command 'node') -or -not (Has-Command 'npm')) {
  Log 'Node.js / npm not found, installing...'
  if (Has-Command 'winget') {
    Log 'Using winget to install Node.js LTS...'
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
  } else {
    Log 'winget not found, downloading Node.js MSI...'
    $msi = Join-Path $env:TEMP 'node-v20.18.1-x64.msi'
    Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi' -OutFile $msi -UseBasicParsing
    Start-Process msiexec -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
  }
  Refresh-Path
} else {
  Log 'Node.js / npm OK.'
}

if (-not (Has-Command 'node')) {
  throw 'Node.js installation failed. Please install Node.js manually: https://nodejs.org'
}

# ---------- 2. wget ----------
if (-not (Has-Command 'wget')) {
  Log 'wget not found, trying to install...'
  try {
    if (Has-Command 'winget') {
      winget install --id GnuWin32.Wget -e --accept-package-agreements --accept-source-agreements --silent
      Refresh-Path
    }
  } catch {
    Log 'wget install failed.'
  }
  if (-not (Has-Command 'wget')) {
    Log 'wget unavailable; will fall back to built-in downloader (Invoke-WebRequest).'
  }
} else {
  Log 'wget OK.'
}

# ---------- 3. npm install ----------
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Log 'node_modules missing, running npm install (this may take a while)...'
  Push-Location $Root
  & 'npm.cmd' install
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw 'npm install failed.'
  }
  Pop-Location
} else {
  Log 'node_modules present, skip npm install.'
}

# ---------- 4. Model ----------
$modelSub = 'sherpa-onnx-streaming-paraformer-bilingual-zh-en'
$modelDir = Join-Path $Root (Join-Path 'models' $modelSub)
$encFile = Join-Path $modelDir 'encoder.int8.onnx'

function Test-Model {
  return (Test-Path $encFile) -and ((Get-Item $encFile).Length -ge 165462184)
}

if (-not (Test-Model)) {
  Log 'Model not found, downloading...'
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'models') | Out-Null
  $tarPath = Join-Path $Root (Join-Path 'models' "$modelSub.tar.bz2")
  # 先项目 Release，再上游 k2-fsa 兜底
  $modelUrls = @(
    'https://github.com/by-2020-github/expression-trainer/releases/download/asr-model-v1/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2',
    'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2'
  )

  $downloaded = $false
  foreach ($mUrl in $modelUrls) {
    Log "Downloading model from $mUrl ..."
    try {
      if (Has-Command 'wget') {
        & wget -q --timeout=60 --tries=3 -O $tarPath $mUrl
        if ($LASTEXITCODE -ne 0) { throw "wget failed (exit $LASTEXITCODE)." }
      } else {
        Invoke-WebRequest -Uri $mUrl -OutFile $tarPath -UseBasicParsing
      }
      $downloaded = $true
      break
    } catch {
      Log "  download failed: $($_.Exception.Message)"
    }
  }
  if (-not $downloaded) {
    throw 'Model download failed (all sources).'
  }

  Log 'Downloaded. Extracting...'
  if (Has-Command 'tar') {
    & tar -x -j -f $tarPath -C (Join-Path $Root 'models')
    if ($LASTEXITCODE -ne 0) { throw "tar extraction failed (exit $LASTEXITCODE)." }
  } else {
    Log 'tar not found; downloading the 3 int8 files directly...'
    New-Item -ItemType Directory -Force -Path $modelDir | Out-Null
    $base = 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/main'
    foreach ($f in @('encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt')) {
      Invoke-WebRequest -Uri "$base/$f" -OutFile (Join-Path $modelDir $f) -UseBasicParsing
    }
  }

  if (-not (Test-Model)) {
    throw 'Model download / verify failed.'
  }
} else {
  Log 'Model OK.'
}

# ---------- 5. Launch ----------
$electron = Join-Path $Root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) {
  throw 'electron not found. Please run "npm install" first.'
}

Log 'Launching application...'
Start-Process -FilePath $electron -ArgumentList '.' -WorkingDirectory $Root
Log 'Application launched.'
Popup 'Application has started.', 'Start', 64

Log '==== setup done ===='
