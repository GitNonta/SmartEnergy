#!/usr/bin/env pwsh
# ═══════════════════════════════════════════════════════════════════════════
# Comprehensive Test Runner for Smart Energy Monitoring System
# Runs all automated tests: API, Security, Load, E2E
# ═══════════════════════════════════════════════════════════════════════════

param(
    [ValidateSet('all', 'api', 'security', 'load', 'e2e')]
    [string]$TestSuite = 'all',
    
    [switch]$SkipSetup,
    [switch]$GenerateReport
)

$ErrorActionPreference = 'Continue'
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = ".\test-reports\$timestamp"

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🧪 Smart Energy Monitoring - Automated Test Suite" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

# Create report directory
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

# ═══════════════════════════════════════════════════════════════════════════
# Pre-flight Checks
# ═══════════════════════════════════════════════════════════════════════════
Write-Host "📋 Pre-flight Checks..." -ForegroundColor Yellow

$checks = @{
    "Backend Running" = { 
        try { 
            $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 2
            return $response.StatusCode -eq 200
        } catch { return $false }
    }
    "Frontend Running" = {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2
            return $response.StatusCode -eq 200
        } catch { return $false }
    }
    "Node.js Installed" = { Get-Command node -ErrorAction SilentlyContinue }
    "npm Installed" = { Get-Command npm -ErrorAction SilentlyContinue }
}

$allChecksPassed = $true
foreach ($check in $checks.GetEnumerator()) {
    $result = & $check.Value
    if ($result) {
        Write-Host "  ✅ $($check.Key)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($check.Key)" -ForegroundColor Red
        $allChecksPassed = $false
    }
}

if (-not $allChecksPassed -and -not $SkipSetup) {
    Write-Host "`n⚠️  Some pre-flight checks failed. Please ensure services are running." -ForegroundColor Yellow
    Write-Host "Run: .\fix-and-start.ps1 to start all services" -ForegroundColor Yellow
    exit 1
}

# ═══════════════════════════════════════════════════════════════════════════
# Function: Run API Tests
# ═══════════════════════════════════════════════════════════════════════════
function Run-APITests {
    Write-Host "`n📡 Running API Tests..." -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
    
    if (-not (Get-Command newman -ErrorAction SilentlyContinue)) {
        Write-Host "Installing Newman..." -ForegroundColor Yellow
        npm install -g newman newman-reporter-htmlextra
    }
    
    $collectionPath = ".\tests\api\smart-energy-api.postman_collection.json"
    
    if (Test-Path $collectionPath) {
        newman run $collectionPath `
            --reporters cli,json,htmlextra `
            --reporter-json-export "$reportDir\api-test-results.json" `
            --reporter-htmlextra-export "$reportDir\api-test-results.html"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ API Tests PASSED" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ API Tests FAILED" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "❌ API test collection not found: $collectionPath" -ForegroundColor Red
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# Function: Run Security Tests
# ═══════════════════════════════════════════════════════════════════════════
function Run-SecurityTests {
    Write-Host "`n🔒 Running Security Tests..." -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
    
    # Check if Docker is available
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "Running OWASP ZAP scan..." -ForegroundColor Yellow
        
        docker run --rm `
            -v "${PWD}/tests/security/reports:/zap/wrk:rw" `
            owasp/zap2docker-stable `
            zap-baseline.py `
            -t http://host.docker.internal:3001 `
            -r zap-report.html `
            -J zap-report.json
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Security Scan Complete" -ForegroundColor Green
            return $true
        } else {
            Write-Host "⚠️  Security Scan found vulnerabilities (expected)" -ForegroundColor Yellow
            return $false
        }
    } else {
        Write-Host "⚠️  Docker not found, skipping ZAP scan" -ForegroundColor Yellow
        Write-Host "   Install Docker to run security tests" -ForegroundColor Gray
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# Function: Run Load Tests
# ═══════════════════════════════════════════════════════════════════════════
function Run-LoadTests {
    Write-Host "`n⚡ Running Load Tests..." -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
    
    if (-not (Get-Command artillery -ErrorAction SilentlyContinue)) {
        Write-Host "Installing Artillery..." -ForegroundColor Yellow
        npm install -g artillery
    }
    
    $loadTestPath = ".\tests\load\websocket-load-test.yml"
    
    if (Test-Path $loadTestPath) {
        artillery run $loadTestPath `
            --output "$reportDir\load-test-results.json"
        
        # Generate HTML report
        artillery report "$reportDir\load-test-results.json" `
            --output "$reportDir\load-test-results.html"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Load Tests PASSED" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Load Tests FAILED" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "❌ Load test config not found: $loadTestPath" -ForegroundColor Red
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# Function: Generate Summary Report
# ═══════════════════════════════════════════════════════════════════════════
function Generate-SummaryReport {
    param(
        [hashtable]$Results
    )
    
    Write-Host "`n📊 Generating Test Summary..." -ForegroundColor Cyan
    
    $summary = @"
# Test Execution Summary

**Date:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Report Directory:** $reportDir

## Results

| Test Suite | Status | Duration |
|------------|--------|----------|
| API Tests | $(if ($Results.API) {'✅ PASSED'} else {'❌ FAILED'}) | - |
| Security Tests | $(if ($Results.Security) {'✅ PASSED'} else {'❌ FAILED'}) | - |
| Load Tests | $(if ($Results.Load) {'✅ PASSED'} else {'❌ FAILED'}) | - |

## Files Generated

- API Test Results: api-test-results.html
- Security Scan: zap-report.html
- Load Test Results: load-test-results.html

## Next Steps

1. Review all HTML reports in: $reportDir
2. Address any failed tests
3. Fix identified vulnerabilities
4. Re-run tests after fixes

---
*Generated by automated test suite*
"@
    
    $summary | Out-File -FilePath "$reportDir\TEST_SUMMARY.md" -Encoding UTF8
    
    Write-Host "`n✅ Summary report generated: $reportDir\TEST_SUMMARY.md" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════════════
# Main Execution
# ═══════════════════════════════════════════════════════════════════════════

$results = @{
    API = $false
    Security = $false
    Load = $false
}

try {
    switch ($TestSuite) {
        'api' {
            $results.API = Run-APITests
        }
        'security' {
            $results.Security = Run-SecurityTests
        }
        'load' {
            $results.Load = Run-LoadTests
        }
        'all' {
            $results.API = Run-APITests
            $results.Security = Run-SecurityTests
            $results.Load = Run-LoadTests
        }
    }
    
    # Generate summary report
    if ($GenerateReport) {
        Generate-SummaryReport -Results $results
    }
    
    # Final summary
    Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "📊 Test Execution Complete" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
    
    $totalTests = $results.Values | Where-Object { $_ -ne $null }
    $passedTests = $totalTests | Where-Object { $_ -eq $true }
    
    Write-Host "Total: $($totalTests.Count) | Passed: $($passedTests.Count) | Failed: $($totalTests.Count - $passedTests.Count)" -ForegroundColor White
    Write-Host "`nReports available in: $reportDir" -ForegroundColor Cyan
    
    if ($passedTests.Count -eq $totalTests.Count) {
        Write-Host "`n✅ ALL TESTS PASSED!" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "`n⚠️  SOME TESTS FAILED - Review reports for details" -ForegroundColor Yellow
        exit 1
    }
    
} catch {
    Write-Host "`n❌ Test execution error: $_" -ForegroundColor Red
    exit 1
}
