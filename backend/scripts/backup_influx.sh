#!/bin/bash
# ========================================
# P4-4: InfluxDB Backup Script
# ========================================
# This script backs up the raw bucket to a local directory

# Configuration (set these or use environment variables)
INFLUX_HOST="${INFLUXDB_URL:-http://localhost:8086}"
INFLUX_TOKEN="${INFLUXDB_TOKEN}"
INFLUX_ORG="${INFLUXDB_ORG:-Ennergy}"
BUCKET_NAME="${INFLUXDB_BUCKET_RAW:-AI205_raw}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/influx_${BUCKET_NAME}_${TIMESTAMP}"

echo "📦 Starting InfluxDB Backup..."
echo "   Bucket: $BUCKET_NAME"
echo "   Output: $BACKUP_FILE"
echo "   Time: $(date)"

# Run backup using influx CLI
influx backup "$BACKUP_FILE" \
  --host "$INFLUX_HOST" \
  --token "$INFLUX_TOKEN" \
  --org "$INFLUX_ORG" \
  --bucket "$BUCKET_NAME"

if [ $? -eq 0 ]; then
  echo "✅ Backup completed successfully!"
  
  # Compress backup
  tar -czf "${BACKUP_FILE}.tar.gz" -C "$BACKUP_DIR" "$(basename $BACKUP_FILE)"
  rm -rf "$BACKUP_FILE"
  echo "📁 Compressed to: ${BACKUP_FILE}.tar.gz"
  
  # Calculate size
  SIZE=$(ls -lh "${BACKUP_FILE}.tar.gz" | awk '{print $5}')
  echo "📊 Backup size: $SIZE"
  
else
  echo "❌ Backup failed!"
  exit 1
fi

# Clean up old backups (older than RETENTION_DAYS)
echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "influx_*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "✅ Cleanup complete"

# List recent backups
echo ""
echo "📋 Recent backups:"
ls -lht "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -5

echo ""
echo "✅ Backup process complete!"
