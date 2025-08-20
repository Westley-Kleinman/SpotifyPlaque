Param(
  [int]$Port = 3001
)
$ErrorActionPreference = 'Stop'
Write-Host "Starting Spotify Plaque backend on port $Port..." -ForegroundColor Green
Push-Location "$PSScriptRoot\backend"
try {
  if (-Not (Test-Path node_modules)) {
    Write-Host "Installing dependencies (first run)..." -ForegroundColor Yellow
    npm install | Out-Host
  }
  $env:PORT = $Port
  npm start
}
finally {
  Pop-Location
}
