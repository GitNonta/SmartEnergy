#!/bin/bash
#================================================================
# OWASP ZAP Security Scan Script
# Performs automated security testing on Smart Energy API
#================================================================

set -e

echo "🔒 Starting OWASP ZAP Security Scan..."
echo "Target: http://localhost:3001"
echo "Date: $(date)"
echo "================================================================"

# Configuration
TARGET_URL="http://localhost:3001"
REPORT_DIR="./reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create reports directory
mkdir -p $REPORT_DIR

# Run ZAP baseline scan
echo "Running ZAP Baseline Scan..."
docker run -v $(pwd)/$REPORT_DIR:/zap/wrk:rw \
  -t owasp/zap2docker-stable \
  zap-baseline.py \
  -t $TARGET_URL \
  -r zap-baseline-report-$TIMESTAMP.html \
  -J zap-baseline-report-$TIMESTAMP.json \
  -w zap-baseline-report-$TIMESTAMP.md \
  -c zap-config.conf || true

echo ""
echo "================================================================"
echo "ZAP Baseline Scan Complete"
echo "================================================================"
echo ""

# Run ZAP full scan (more comprehensive, takes longer)
echo "Running ZAP Full Scan..."
docker run -v $(pwd)/$REPORT_DIR:/zap/wrk:rw \
  -t owasp/zap2docker-stable \
  zap-full-scan.py \
  -t $TARGET_URL \
  -r zap-full-report-$TIMESTAMP.html \
  -J zap-full-report-$TIMESTAMP.json \
  -w zap-full-report-$TIMESTAMP.md || true

echo ""
echo "================================================================"
echo "ZAP Full Scan Complete"
echo "================================================================"
echo ""

# API-specific tests
echo "Running API Security Tests..."
docker run -v $(pwd)/$REPORT_DIR:/zap/wrk:rw \
  -t owasp/zap2docker-stable \
  zap-api-scan.py \
  -t $TARGET_URL/health \
  -f openapi \
  -r zap-api-report-$TIMESTAMP.html \
  -J zap-api-report-$TIMESTAMP.json || true

echo ""
echo "================================================================"
echo "📊 Scan Results Summary"
echo "================================================================"
echo "Reports generated in: $REPORT_DIR"
echo "- zap-baseline-report-$TIMESTAMP.html"
echo "- zap-full-report-$TIMESTAMP.html"
echo "- zap-api-report-$TIMESTAMP.html"
echo ""
echo "Expected Findings:"
echo "  🔴 Critical: Authentication bypass"
echo "  🔴 Critical: Missing rate limiting"
echo "  🔴 High: No input validation"
echo "  🔴 High: CORS misconfiguration"
echo "  🟡 Medium: Missing security headers"
echo ""
echo "Next Steps:"
echo "1. Review HTML reports in $REPORT_DIR"
echo "2. Prioritize Critical and High severity issues"
echo "3. Implement fixes from QA_SECURITY_REPORT.md"
echo "4. Re-run scan after fixes"
echo "================================================================"
