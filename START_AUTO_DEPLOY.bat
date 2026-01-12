@echo off
chcp 65001 >nul
title SmartEnergy Auto-Deploy Watcher

echo.
echo ╔══════════════════════════════════════════╗
echo ║   SmartEnergy Auto-Commit ^& Deploy      ║
echo ╠══════════════════════════════════════════╣
echo ║  กำลังเริ่ม Watch Mode...                ║
echo ║  ระบบจะ commit และ deploy อัตโนมัติ     ║
echo ║  เมื่อตรวจพบการเปลี่ยนแปลงไฟล์          ║
echo ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM เริ่ม watch mode - ตรวจสอบทุก 30 วินาที
powershell -ExecutionPolicy Bypass -File "%~dp0auto-deploy.ps1" -WatchMode -IntervalSeconds 30

pause
