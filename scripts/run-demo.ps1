<#
Plays the FinRakshak demo scenarios in a visible browser against the hosted app
(https://finrakshak-ai.web.app by default), so you can screen-record them. Windows version of
scripts/run-demo.sh.

Usage: .\scripts\run-demo.ps1          open the launcher page (one Start button per scenario)
       .\scripts\run-demo.ps1 1|2    play one scenario
       .\scripts\run-demo.ps1 all      play scenarios 1 and 2 one after another

First run: installs the dependencies and Playwright's Chromium, and asks for the demo account's
password. It is saved only in e2e\demo\.env (git-ignored); press Enter to use quick sign-in instead.
If PowerShell refuses to run scripts: powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1
All settings: e2e\demo\README.md.
#>
param(
  [ValidateSet('launcher', '1', '2', 'all')]
  [string]$Target = 'launcher'
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Invoke-Npm([string[]]$NpmArgs) {
  & npm @NpmArgs
  if ($LASTEXITCODE -ne 0) { throw "npm $($NpmArgs -join ' ') failed (exit code $LASTEXITCODE)." }
}

# The launcher uses Node's built-in TypeScript support (Node 22.6 or later).
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Install Node.js 22 or later first: https://nodejs.org'
}
node -e "const [a, b] = process.versions.node.split('.').map(Number); process.exit(a > 22 || (a === 22 && b >= 6) ? 0 : 1)"
if ($LASTEXITCODE -ne 0) { throw "Node $(node -v) is too old: install Node 22.6 or later." }

if (-not (Test-Path 'node_modules/@playwright/test')) { Invoke-Npm @('ci') }
# Downloads Chromium the first time; quick when it is already installed.
Invoke-Npm @('exec', '-w', 'e2e', '--', 'playwright', 'install', 'chromium')

$envFile = Join-Path (Get-Location) 'e2e/demo/.env'
if (-not (Test-Path $envFile)) {
  $secure = Read-Host 'Password for the demo account (press Enter to use quick sign-in)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $lines = Get-Content 'e2e/demo/.env.example'
  if ($password -ne '') {
    $quote = if ($password.Contains("'")) { '"' } else { "'" }
    $lines = @($lines | Where-Object { $_ -notmatch '^DEMO_PASSWORD=' }) + "DEMO_PASSWORD=$quote$password$quote"
  } else {
    $lines = @($lines | Where-Object { $_ -notmatch '^DEMO_SIGN_IN=' }) + 'DEMO_SIGN_IN=quick'
  }
  # UTF-8 without a byte-order mark, which Node's .env reader expects.
  [IO.File]::WriteAllLines($envFile, [string[]]$lines)
  Write-Host "Saved your settings in e2e\demo\.env (edit it to change the URL, pace or sign-in)."
}

switch ($Target) {
  'launcher' { Invoke-Npm @('run', 'demo') }
  'all' { foreach ($n in 1..2) { Invoke-Npm @('run', "demo:$n") } }
  default { Invoke-Npm @('run', "demo:$Target") }
}
