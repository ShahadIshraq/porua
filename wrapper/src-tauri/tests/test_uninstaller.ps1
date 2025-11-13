#!/usr/bin/env pwsh
# Integration tests for Windows MSI uninstaller cleanup
# Run this script on Windows after building the MSI installer
# Usage: .\tests\test_uninstaller.ps1 -MsiPath "path\to\Porua.msi"

param(
    [Parameter(Mandatory=$true)]
    [string]$MsiPath,

    [switch]$SkipInstall,
    [switch]$KeepInstalled
)

$ErrorActionPreference = "Stop"
$TestsPassed = 0
$TestsFailed = 0
$AppDataPath = Join-Path $env:APPDATA "Porua"

function Write-TestHeader {
    param([string]$Name)
    Write-Host "`n=== TEST: $Name ===" -ForegroundColor Cyan
}

function Write-TestPass {
    param([string]$Message)
    Write-Host "  PASS: $Message" -ForegroundColor Green
    $script:TestsPassed++
}

function Write-TestFail {
    param([string]$Message)
    Write-Host "  FAIL: $Message" -ForegroundColor Red
    $script:TestsFailed++
}

function Write-TestSkip {
    param([string]$Message)
    Write-Host "  SKIP: $Message" -ForegroundColor Yellow
}

# Verify MSI exists
if (-not (Test-Path $MsiPath)) {
    Write-Host "ERROR: MSI file not found: $MsiPath" -ForegroundColor Red
    exit 1
}

Write-Host "Porua Uninstaller Integration Tests" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "MSI Path: $MsiPath"
Write-Host "AppData Path: $AppDataPath"
Write-Host ""

# Test 1: Install MSI
if (-not $SkipInstall) {
    Write-TestHeader "MSI Installation"

    # Remove old log if exists
    if (Test-Path $LogFile) {
        Remove-Item $LogFile -Force
    }

    $installResult = Start-Process msiexec.exe -ArgumentList "/i", "`"$MsiPath`"", "/qn" -Wait -PassThru
    if ($installResult.ExitCode -eq 0) {
        Write-TestPass "MSI installed successfully"
    } else {
        Write-TestFail "MSI installation failed with exit code: $($installResult.ExitCode)"
        exit 1
    }
} else {
    Write-TestSkip "Installation (using existing installation)"
}

# Test 2: Verify installation created registry entry
Write-TestHeader "Registry Entry Created"
$regPath = "HKCU:\Software\Porua Team\Porua"
if (Test-Path $regPath) {
    $appDataDir = Get-ItemProperty -Path $regPath -Name "AppDataDir" -ErrorAction SilentlyContinue
    if ($appDataDir) {
        Write-TestPass "AppDataDir registry entry exists: $($appDataDir.AppDataDir)"
    } else {
        Write-TestFail "AppDataDir registry entry not found"
    }
} else {
    Write-TestFail "Registry path not found: $regPath"
}

# Test 3: Create test data in AppData
Write-TestHeader "Create Test Data in AppData"
if (-not (Test-Path $AppDataPath)) {
    New-Item -Path $AppDataPath -ItemType Directory -Force | Out-Null
}

# Create subdirectories
$testDirs = @("bin", "models", "samples", "espeak-ng-data", "logs")
foreach ($dir in $testDirs) {
    $dirPath = Join-Path $AppDataPath $dir
    if (-not (Test-Path $dirPath)) {
        New-Item -Path $dirPath -ItemType Directory -Force | Out-Null
    }
}

# Create test files
$testFiles = @{
    "bin\porua_server" = "fake server binary"
    "models\kokoro-v1.0.onnx" = "fake model file (would be ~310MB)"
    "models\voices-v1.0.bin" = "fake voices file (would be ~27MB)"
    "config.json" = '{"test": true}'
    ".env" = "TEST_VAR=1"
    "installed.flag" = "installed"
    "logs\server.log" = "test log entry"
}

foreach ($file in $testFiles.GetEnumerator()) {
    $filePath = Join-Path $AppDataPath $file.Key
    $fileDir = Split-Path $filePath -Parent
    if (-not (Test-Path $fileDir)) {
        New-Item -Path $fileDir -ItemType Directory -Force | Out-Null
    }
    Set-Content -Path $filePath -Value $file.Value
}

# Verify test data
$createdFiles = Get-ChildItem -Path $AppDataPath -Recurse -File
Write-TestPass "Created $($createdFiles.Count) test files in $AppDataPath"

# Test 4: Verify test data size
Write-TestHeader "Verify Test Data Structure"
$totalSize = ($createdFiles | Measure-Object -Property Length -Sum).Sum
Write-TestPass "Total test data size: $([math]::Round($totalSize/1KB, 2)) KB"

foreach ($dir in $testDirs) {
    $dirPath = Join-Path $AppDataPath $dir
    if (Test-Path $dirPath) {
        Write-TestPass "Directory exists: $dir"
    } else {
        Write-TestFail "Directory missing: $dir"
    }
}

if ($KeepInstalled) {
    Write-Host "`nSkipping uninstall tests (--KeepInstalled specified)" -ForegroundColor Yellow
    Write-Host "`nTest Data Location: $AppDataPath" -ForegroundColor Cyan
    exit 0
}

