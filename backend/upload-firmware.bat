@echo off
REM Firmware Upload Script (Windows)
REM Usage: upload-firmware.bat firmware.bin 3.1.0 "Release notes"

setlocal enabledelayedexpansion

set "FIRMWARE_FILE=%~1"
set "VERSION=%~2"
set "NOTES=%~3"
set "BACKEND_URL=http://localhost:3001"
set "ENDPOINT=/api/firmware/upload-sftp"

REM Validate arguments
if "%FIRMWARE_FILE%"=="" (
    echo Error: Missing arguments
    echo Usage: %0 firmware_file version [notes]
    echo.
    echo Example:
    echo   %0 firmware.bin 3.1.0 "Bug fix release"
    exit /b 1
)

if "%VERSION%"=="" (
    echo Error: Version is required
    exit /b 1
)

REM Check file exists
if not exist "%FIRMWARE_FILE%" (
    echo Error: File not found: %FIRMWARE_FILE%
    exit /b 1
)

REM Get file info
for %%F in ("%FIRMWARE_FILE%") do (
    set "FILE_NAME=%%~nxF"
    set "FILE_SIZE=%%~zF"
)

REM Display info
echo.
echo 📤 Uploading Firmware
echo   File: %FILE_NAME%
echo   Size: %FILE_SIZE% bytes
echo   Version: %VERSION%
if not "%NOTES%"=="" echo   Notes: %NOTES%
echo.
echo Uploading...
echo.

REM Upload using PowerShell (more reliable for multipart form data)
powershell -NoProfile -Command ^
    $form = @{ ^
        firmware = Get-Item -Path '%FIRMWARE_FILE%'; ^
        version = '%VERSION%'; ^
        notes = '%NOTES%' ^
    }; ^
    try { ^
        $response = Invoke-WebRequest -Uri '%BACKEND_URL%%ENDPOINT%' -Method Post -Form $form -SkipHttpErrorCheck; ^
        $result = $response.Content ^| ConvertFrom-Json; ^
        if ($result.ok) { ^
            Write-Host '✅ Upload Successful!' -ForegroundColor Green; ^
            Write-Host ''; ^
            Write-Host ('  Filename: ' + $result.info.filename); ^
            Write-Host ('  Size: ' + $result.info.size + ' bytes'); ^
            Write-Host ('  MD5: ' + $result.info.md5); ^
            Write-Host ('  Timestamp: ' + $result.info.timestamp); ^
            Write-Host ('  MQTT Topic: AI205/firmware/info'); ^
            Write-Host ''; ^
        } else { ^
            Write-Host '❌ Upload Failed!' -ForegroundColor Red; ^
            Write-Host ('  Error: ' + $result.error); ^
            exit 1; ^
        } ^
    } catch { ^
        Write-Host '❌ Error:' $_.Exception.Message -ForegroundColor Red; ^
        exit 1; ^
    }

pause
