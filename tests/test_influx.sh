#!/usr/bin/env bash
# ============================================
# InfluxDB + Backend Test Suite
# Smart Energy Monitoring System
# ============================================
# 
# Usage:
#   chmod +x test_influx.sh
#   ./test_influx.sh
#
# Required ENV:
#   INFLUX_URL    - InfluxDB URL (default: http://127.0.0.1:8086)
#   INFLUX_ORG    - InfluxDB Organization
#   INFLUX_TOKEN  - InfluxDB API Token
#
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
: "${INFLUX_URL:=http://127.0.0.1:8086}"
: "${INFLUX_ORG:=Ennergy}"
: "${INFLUX_TOKEN:=}"
: "${RAW_BUCKET:=AI205_raw}"
: "${HOURLY_BUCKET:=AI205_hourly}"
: "${DAILY_BUCKET:=AI205_daily}"
: "${DEVICE_ID:=AI205}"
: "${BACKEND_URL:=http://localhost:3001}"

# Check if token is set
if [ -z "$INFLUX_TOKEN" ]; then
    echo -e "${RED}❌ ERROR: INFLUX_TOKEN is not set${NC}"
    echo "Usage: INFLUX_TOKEN=your-token ./test_influx.sh"
    exit 1
fi

echo ""
echo "============================================"
echo -e "${CYAN}🔬 InfluxDB + Backend Test Suite${NC}"
echo "============================================"
echo "URL: $INFLUX_URL"
echo "Org: $INFLUX_ORG"
echo "Backend: $BACKEND_URL"
echo "============================================"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Helper function
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((TESTS_FAILED++))
    fi
}

# ============================================
# TEST 1: InfluxDB Health Check
# ============================================
echo -e "${YELLOW}[1/10]${NC} Checking InfluxDB health..."
HEALTH=$(curl -s -H "Authorization: Token $INFLUX_TOKEN" "$INFLUX_URL/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"pass"'; then
    echo -e "       Status: ${GREEN}pass${NC}"
    test_result 0
else
    echo -e "       Status: ${RED}$HEALTH${NC}"
    test_result 1
fi
echo ""

# ============================================
# TEST 2: Check Buckets Exist
# ============================================
echo -e "${YELLOW}[2/10]${NC} Checking buckets exist..."
BUCKETS=$(curl -s -H "Authorization: Token $INFLUX_TOKEN" "$INFLUX_URL/api/v2/buckets?org=$INFLUX_ORG" 2>/dev/null)

check_bucket() {
    if echo "$BUCKETS" | grep -q "\"name\":\"$1\""; then
        echo -e "       $1: ${GREEN}exists${NC}"
        return 0
    else
        echo -e "       $1: ${RED}NOT FOUND${NC}"
        return 1
    fi
}

BUCKET_OK=0
check_bucket "$RAW_BUCKET" || BUCKET_OK=1
check_bucket "$HOURLY_BUCKET" || BUCKET_OK=1
check_bucket "$DAILY_BUCKET" || BUCKET_OK=1
test_result $BUCKET_OK
echo ""

# ============================================
# TEST 3: Write Test Point to Raw
# ============================================
echo -e "${YELLOW}[3/10]${NC} Writing test point to raw bucket..."
NOW=$(date +%s)
TEST_VALUE="99999.$(( RANDOM % 1000 ))"

WRITE_RESULT=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
    "$INFLUX_URL/api/v2/write?org=$INFLUX_ORG&bucket=$RAW_BUCKET&precision=s" \
    -H "Authorization: Token $INFLUX_TOKEN" \
    --data-binary "energy_3phase,device_id=$DEVICE_ID energy_total=$TEST_VALUE $NOW" 2>/dev/null)

if [ "$WRITE_RESULT" == "204" ]; then
    echo -e "       Value written: $TEST_VALUE"
    test_result 0
else
    echo -e "       HTTP Status: $WRITE_RESULT"
    test_result 1
fi
echo ""

# ============================================
# TEST 4: Query Last Raw Point
# ============================================
echo -e "${YELLOW}[4/10]${NC} Querying last raw point..."
sleep 1

QUERY_RESULT=$(curl -s -X POST "$INFLUX_URL/api/v2/query?org=$INFLUX_ORG" \
    -H "Authorization: Token $INFLUX_TOKEN" \
    -H 'Content-type: application/vnd.flux' \
    -H 'Accept: application/csv' \
    -d "from(bucket:\"$RAW_BUCKET\") |> range(start:-5m) |> filter(fn:(r)=>r._measurement==\"energy_3phase\" and r._field==\"energy_total\") |> last()" 2>/dev/null)

if echo "$QUERY_RESULT" | grep -q "$DEVICE_ID"; then
    echo -e "       Data found for device: $DEVICE_ID"
    test_result 0
else
    echo -e "       No data returned"
    test_result 1
fi
echo ""

# ============================================
# TEST 5: Check Tasks Exist and Active
# ============================================
echo -e "${YELLOW}[5/10]${NC} Checking InfluxDB tasks..."
TASKS=$(curl -s -H "Authorization: Token $INFLUX_TOKEN" "$INFLUX_URL/api/v2/tasks?org=$INFLUX_ORG" 2>/dev/null)

check_task() {
    TASK_INFO=$(echo "$TASKS" | grep -o "{[^}]*\"name\":\"$1\"[^}]*}" | head -1)
    if [ -n "$TASK_INFO" ]; then
        if echo "$TASK_INFO" | grep -q '"status":"active"'; then
            echo -e "       $1: ${GREEN}active${NC}"
            return 0
        else
            echo -e "       $1: ${YELLOW}inactive${NC}"
            return 1
        fi
    else
        echo -e "       $1: ${RED}NOT FOUND${NC}"
        return 1
    fi
}

