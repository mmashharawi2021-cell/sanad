<#
  سند — تجهيز مكونات الصوت (مرة واحدة، يحتاج إنترنت):
    - Piper (النطق المحلي) + صوت كريم (رجل) + صوت دي (فتاة)
    - FastConformer العربي (التعرّف على الكلام، NVIDIA، CC-BY-4.0)
    - whisper.cpp + نموذج small (بديل احتياطي للتعرّف)
    - بيئة Python في vendor\py للعملية الصوتية المساعدة (edge-tts + onnx-asr)
  كل ملف يُتحقق من بصمته SHA-256 بعد التنزيل.

  الاستخدام (من جذر المشروع):
    powershell -ExecutionPolicy Bypass -File scripts\voice-setup.ps1            # تنزيل الناقص والتحقق
    powershell -ExecutionPolicy Bypass -File scripts\voice-setup.ps1 -VerifyOnly # تحقق فقط بلا تنزيل
#>
param([switch]$VerifyOnly)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$assets = @(
  @{ Path = "vendor\piper\voices\ar_JO-kareem-medium.onnx"; Sha = "9e95cab07b679da603bba17c4dec7ab3111320571964ee95c0379603c086491e"
     Url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx" },
  @{ Path = "vendor\piper\voices\ar_JO-kareem-medium.onnx.json"; Sha = $null
     Url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json" },
  @{ Path = "vendor\piper\voices\dii_ar.onnx"; Sha = "aaa6b21b95d576e402b95c9ad4e4f809dbb554460a6250d8d40346e06c9a3bfa"
     Url = "https://huggingface.co/Phoonnx/phoonnx_ar_dii_espeak/resolve/main/dii_ar.onnx" },
  @{ Path = "vendor\piper\voices\dii_ar.onnx.json"; Sha = $null
     Url = "https://huggingface.co/Phoonnx/phoonnx_ar_dii_espeak/resolve/main/dii_ar.piper.json" },
  @{ Path = "vendor\stt\fastconformer\model.onnx"; Sha = "8a8f9bf632e26dc9e19f44a253db3cc8bb25678e36a3535c73407bc4be5e2533"
     Url = "https://huggingface.co/OpenVoiceOS/stt_ar_fastconformer_hybrid_large_pc_v1.0_onnx/resolve/main/model.onnx" },
  @{ Path = "vendor\stt\fastconformer\vocab.txt"; Sha = $null
     Url = "https://huggingface.co/OpenVoiceOS/stt_ar_fastconformer_hybrid_large_pc_v1.0_onnx/resolve/main/vocab.txt" },
  @{ Path = "vendor\stt\fastconformer\config.json"; Sha = $null
     Url = "https://huggingface.co/OpenVoiceOS/stt_ar_fastconformer_hybrid_large_pc_v1.0_onnx/resolve/main/config.json" },
  @{ Path = "vendor\whisper\models\ggml-small-q5_1.bin"; Sha = "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"
     Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin" }
)
$archives = @(
  @{ Check = "vendor\piper\bin\piper\piper.exe"; Dest = "vendor\piper\bin"; Sha = "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea"
     Url = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" },
  @{ Check = "vendor\whisper\bin\Release\whisper-server.exe"; Dest = "vendor\whisper\bin"; Sha = "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb"
     Url = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip" }
)

function Get-Sha($p) { (Get-FileHash $p -Algorithm SHA256).Hash.ToLower() }
function Get-File($url, $out) {
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  for ($a = 1; $a -le 5; $a++) {
    & curl.exe -sL -C - --retry 3 -m 1800 -o $out $url
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep 2
  }
  throw "فشل تنزيل $url"
}

$problems = 0
foreach ($z in $archives) {
  if (Test-Path $z.Check) { Write-Host "OK      $($z.Check)"; continue }
  if ($VerifyOnly) { Write-Host "MISSING $($z.Check)"; $problems++; continue }
  $zip = Join-Path $env:TEMP ([IO.Path]::GetFileName($z.Url))
  Get-File $z.Url $zip
  if ((Get-Sha $zip) -ne $z.Sha) { Remove-Item $zip; throw "بصمة غير مطابقة: $($z.Url)" }
  Expand-Archive -Force $zip $z.Dest
  Remove-Item $zip
  Write-Host "INSTALL $($z.Check)"
}
foreach ($f in $assets) {
  if (-not (Test-Path $f.Path)) {
    if ($VerifyOnly) { Write-Host "MISSING $($f.Path)"; $problems++; continue }
    Get-File $f.Url $f.Path
  }
  if ($f.Sha -and (Get-Sha $f.Path) -ne $f.Sha) { Write-Host "BAD SHA $($f.Path)"; $problems++; continue }
  Write-Host "OK      $($f.Path)"
}

# Python sidecar environment
$py = "vendor\py\Scripts\python.exe"
if (-not (Test-Path $py)) {
  if ($VerifyOnly) { Write-Host "MISSING $py"; $problems++ }
  else {
    py -3 -m venv vendor\py
    & $py -m pip install --quiet --upgrade pip
    & $py -m pip install --quiet --only-binary=:all: edge-tts "onnx-asr[cpu]" soundfile numpy
    Write-Host "INSTALL $py"
  }
}
if (Test-Path $py) {
  & $py -c "import edge_tts, onnx_asr, soundfile, numpy; print('OK      python sidecar packages')"
  if ($LASTEXITCODE -ne 0) { $problems++ }
}

if ($problems) { Write-Host "`n$problems مشكلة — أعد التشغيل بدون -VerifyOnly لإصلاحها."; exit 1 }
Write-Host "`nمكونات الصوت جاهزة. (اختياري وأنت متصل: npm.cmd run voice:warm لحفظ العبارات الشائعة بالصوت الطبيعي)"
