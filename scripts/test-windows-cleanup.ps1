# Porua Windows Cleanup Verification Script
# Run after uninstalling to verify complete cleanup
# Updated to specifically check for Porua.exe lingering issue

Write-Host "=== Porua Complete Cleanup Verification ===" -ForegroundColor Cyan
Write-Host ""

$errors = 0
$warnings = 0

# Check if Porua.exe process is still running
Write-Host "Checking for running processes..." -NoNewline
$runningProcesses = Get-Process | Where-Object {$_.ProcessName -like "*porua*"}
if ($runningProcesses) {
    Write-Host " WARNING" -ForegroundColor Yellow
    $runningProcesses | ForEach-Object {
        Write-Host "  Found running: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Yellow
    }
    $warnings++
} else {
    Write-Host " PASSED" -ForegroundColor Green
}

# Check installation directory
Write-Host "Checking installation directory..." -NoNewline
$installDir = "$env:ProgramFiles\Porua"
if (Test-Path $installDir) {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "  Found: $installDir" -ForegroundColor Yellow

    # List all remaining files
    $remainingFiles = Get-ChildItem $installDir -Recurse -File
    Write-Host "  Remaining files ($($remainingFiles.Count)):" -ForegroundColor Yellow
    $remainingFiles | ForEach-Object {
        Write-Host "    - $($_.FullName)" -ForegroundColor Yellow
    }

    # Specifically check for Porua.exe
    if (Test-Path "$installDir\Porua.exe") {
        Write-Host "  ⚠️  CRITICAL: Porua.exe is lingering!" -ForegroundColor Red
    }

    $errors++
} else {
    Write-Host " PASSED" -ForegroundColor Green
}

# Specifically check for Porua.exe even if directory is gone
Write-Host "Checking specifically for Porua.exe..." -NoNewline
if (Test-Path "$env:ProgramFiles\Porua\Porua.exe") {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "  Found: Porua.exe still exists!" -ForegroundColor Yellow
    $errors++
} else {
    Write-Host " PASSED" -ForegroundColor Green
}

# Check AppData directory
Write-Host "Checking AppData directory..." -NoNewline
$appDataDir = "$env:APPDATA\Porua"
if (Test-Path $appDataDir) {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "  Found: $appDataDir" -ForegroundColor Yellow

    # Calculate size
    $size = (Get-ChildItem $appDataDir -Recurse | Measure-Object -Property Length -Sum).Sum
    $sizeMB = [math]::Round($size / 1MB, 2)
    Write-Host "  Size: $sizeMB MB" -ForegroundColor Yellow

    # List subdirectories
    Get-ChildItem $appDataDir -Directory | ForEach-Object {
        Write-Host "    - $($_.Name)/" -ForegroundColor Yellow
    }

    $errors++
} else {
    Write-Host " PASSED" -ForegroundColor Green
}

# Check registry keys
Write-Host "Checking registry keys..." -NoNewline
try {
    $regKey = Get-ItemProperty -Path "HKCU:\Software\Porua" -ErrorAction Stop
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "  Found: HKCU\Software\Porua" -ForegroundColor Yellow
    $regKey.PSObject.Properties | ForEach-Object {
        Write-Host "    $($_.Name) = $($_.Value)" -ForegroundColor Yellow
    }
    $errors++
} catch {
    Write-Host " PASSED" -ForegroundColor Green
}

# Check for scheduled restart (files pending deletion)
Write-Host "Checking for pending file deletions..." -NoNewline
try {
    $pendingOps = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager" -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
    if ($pendingOps -and $pendingOps.PendingFileRenameOperations -like "*Porua*") {
        Write-Host " WARNING" -ForegroundColor Yellow
        Write-Host "  Files scheduled for deletion on next reboot" -ForegroundColor Yellow
        $warnings++
    } else {
        Write-Host " PASSED" -ForegroundColor Green
    }
} catch {
    Write-Host " PASSED" -ForegroundColor Green
}

# Check Start Menu shortcuts
Write-Host "Checking Start Menu shortcuts..." -NoNewline
$startMenuShortcut = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Porua.lnk"
if (Test-Path $startMenuShortcut) {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "  Found: $startMenuShortcut" -ForegroundColor Yellow
    $errors++
} else {
    Write-Host " PASSED" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "✓ CLEANUP SUCCESSFUL" -ForegroundColor Green
    Write-Host "No residual files found." -ForegroundColor Green
    Write-Host "Porua.exe confirmed deleted." -ForegroundColor Green
    exit 0
} elseif ($errors -eq 0) {
    Write-Host "⚠ CLEANUP COMPLETED WITH WARNINGS" -ForegroundColor Yellow
    Write-Host "Found $warnings warning(s)" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "✗ CLEANUP INCOMPLETE" -ForegroundColor Red
    Write-Host "Found $errors error(s) and $warnings warning(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common causes:" -ForegroundColor Yellow
    Write-Host "  1. Application was running during uninstall (should be auto-terminated)" -ForegroundColor Yellow
    Write-Host "  2. Files locked by another process" -ForegroundColor Yellow
    Write-Host "  3. Permission issues" -ForegroundColor Yellow
    exit 1
}
