# Auto-Commit & Deploy Script for SmartEnergy
# สคริปต์นี้จะ watch การเปลี่ยนแปลงไฟล์และ commit/push อัตโนมัติ

param(
    [int]$IntervalSeconds = 60,  # ตรวจสอบทุกกี่วินาที
    [string]$Branch = "main",
    [switch]$WatchMode = $false
)

$ErrorActionPreference = "Continue"
$ProjectPath = $PSScriptRoot

# สีสำหรับ output
function Write-Status($message) { Write-Host "[INFO] $message" -ForegroundColor Cyan }
function Write-Success($message) { Write-Host "[OK] $message" -ForegroundColor Green }
function Write-Warning($message) { Write-Host "[WARN] $message" -ForegroundColor Yellow }
function Write-Error($message) { Write-Host "[ERROR] $message" -ForegroundColor Red }

# Function: ดึงข้อมูล changes
function Get-GitChanges {
    Set-Location $ProjectPath
    $status = git status --porcelain
    return $status
}

# Function: สร้าง commit message อัตโนมัติ
function Get-AutoCommitMessage {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $changes = git diff --stat --cached 2>$null
    $changedFiles = (git diff --name-only --cached 2>$null) -join ", "
    
    if ($changedFiles.Length -gt 100) {
        $changedFiles = $changedFiles.Substring(0, 97) + "..."
    }
    
    if ([string]::IsNullOrEmpty($changedFiles)) {
        return "Auto-commit: Update at $timestamp"
    }
    
    return "Auto-commit: $changedFiles [$timestamp]"
}

# Function: Commit และ Push
function Invoke-AutoCommitAndPush {
    Set-Location $ProjectPath
    
    # ตรวจสอบว่ามีการเปลี่ยนแปลงหรือไม่
    $changes = Get-GitChanges
    if ([string]::IsNullOrEmpty($changes)) {
        Write-Status "No changes detected."
        return $false
    }
    
    Write-Status "Changes detected:"
    Write-Host $changes -ForegroundColor Gray
    
    # Stage all changes (ยกเว้น node_modules และ .env)
    Write-Status "Staging changes..."
    git add --all -- ':!node_modules' ':!**/node_modules' ':!.env' ':!**/.env' 2>$null
    
    # ตรวจสอบว่ามี staged changes หรือไม่
    $staged = git diff --cached --stat
    if ([string]::IsNullOrEmpty($staged)) {
        Write-Warning "No staged changes after filtering."
        return $false
    }
    
    # Commit
    $commitMessage = Get-AutoCommitMessage
    Write-Status "Committing: $commitMessage"
    git commit -m $commitMessage
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Commit failed!"
        return $false
    }
    
    Write-Success "Commit successful!"
    
    # Push to remote
    Write-Status "Pushing to origin/$Branch..."
    git push origin $Branch
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Push failed!"
        return $false
    }
    
    Write-Success "Push successful! GitHub Actions will deploy automatically."
    return $true
}

# Function: Watch Mode - ตรวจสอบการเปลี่ยนแปลงอย่างต่อเนื่อง
function Start-WatchMode {
    Write-Host "============================================" -ForegroundColor Magenta
    Write-Host "   SmartEnergy Auto-Commit & Deploy" -ForegroundColor Magenta
    Write-Host "============================================" -ForegroundColor Magenta
    Write-Host ""
    Write-Status "Watch mode started. Checking every $IntervalSeconds seconds..."
    Write-Status "Press Ctrl+C to stop."
    Write-Host ""
    
    while ($true) {
        try {
            $result = Invoke-AutoCommitAndPush
            if ($result) {
                Write-Host ""
                Write-Success "=========================================="
                Write-Success "  Deploy triggered! Check GitHub Actions"
                Write-Success "=========================================="
                Write-Host ""
            }
        }
        catch {
            Write-Error "Error: $_"
        }
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Waiting $IntervalSeconds seconds..." -ForegroundColor DarkGray
        Start-Sleep -Seconds $IntervalSeconds
    }
}

# Main
Write-Host ""
if ($WatchMode) {
    Start-WatchMode
} else {
    # Single run mode
    Write-Status "Running single auto-commit..."
    $result = Invoke-AutoCommitAndPush
    if ($result) {
        Write-Success "Done! Changes pushed to GitHub."
    } else {
        Write-Status "No changes to commit."
    }
}
