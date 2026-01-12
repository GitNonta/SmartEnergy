#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SMART Energy Monitoring System - InfluxDB Initialization
# Creates buckets, tokens, and imports Flux tasks
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "   SMART Energy - InfluxDB Initialization"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════
INFLUX_URL="http://localhost:8086"
INFLUX_ORG="Ennergy"
INFLUX_BUCKET_PREFIX="AI205"
INFLUX_USER="admin"
INFLUX_PASSWORD="SmartEnergy2025!"  # Change this!

# Check if InfluxDB is running
if ! curl -s "$INFLUX_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}[ERROR] InfluxDB is not running at $INFLUX_URL${NC}"
    exit 1
fi

echo -e "${GREEN}[OK] InfluxDB is running${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 1: Initial Setup (if not already done)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 1/4]${NC} Checking InfluxDB setup status..."

# Check if already set up
if influx org list 2>/dev/null | grep -q "$INFLUX_ORG"; then
    echo -e "${YELLOW}[SKIP] InfluxDB already initialized${NC}"
else
    echo "Running initial setup..."
    influx setup \
        --username "$INFLUX_USER" \
        --password "$INFLUX_PASSWORD" \
        --org "$INFLUX_ORG" \
        --bucket "${INFLUX_BUCKET_PREFIX}_raw" \
        --retention 720h \
        --force
    
    echo -e "${GREEN}[OK] InfluxDB initialized${NC}"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 2: Create Buckets (Golden Roadmap)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 2/4]${NC} Creating buckets..."

# Raw bucket (30 days retention)
if ! influx bucket list | grep -q "${INFLUX_BUCKET_PREFIX}_raw"; then
    influx bucket create \
        --name "${INFLUX_BUCKET_PREFIX}_raw" \
        --org "$INFLUX_ORG" \
        --retention 720h \
        --description "Raw sensor data (30 days)"
    echo -e "  ${GREEN}[OK] ${INFLUX_BUCKET_PREFIX}_raw created (30d retention)${NC}"
else
    echo -e "  ${YELLOW}[SKIP] ${INFLUX_BUCKET_PREFIX}_raw exists${NC}"
fi

# Hourly bucket (infinite retention)
if ! influx bucket list | grep -q "${INFLUX_BUCKET_PREFIX}_hourly"; then
    influx bucket create \
        --name "${INFLUX_BUCKET_PREFIX}_hourly" \
        --org "$INFLUX_ORG" \
        --retention 0 \
        --description "Hourly aggregates (infinite)"
    echo -e "  ${GREEN}[OK] ${INFLUX_BUCKET_PREFIX}_hourly created (infinite)${NC}"
else
    echo -e "  ${YELLOW}[SKIP] ${INFLUX_BUCKET_PREFIX}_hourly exists${NC}"
fi

# Daily bucket (infinite retention)
if ! influx bucket list | grep -q "${INFLUX_BUCKET_PREFIX}_daily"; then
    influx bucket create \
        --name "${INFLUX_BUCKET_PREFIX}_daily" \
        --org "$INFLUX_ORG" \
        --retention 0 \
        --description "Daily aggregates (infinite)"
    echo -e "  ${GREEN}[OK] ${INFLUX_BUCKET_PREFIX}_daily created (infinite)${NC}"
else
    echo -e "  ${YELLOW}[SKIP] ${INFLUX_BUCKET_PREFIX}_daily exists${NC}"
fi

# Weekly bucket (infinite retention)
if ! influx bucket list | grep -q "${INFLUX_BUCKET_PREFIX}_weekly"; then
    influx bucket create \
        --name "${INFLUX_BUCKET_PREFIX}_weekly" \
        --org "$INFLUX_ORG" \
        --retention 0 \
        --description "Weekly aggregates (infinite)"
    echo -e "  ${GREEN}[OK] ${INFLUX_BUCKET_PREFIX}_weekly created (infinite)${NC}"
else
    echo -e "  ${YELLOW}[SKIP] ${INFLUX_BUCKET_PREFIX}_weekly exists${NC}"
fi

