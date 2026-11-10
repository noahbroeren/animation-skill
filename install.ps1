# Install video-forge into %USERPROFILE%\.claude\skills and set up dependencies.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$skills = if ($env:CLAUDE_SKILLS_DIR) { $env:CLAUDE_SKILLS_DIR } else { Join-Path $env:USERPROFILE ".claude\skills" }
$dest = Join-Path $skills "video-forge"
New-Item -ItemType Directory -Force $skills | Out-Null
robocopy (Join-Path $here "skill\video-forge") $dest /MIR /XD node_modules out /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "copy failed ($LASTEXITCODE)" }
py -m pip install -r (Join-Path $dest "analyzer\requirements.txt")
Push-Location (Join-Path $dest "engine"); npm install --no-audit --no-fund; Pop-Location
node (Join-Path $dest "scripts\doctor.mjs")
Write-Output "Installed to $dest"
