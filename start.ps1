# AI SOC Copilot - Local startup (Windows)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting AI SOC Copilot..." -ForegroundColor Cyan

# Backend
$backend = Join-Path $root "backend"
if (-not (Test-Path "$backend\venv")) {
    Write-Host "Creating Python venv..."
    python -m venv "$backend\venv"
    & "$backend\venv\Scripts\pip" install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r "$backend\requirements.txt"
}

Write-Host "Backend -> http://localhost:8000 (API docs: /docs)"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backend'; .\venv\Scripts\uvicorn app.main:app --reload --port 8000"

Start-Sleep -Seconds 3

# Frontend
$frontend = Join-Path $root "frontend"
if (-not (Test-Path "$frontend\node_modules")) {
    Write-Host "Installing frontend dependencies (first run may take several minutes)..."
    Set-Location $frontend
    npm install
    Set-Location $root
}

Write-Host "Frontend -> http://localhost:3000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontend'; npm run dev"

Write-Host "`nDone. Register at http://localhost:3000/register" -ForegroundColor Green
Write-Host "Optional demo login after seed: analyst@soc-copilot.com / Analyst123!" -ForegroundColor Yellow
