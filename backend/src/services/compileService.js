/**
 * Arduino Compile Service
 * Uses arduino-cli to compile .ino files to .bin
 */

const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ARDUINO_CLI_PATH = path.join(__dirname, '../../bin/arduino-cli.exe');
const BOARD_FQBN = 'esp32:esp32:esp32';  // ESP32 Dev Module

class CompileService {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'arduino-compile');
  }

  /**
   * Initialize temp directory
   */
  async init() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log('✅ CompileService initialized');
    } catch (error) {
      console.error('❌ Failed to init CompileService:', error);
    }
  }

  /**
   * Create a unique sketch folder for compilation
   */
  async createSketchFolder(sketchContent, sketchName = 'sketch') {
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const folderName = `${sketchName}_${uniqueId}`;
    const sketchFolder = path.join(this.tempDir, folderName);
    const sketchFile = path.join(sketchFolder, `${folderName}.ino`);
    
    await fs.mkdir(sketchFolder, { recursive: true });
    await fs.writeFile(sketchFile, sketchContent);
    
    return { sketchFolder, sketchFile, folderName };
  }

  /**
   * Copy additional files (headers, etc) to sketch folder
   */
  async copyAdditionalFiles(sourceDir, sketchFolder) {
    try {
      const files = await fs.readdir(sourceDir);
      for (const file of files) {
        if (file.endsWith('.h') || file.endsWith('.cpp') || file.endsWith('.c')) {
          const sourcePath = path.join(sourceDir, file);
          const destPath = path.join(sketchFolder, file);
          await fs.copyFile(sourcePath, destPath);
        }
      }
    } catch (error) {
      console.log('Note: No additional files to copy');
    }
  }

  /**
   * Compile sketch to binary
   * @param {string} sketchContent - Content of .ino file
   * @param {string} sketchName - Name of the sketch (no extension)
   * @returns {Promise<{success: boolean, binPath?: string, error?: string, output?: string}>}
   */
  async compile(sketchContent, sketchName = 'sketch') {
    let sketchFolder = null;
    
    try {
      // Create sketch folder
      const { sketchFolder: folder, folderName } = await this.createSketchFolder(sketchContent, sketchName);
      sketchFolder = folder;
      
      console.log(`📦 Compiling sketch in: ${sketchFolder}`);
      
      // Build command
      const buildDir = path.join(sketchFolder, 'build');
      await fs.mkdir(buildDir, { recursive: true });
      
      const args = [
        'compile',
        '--fqbn', BOARD_FQBN,
        '--output-dir', buildDir,
        sketchFolder
      ];
      
      // Execute compile
      const result = await this.execArduinoCli(args);
      
      if (result.exitCode !== 0) {
        return {
          success: false,
          error: 'Compilation failed',
          output: result.stderr || result.stdout
        };
      }
      
      // Find the .bin file
      const buildFiles = await fs.readdir(buildDir);
      const binFile = buildFiles.find(f => f.endsWith('.ino.bin'));
      
      if (!binFile) {
        return {
          success: false,
          error: 'Binary file not found after compilation',
          output: result.stdout
        };
      }
      
      const binPath = path.join(buildDir, binFile);
      const binContent = await fs.readFile(binPath);
      
      // Clean up sketch folder (keep bin temporarily)
      setTimeout(async () => {
        try {
          await fs.rm(sketchFolder, { recursive: true, force: true });
        } catch (e) {
          console.log('Cleanup error:', e.message);
        }
      }, 60000); // Clean up after 1 minute
      
      return {
        success: true,
        binPath,
        binContent,
        binName: binFile,
        output: result.stdout
      };
      
    } catch (error) {
      // Cleanup on error
      if (sketchFolder) {
        try {
          await fs.rm(sketchFolder, { recursive: true, force: true });
        } catch (e) {}
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute arduino-cli command
   */
  execArduinoCli(args) {
    return new Promise((resolve) => {
      const proc = spawn(ARDUINO_CLI_PATH, args, {
        cwd: this.tempDir,
        env: process.env
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout,
          stderr
        });
      });
      
      proc.on('error', (error) => {
        resolve({
          exitCode: -1,
          stdout,
          stderr: error.message
        });
      });
    });
  }

  /**
   * Check if arduino-cli is available
   */
  async checkHealth() {
    try {
      const result = await this.execArduinoCli(['version']);
      return {
        available: result.exitCode === 0,
        version: result.stdout.trim()
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * List installed cores
   */
  async listCores() {
    const result = await this.execArduinoCli(['core', 'list', '--format', 'json']);
    if (result.exitCode === 0) {
      try {
        return JSON.parse(result.stdout);
      } catch {
        return [];
      }
    }
    return [];
  }
}

// Singleton instance
const compileService = new CompileService();

module.exports = { compileService, CompileService };
