#!/bin/bash
# Firmware Upload Script (Linux/macOS)
# Usage: ./upload-firmware.sh firmware.bin 3.1.0 "Release notes"

set -e

FIRMWARE_FILE="$1"
VERSION="$2"
NOTES="${3:-}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
ENDPOINT="/api/firmware/upload-sftp"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Validate arguments
if [ -z "$FIRMWARE_FILE" ] || [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Missing arguments${NC}"
    echo "Usage: $0 <firmware_file> <version> [notes]"
    echo ""
    echo "Example:"
    echo "  $0 firmware.bin 3.1.0 \"Bug fix release\""
    exit 1
fi

# Check file exists
if [ ! -f "$FIRMWARE_FILE" ]; then
    echo -e "${RED}Error: File not found: $FIRMWARE_FILE${NC}"
    exit 1
fi

# Get file info
FILE_SIZE=$(stat -f%z "$FIRMWARE_FILE" 2>/dev/null || stat -c%s "$FIRMWARE_FILE" 2>/dev/null)
FILE_NAME=$(basename "$FIRMWARE_FILE")
FILE_SIZE_MB=$(echo "scale=2; $FILE_SIZE / 1024 / 1024" | bc)

# Display info
echo ""
echo -e "${CYAN}📤 Uploading Firmware${NC}"
echo -e "  File: ${FILE_NAME}"
echo -e "  Size: ${FILE_SIZE_MB} MB"
echo -e "  Version: ${VERSION}"
[ -n "$NOTES" ] && echo -e "  Notes: ${NOTES}"
echo ""

# Upload
echo -e "${CYAN}Uploading...${NC}"
RESPONSE=$(curl -s -X POST "$BACKEND_URL$ENDPOINT" \
  -F "firmware=@$FIRMWARE_FILE" \
  -F "version=$VERSION" \
  -F "notes=$NOTES")

# Parse response
OK=$(echo "$RESPONSE" | grep -o '"ok":[^,}]*' | grep true || echo "")

if [ -n "$OK" ]; then
    echo -e "${GREEN}✅ Upload Successful!${NC}"
    echo ""
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    echo ""
else
    echo -e "${RED}❌ Upload Failed!${NC}"
    echo ""
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
