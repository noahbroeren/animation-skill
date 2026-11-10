# Install video-forge into %USERPROFILE%\.claude\skills and set up dependencies.
# pip/npm print notices on stderr; Windows PowerShell 5.1 would treat those as fatal under
# "Stop", so success is judged by exit codes instead.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$skills = if ($env:CLAUDE_SKILLS_DIR) { $env:CLAUDE_SKILLS_DIR } else { Join-Path $env:USERPROFILE ".claude\skills" }
$dest = Join-Path $skills "video-forge"
New-Item -ItemType Directory -Force $skills | Out-Null

function Invoke-Step([string]$name, [scriptblock]$cmd) {
  Write-Output "== $name"
  & $cmd 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 4
  if ($LASTEXITCODE -ne 0) { Write-Output "FAILED: $name (exit $LASTEXITCODE)"; exit 1 }
}

robocopy (Join-Path $here "skill\video-forge") $dest /MIR /XD node_modules out /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Output "copy failed ($LASTEXITCODE)"; exit 1 }
Write-Output "== copied skill to $dest"
Invoke-Step "python requirements" { py -m pip install -q --disable-pip-version-check -r (Join-Path $dest "analyzer\requirements.txt") }
Push-Location (Join-Path $dest "engine")
Invoke-Step "engine npm install" { npm install --no-audit --no-fund }
Pop-Location
Invoke-Step "doctor" { node (Join-Path $dest "scripts\doctor.mjs") }
Write-Output "Installed to $dest"
exit 0
