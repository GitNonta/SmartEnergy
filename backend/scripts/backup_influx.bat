@echo off
REM ========================================
REM P4-4: InfluxDB Backup Script (Windows)
REM ========================================

setlocal enabledelayedexpansion

REM Configuration
set INFLUX_HOST=http://localhost:8086
set INFLUX_ORG=Ennergy
set BUCKET_NAME=AI205_raw
set BACKUP_DIR=.\backups

REM Create backup directory
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Generate timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DATETIME=%%I
set TIMESTAMP=%DATETIME:~0,8%_%DATETIME:~8,6%
set BACKUP_FILE=%BACKUP_DIR%\influx_%BUCKET_NAME%_%TIMESTAMP%

echo 📦 Starting InfluxDB Backup...
echo    Bucket: %BUCKET_NAME%
echo    Output: %BACKUP_FILE%

REM Run backup
influx backup "%BACKUP_FILE%" --host "%INFLUX_HOST%" --org "%INFLUX_ORG%" --bucket "%BUCKET_NAME%"

if %ERRORLEVEL% EQU 0 (
    echo ✅ Backup completed successfully!
    echo 📁 Backup location: %BACKUP_FILE%
) else (
    echo ❌ Backup failed!
    exit /b 1
)

echo.
echo ✅ Backup process complete!
