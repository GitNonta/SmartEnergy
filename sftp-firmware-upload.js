const Client = require('ssh2').Client;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration from .env
const SFTP_HOST = '192.168.137.157';
const SFTP_PORT = 8022;
const SFTP_USER = 'u0_a175';
const SFTP_PASSWORD = 'Nontawat01';
const SFTP_REMOTE_PATH = './Firmware'; // Use relative path in home directory

// Local firmware file
const FIRMWARE_FILE = 'd:\\smart\\AI205_Arduino_Example\\AI205_final\\build\\esp32.esp32.esp32\\AI205_final.ino.bin';

class SFTPFirmwareUploader {
    constructor() {
        this.client = new Client();
        this.sftp = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.client.on('ready', () => {
                console.log('✅ SSH Connection established');
                this.client.sftp((err, sftp) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.sftp = sftp;
                        console.log('✅ SFTP subsystem initialized');
                        resolve();
                    }
                });
            });

            this.client.on('error', (err) => {
                reject(err);
            });

            this.client.on('close', () => {
                console.log('🔌 SSH Connection closed');
            });

            console.log(`🔌 Connecting to ${SFTP_HOST}:${SFTP_PORT}...`);
            this.client.connect({
                host: SFTP_HOST,
                port: SFTP_PORT,
                username: SFTP_USER,
                password: SFTP_PASSWORD,
                readyTimeout: 30000,
                algorithms: {
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', 'aes192-cbc', 'aes256-cbc'],
                    serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
                },
                strictHostKeyChecking: false
            });
        });
    }

    async mkdir(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.mkdir(remotePath, (err) => {
                if (err && err.code !== 2) { // 2 = file already exists
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async stat(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.stat(remotePath, (err, stats) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(stats);
                }
            });
        });
    }

    async listFiles(remotePath) {
        return new Promise((resolve, reject) => {
            this.sftp.readdir(remotePath, (err, files) => {
                if (err) {
                    if (err.code === 2) { // Directory doesn't exist
                        resolve([]);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(files);
                }
            });
        });
    }

    async deleteFile(remoteFile) {
        return new Promise((resolve, reject) => {
            this.sftp.unlink(remoteFile, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async uploadFile(localFile, remotePath) {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(localFile);
            const writeStream = this.sftp.createWriteStream(remotePath);

            let uploadedBytes = 0;
            const totalBytes = fs.statSync(localFile).size;

            readStream.on('data', (chunk) => {
                uploadedBytes += chunk.length;
                const progress = ((uploadedBytes / totalBytes) * 100).toFixed(2);
                process.stdout.write(`\r📤 Uploading... ${progress}% (${(uploadedBytes / 1024).toFixed(2)} KB / ${(totalBytes / 1024).toFixed(2)} KB)`);
            });

            writeStream.on('finish', () => {
                console.log('\n✅ File uploaded successfully');
                resolve();
            });

            writeStream.on('error', (err) => {
                reject(err);
            });

            readStream.on('error', (err) => {
                reject(err);
            });

            readStream.pipe(writeStream);
        });
    }

    calculateMD5(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);

            stream.on('error', (err) => {
                reject(err);
            });

            stream.on('data', (chunk) => {
                hash.update(chunk);
            });

            stream.on('end', () => {
                resolve(hash.digest('hex'));
            });
        });
    }

    async disconnect() {
        return new Promise((resolve) => {
            if (this.client) {
                this.client.end();
            }
            resolve();
        });
    }
}

async function main() {
    console.log('🚀 SFTP Firmware Upload Tool');
    console.log('════════════════════════════════════════\n');

    // Check if firmware file exists
    if (!fs.existsSync(FIRMWARE_FILE)) {
        console.error('❌ Firmware file not found:', FIRMWARE_FILE);
        process.exit(1);
    }

    const fileSize = fs.statSync(FIRMWARE_FILE).size;
    const fileName = path.basename(FIRMWARE_FILE);

    console.log('📋 Firmware Information:');
    console.log(`   File: ${fileName}`);
    console.log(`   Size: ${(fileSize / 1024).toFixed(2)} KB`);
    console.log(`   Path: ${FIRMWARE_FILE}\n`);

    const uploader = new SFTPFirmwareUploader();

    try {
        // Connect to SFTP server
        console.log('1️⃣ Connecting to SFTP server...');
        await uploader.connect();
        console.log();

        // Create firmware directory if it doesn't exist
        console.log('2️⃣ Checking Firmware directory...');
        try {
            const stats = await uploader.stat(SFTP_REMOTE_PATH);
            console.log(`   ℹ️  Directory ${SFTP_REMOTE_PATH} exists (${stats.isDirectory() ? 'directory' : 'file'})\n`);
        } catch (err) {
            if (err.code === 2 || err.message.includes('No such file')) {
                console.log(`   📁 Creating directory ${SFTP_REMOTE_PATH}...`);
                await uploader.mkdir(SFTP_REMOTE_PATH);
                console.log(`   ✅ Directory created\n`);
            } else {
                throw err;
            }
        }

        // List existing files
        console.log('3️⃣ Checking for existing .bin files...');
        const files = await uploader.listFiles(SFTP_REMOTE_PATH);
        const binFiles = files.filter(f => f.filename.endsWith('.bin'));

        if (binFiles.length > 0) {
            console.log(`   Found ${binFiles.length} existing .bin file(s):`);
            for (const binFile of binFiles) {
                const remoteFilePath = `${SFTP_REMOTE_PATH}/${binFile.filename}`;
                console.log(`   🗑️  Deleting: ${binFile.filename}`);
                await uploader.deleteFile(remoteFilePath);
                console.log(`      ✅ Deleted`);
            }
        } else {
            console.log('   ℹ️  No existing .bin files found');
        }
        console.log();

        // Calculate MD5 of local file
        console.log('4️⃣ Calculating file integrity...');
        const md5 = await uploader.calculateMD5(FIRMWARE_FILE);
        console.log(`   MD5: ${md5}\n`);

        // Upload new firmware file
        console.log('5️⃣ Uploading firmware file...');
        const remoteFilePath = `${SFTP_REMOTE_PATH}/${fileName}`;
        await uploader.uploadFile(FIRMWARE_FILE, remoteFilePath);
        console.log();

        console.log('✅ Upload Summary:');
        console.log(`   Remote Path: ${remoteFilePath}`);
        console.log(`   File Size: ${(fileSize / 1024).toFixed(2)} KB`);
        console.log(`   MD5 Checksum: ${md5}`);
        console.log(`   Timestamp: ${new Date().toISOString()}`);
        console.log('\n🎉 Firmware upload completed successfully!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await uploader.disconnect();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
