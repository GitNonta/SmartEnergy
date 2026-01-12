const fs = require('fs');
const path = require('path');
const multer = require('multer');
const FtpClient = require('ftp');
const axios = require('axios');
const FormData = require('form-data');
const { spawn } = require('child_process');

/**
 * Firmware Manager Service
 * Handles firmware file uploads, validation, and MQTT publishing
 */

class FirmwareManager {
  constructor(mqttClient, options = {}) {
    this.mqttClient = mqttClient;
    this.firmwareDir = options.firmwareDir || path.join(__dirname, '../../firmware');
    this.maxFileSize = options.maxFileSize || 4 * 1024 * 1024; // 4MB
    this.supportedExtensions = ['.bin', '.firmware'];
    
    // Skip remote upload for now - just keep firmware locally
    // Frontend will access via HTTP /firmware/filename
    
    // Ensure firmware directory exists
    this.ensureFirmwareDir();
    
    // Setup multer for file uploads
    this.setupMulter();
  }

  /**
   * Ensure firmware directory exists
   */
  ensureFirmwareDir() {
    if (!fs.existsSync(this.firmwareDir)) {
      fs.mkdirSync(this.firmwareDir, { recursive: true });
      console.log(`✅ Created firmware directory: ${this.firmwareDir}`);
    }
  }

  /**
   * Setup multer for file uploads
   */
  setupMulter() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.firmwareDir);
      },
      filename: (req, file, cb) => {
        // Sanitize filename
        const timestamp = Date.now();
        const filename = `${timestamp}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        cb(null, filename);
      }
    });

    const fileFilter = (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (!this.supportedExtensions.includes(ext)) {
        return cb(new Error(`❌ Unsupported file type: ${ext}`));
      }
      
      // ⚠️ Don't check file.size here - multer doesn't set it in fileFilter stage
      // Size limit is enforced via limits.fileSize in multer options
      cb(null, true);
    };

    this.upload = multer({
      storage,
      fileFilter,
      limits: { fileSize: this.maxFileSize }
    });
  }

  /**
   * Get multer middleware
   */
  getUploadMiddleware() {
    return this.upload.single('firmware');
  }

  /**
   * Publish firmware info to MQTT
   */
  async publishFirmwareInfo(filename, version, notes = '') {
    return new Promise(async (resolve, reject) => {
      const filePath = path.join(this.firmwareDir, filename);

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return reject(new Error('Firmware file not found'));
      }

      const stat = fs.statSync(filePath);
      const size = stat.size;
      const md5 = this.calculateMD5(filePath);

      // ✅ Use absolute URL for OTA - ESP needs full URL to download
      const baseUrl = process.env.FIRMWARE_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001';
      const downloadUrl = `${baseUrl}/firmware/${encodeURIComponent(filename)}`;

      // Build firmware info payload
      const info = {
        device: 'AI205',
        version,
        filename,
        size,
        md5,
        notes: notes || '',
        timestamp: new Date().toISOString(),
        url: downloadUrl
      };

      const topic = process.env.MQTT_FW_TOPIC || 'AI205/firmware/info';

      console.log(`📢 Publishing firmware info to ${topic}:`);
      console.log(JSON.stringify(info, null, 2));

      this.mqttClient.publish(
        topic,
        JSON.stringify(info),
        { retain: true, qos: 1 },
        (err) => {
          if (err) {
            console.error(`❌ Failed to publish firmware info: ${err.message}`);
            return reject(err);
          }
          
          console.log('✅ Firmware info published successfully');
          resolve(info);
        }
      );
    });
  }

  /**
   * List available firmware files
   */
  listFirmwareFiles() {
    try {
      if (!fs.existsSync(this.firmwareDir)) {
        return [];
      }

      const files = fs.readdirSync(this.firmwareDir);
      const firmwares = files
        .filter(file => this.supportedExtensions.includes(path.extname(file).toLowerCase()))
        .map(file => {
          const filePath = path.join(this.firmwareDir, file);
          const stat = fs.statSync(filePath);
          const md5 = this.calculateMD5(filePath);

          return {
            filename: file,
            size: stat.size,
            md5,
            uploadedAt: stat.birthtimeMs,
            uploadedAtFormatted: new Date(stat.birthtimeMs).toISOString()
          };
        })
        .sort((a, b) => b.uploadedAt - a.uploadedAt);

      return firmwares;
    } catch (error) {
      console.error('❌ Error listing firmware files:', error.message);
      return [];
    }
  }

  /**
   * Get firmware file info
   */
  getFirmwareInfo(filename) {
    try {
      const filePath = path.join(this.firmwareDir, filename);

      if (!fs.existsSync(filePath)) {
        throw new Error('Firmware file not found');
      }

      const stat = fs.statSync(filePath);
      const md5 = this.calculateMD5(filePath);

      return {
        filename,
        size: stat.size,
        md5,
        uploadedAt: stat.birthtimeMs,
        uploadedAtFormatted: new Date(stat.birthtimeMs).toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting firmware info:', error.message);
      return null;
    }
  }

  /**
   * Delete firmware file
   */
  deleteFirmware(filename) {
    try {
      const filePath = path.join(this.firmwareDir, filename);

      // Security: prevent directory traversal
      if (!path.resolve(filePath).startsWith(path.resolve(this.firmwareDir))) {
        throw new Error('Invalid firmware path');
      }

      if (!fs.existsSync(filePath)) {
        throw new Error('Firmware file not found');
      }

      fs.unlinkSync(filePath);
      console.log(`✅ Deleted firmware: ${filename}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting firmware:', error.message);
      throw error;
    }
  }

  /**
   * Upload firmware file to remote FTP server via PHP endpoint
   * Uses HTTP POST to /upload_firmware.php endpoint
   */
  async uploadViaFtpScript(filename) {
    const filePath = path.join(this.firmwareDir, filename);

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('Firmware file not found');
    }

    const fileSize = fs.statSync(filePath).size;
    const fileData = fs.readFileSync(filePath);

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const uploadEndpoint = `${backendUrl}/upload_firmware.php`;

    console.log(`📤 Starting FTP upload via PHP endpoint`);
    console.log(`   Endpoint: ${uploadEndpoint}`);
    console.log(`   File: ${filename} (${(fileSize / 1024).toFixed(2)} KB)`);
    console.log(`   FTP Config: host=${process.env.FTP_HOST}, user=${process.env.FTP_USER}`);

    try {
      const response = await axios.post(
        `${uploadEndpoint}?filename=${encodeURIComponent(filename)}`,
        fileData,
        {
          headers: {
            'Content-Type': 'application/octet-stream'
          },
          timeout: 60000 // 60 seconds
        }
      );

      const result = response.data;

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      console.log(`✅ FTP upload completed successfully`);
      console.log(`   URL: ${result.url}`);

      return result;

    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error(`❌ FTP upload failed: ${errorMsg}`);
      throw new Error(`FTP upload failed: ${errorMsg}`);
    }
  }

  /**
   * Calculate MD5 hash of file
   */
  calculateMD5(filePath) {
    try {
      const crypto = require('crypto');
      const content = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      console.error('❌ Error calculating MD5:', error.message);
      return '';
    }
  }

  /**
   * Validate firmware file
   */
  validateFirmware(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
      }

      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      if (!this.supportedExtensions.includes(ext)) {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      if (stat.size === 0) {
        throw new Error('File is empty');
      }

      if (stat.size > this.maxFileSize) {
        throw new Error(`File size exceeds limit: ${this.maxFileSize / 1024 / 1024}MB`);
      }

      return {
        valid: true,
        size: stat.size,
        extension: ext
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = FirmwareManager;