# Test 5: Run uninstaller
Write-TestHeader "MSI Uninstallation"
# Use registry instead of deprecated Get-WmiObject Win32_Product (which triggers MSI reconfiguration)
$uninstallKey = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
    Where-Object { $_.GetValue("DisplayName") -eq "Porua" }
if (-not $uninstallKey) {
    # Try 32-bit registry on 64-bit Windows
    $uninstallKey = Get-ChildItem "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
        Where-Object { $_.GetValue("DisplayName") -eq "Porua" }
}
if (-not $uninstallKey) {
    Write-TestFail "Could not find Porua in registry uninstall keys"
    exit 1
}

$productCode = Split-Path $uninstallKey.Name -Leaf
Write-Host "  Product Code: $productCode"
$uninstallResult = Start-Process msiexec.exe -ArgumentList "/x", $productCode, "/qn" -Wait -PassThru
if ($uninstallResult.ExitCode -eq 0) {
    Write-TestPass "MSI uninstalled successfully"
} else {
    Write-TestFail "MSI uninstallation failed with exit code: $($uninstallResult.ExitCode)"
}

# Test 6: Verify AppData cleanup
Write-TestHeader "AppData Directory Cleanup"
if (Test-Path $AppDataPath) {
    $remainingFiles = Get-ChildItem -Path $AppDataPath -Recurse -File -ErrorAction SilentlyContinue
    if ($remainingFiles.Count -eq 0) {
        Write-TestFail "AppData directory exists but is empty (partial cleanup)"
    } else {
        Write-TestFail "AppData directory still exists with $($remainingFiles.Count) files"
        Write-Host "  Remaining files:" -ForegroundColor Yellow
        $remainingFiles | ForEach-Object { Write-Host "    $($_.FullName)" -ForegroundColor Yellow }
    }
} else {
    Write-TestPass "AppData directory completely removed: $AppDataPath"
}

# Test 7: Verify registry cleanup
Write-TestHeader "Registry Entry Cleanup"
if (Test-Path $regPath) {
    Write-TestFail "Registry path still exists: $regPath"
} else {
    Write-TestPass "Registry path removed"
}

# Test 8: Verify installation directory cleanup
Write-TestHeader "Installation Directory Cleanup"
$installDir = "${env:ProgramFiles}\Porua"
if (Test-Path $installDir) {
    $remainingFiles = Get-ChildItem -Path $installDir -Recurse -File -ErrorAction SilentlyContinue
    if ($remainingFiles.Count -gt 0) {
        Write-TestFail "Installation directory still has $($remainingFiles.Count) files"
        $remainingFiles | ForEach-Object { Write-Host "    $($_.FullName)" -ForegroundColor Yellow }
    } else {
        Write-TestFail "Installation directory exists but is empty"
    }
} else {
    Write-TestPass "Installation directory removed: $installDir"
}

# Summary
Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor $(if ($TestsFailed -gt 0) { "Red" } else { "Green" })

if ($TestsFailed -gt 0) {
    Write-Host "`nSome tests failed. Review the output above for details." -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nAll tests passed!" -ForegroundColor Green
    exit 0
}
