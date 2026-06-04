# guise installer — Windows PowerShell
#
#   irm https://raw.githubusercontent.com/brunomilani/guise/main/install.ps1 | iex
#
# or, from a clone:
#   ./install.ps1
#
# Builds the CLI, links `guise` globally, and prints the Claude Code
# plugin registration command. Never stores tokens or modifies SSH config.

$ErrorActionPreference = "Stop"

function Require($cmd, $msg) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw $msg }
}

Require node "node is required (>=18). Install from https://nodejs.org"
Require npm  "npm is required."
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "GitHub CLI (gh) not found — install it later: https://cli.github.com" -ForegroundColor Yellow
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Installing dependencies…" -ForegroundColor Cyan
npm install

Write-Host "Building CLI…" -ForegroundColor Cyan
npm run build

Write-Host "Linking 'guise' globally…" -ForegroundColor Cyan
npm link

Write-Host "Running tests…" -ForegroundColor Cyan
npm test

Write-Host ""
Write-Host "guise installed." -ForegroundColor Green
Write-Host @"
Try it:  cd C:\path\to\repo ; guise init ; guise status

Register the Claude Code plugin (optional):
  /plugin marketplace add brunomilani/guise
  /plugin install guise@guise
"@