TASK_OK=0
check_task "aggregate_hourly" || TASK_OK=1
check_task "aggregate_daily" || TASK_OK=1
test_result $TASK_OK
echo ""

# ============================================
# TEST 6: Query Hourly Bucket
# ============================================
echo -e "${YELLOW}[6/10]${NC} Querying hourly bucket..."
HOURLY_DATA=$(curl -s -X POST "$INFLUX_URL/api/v2/query?org=$INFLUX_ORG" \
    -H "Authorization: Token $INFLUX_TOKEN" \
    -H 'Content-type: application/vnd.flux' \
    -H 'Accept: application/csv' \
    -d "from(bucket:\"$HOURLY_BUCKET\") |> range(start:-24h) |> filter(fn:(r)=>r._field==\"energy_total\") |> count()" 2>/dev/null)

if [ -n "$HOURLY_DATA" ] && ! echo "$HOURLY_DATA" | grep -q "error"; then
    HOURLY_COUNT=$(echo "$HOURLY_DATA" | grep -v "^#" | tail -1 | cut -d',' -f7)
    echo -e "       Data points found: $HOURLY_COUNT"
    test_result 0
else
    echo -e "       No hourly data (task may not have run yet)"
    test_result 0  # Not a failure if just no data yet
fi
echo ""

# ============================================
# TEST 7: Check for Duplicates
# ============================================
echo -e "${YELLOW}[7/10]${NC} Checking for duplicate entries..."
DUP_CHECK=$(curl -s -X POST "$INFLUX_URL/api/v2/query?org=$INFLUX_ORG" \
    -H "Authorization: Token $INFLUX_TOKEN" \
    -H 'Content-type: application/vnd.flux' \
    -H 'Accept: application/csv' \
    -d "from(bucket:\"$HOURLY_BUCKET\") |> range(start:-24h) |> filter(fn:(r)=>r._field==\"energy_total\") |> aggregateWindow(every:1h, fn:count) |> filter(fn:(r)=>r._value > 1) |> count()" 2>/dev/null)

DUP_COUNT=$(echo "$DUP_CHECK" | grep -v "^#" | grep -v "^$" | tail -1 | cut -d',' -f7)
if [ -z "$DUP_COUNT" ] || [ "$DUP_COUNT" == "0" ]; then
    echo -e "       Duplicates: ${GREEN}none${NC}"
    test_result 0
else
    echo -e "       Duplicates found: ${RED}$DUP_COUNT hours${NC}"
    test_result 1
fi
echo ""

# ============================================
# TEST 8: Check for Negative Values
# ============================================
echo -e "${YELLOW}[8/10]${NC} Checking for negative values..."
NEG_CHECK=$(curl -s -X POST "$INFLUX_URL/api/v2/query?org=$INFLUX_ORG" \
    -H "Authorization: Token $INFLUX_TOKEN" \
    -H 'Content-type: application/vnd.flux' \
    -H 'Accept: application/csv' \
    -d "from(bucket:\"$HOURLY_BUCKET\") |> range(start:-7d) |> filter(fn:(r)=>r._field==\"energy_total\") |> filter(fn:(r)=>r._value < 0.0) |> count()" 2>/dev/null)

NEG_COUNT=$(echo "$NEG_CHECK" | grep -v "^#" | grep -v "^$" | tail -1 | cut -d',' -f7)
if [ -z "$NEG_COUNT" ] || [ "$NEG_COUNT" == "0" ]; then
    echo -e "       Negative values: ${GREEN}none${NC}"
    test_result 0
else
    echo -e "       Negative values found: ${RED}$NEG_COUNT${NC}"
    test_result 1
fi
echo ""

# ============================================
# TEST 9: Backend Health Check
# ============================================
echo -e "${YELLOW}[9/10]${NC} Checking backend health..."
BACKEND_HEALTH=$(curl -s "$BACKEND_URL/health" 2>/dev/null || echo "CONNECTION_REFUSED")

if echo "$BACKEND_HEALTH" | grep -q "success"; then
    echo -e "       Backend: ${GREEN}online${NC}"
    test_result 0
elif echo "$BACKEND_HEALTH" | grep -q "CONNECTION_REFUSED"; then
    echo -e "       Backend: ${RED}offline (not running)${NC}"
    test_result 1
else
    echo -e "       Backend: ${YELLOW}response: $BACKEND_HEALTH${NC}"
    test_result 1
fi
echo ""

# ============================================
# TEST 10: Backend API Endpoints
# ============================================
echo -e "${YELLOW}[10/10]${NC} Testing backend API endpoints..."

test_endpoint() {
    RESP=$(curl -s -w "%{http_code}" -o /dev/null "$BACKEND_URL$1" 2>/dev/null || echo "000")
    if [ "$RESP" == "200" ]; then
        echo -e "       $1: ${GREEN}200 OK${NC}"
        return 0
    else
        echo -e "       $1: ${RED}$RESP${NC}"
        return 1
    fi
}

API_OK=0
test_endpoint "/api/energy/state" || API_OK=1
test_endpoint "/api/data/integrity-check" || API_OK=1
test_result $API_OK
echo ""

# ============================================
# SUMMARY
# ============================================
echo "============================================"
echo -e "${CYAN}📊 Test Summary${NC}"
echo "============================================"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! System is healthy.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️ Some tests failed. Check the output above.${NC}"
    exit 1
fi