# Monthly bucket (infinite retention)
if ! influx bucket list | grep -q "${INFLUX_BUCKET_PREFIX}_monthly"; then
    influx bucket create \
        --name "${INFLUX_BUCKET_PREFIX}_monthly" \
        --org "$INFLUX_ORG" \
        --retention 0 \
        --description "Monthly aggregates (infinite)"
    echo -e "  ${GREEN}[OK] ${INFLUX_BUCKET_PREFIX}_monthly created (infinite)${NC}"
else
    echo -e "  ${YELLOW}[SKIP] ${INFLUX_BUCKET_PREFIX}_monthly exists${NC}"
fi

# Yearly/Billing bucket (infinite retention)
if ! influx bucket list | grep -q "${INFLUX_BUCKET_PREFIX}_yearly"; then
    influx bucket create \
        --name "${INFLUX_BUCKET_PREFIX}_yearly" \
        --org "$INFLUX_ORG" \
        --retention 0 \
        --description "Yearly/Billing aggregates (infinite)"
    echo -e "  ${GREEN}[OK] ${INFLUX_BUCKET_PREFIX}_yearly created (infinite)${NC}"
else
    echo -e "  ${YELLOW}[SKIP] ${INFLUX_BUCKET_PREFIX}_yearly exists${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 3: Create API Token for Backend
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 3/4]${NC} Creating API tokens..."

# Check if token already exists
if influx auth list | grep -q "smart-energy-backend"; then
    echo -e "${YELLOW}[SKIP] Backend token already exists${NC}"
    TOKEN=$(influx auth list --json | grep -A5 "smart-energy-backend" | grep "token" | head -1 | cut -d'"' -f4)
else
    # Create read/write token for backend
    TOKEN=$(influx auth create \
        --org "$INFLUX_ORG" \
        --description "smart-energy-backend" \
        --read-bucket "${INFLUX_BUCKET_PREFIX}_raw" \
        --write-bucket "${INFLUX_BUCKET_PREFIX}_raw" \
        --read-bucket "${INFLUX_BUCKET_PREFIX}_hourly" \
        --read-bucket "${INFLUX_BUCKET_PREFIX}_daily" \
        --read-bucket "${INFLUX_BUCKET_PREFIX}_weekly" \
        --read-bucket "${INFLUX_BUCKET_PREFIX}_monthly" \
        --read-bucket "${INFLUX_BUCKET_PREFIX}_yearly" \
        --json | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    
    echo -e "${GREEN}[OK] Backend token created${NC}"
fi

echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  IMPORTANT: Save this token for .env file                        ║${NC}"
echo -e "${YELLOW}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}║  INFLUXDB_TOKEN=$TOKEN${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Step 4: Import Flux Tasks
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[Step 4/4]${NC} Importing Flux tasks..."

FLUX_DIR="/opt/smart-energy/backend/flux_tasks"

if [ -d "$FLUX_DIR" ]; then
    for flux_file in "$FLUX_DIR"/*.flux; do
        if [ -f "$flux_file" ]; then
            task_name=$(basename "$flux_file" .flux)
            
            # Check if task already exists
            if influx task list | grep -q "$task_name"; then
                echo -e "  ${YELLOW}[SKIP] Task $task_name already exists${NC}"
            else
                # Create task from flux file
                influx task create \
                    --org "$INFLUX_ORG" \
                    --file "$flux_file" \
                    2>/dev/null || echo -e "  ${RED}[WARN] Failed to create $task_name${NC}"
                
                echo -e "  ${GREEN}[OK] Task $task_name imported${NC}"
            fi
        fi
    done
else
    echo -e "${YELLOW}[WARN] Flux tasks directory not found: $FLUX_DIR${NC}"
    echo "       Run deploy-app.sh first, then re-run this script"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo -e "   ${GREEN}InfluxDB Initialization Complete!${NC}"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "   Buckets created:"
influx bucket list --org "$INFLUX_ORG" | grep "$INFLUX_BUCKET_PREFIX"
echo ""
echo "   Tasks:"
influx task list --org "$INFLUX_ORG" 2>/dev/null | head -10 || echo "   No tasks yet"
echo ""
echo "   Next Steps:"
echo "   1. Copy the INFLUXDB_TOKEN above to your .env file"
echo "   2. Run: ./deploy-app.sh"
echo ""
echo "════════════════════════════════════════════════════════════════════"
