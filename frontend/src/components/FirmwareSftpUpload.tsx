import React, { useState, useRef } from 'react';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  X,
  FileUp,
  Server
} from 'lucide-react';
import { useWebSocket } from '../context/WebSocketContext';

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  message: string;
  filename?: string;
  version?: string;
  size?: number;
}

/**
 * Firmware SFTP Upload Component
 * Uploads firmware files directly to remote SFTP server
 * Uses Node.js SSH2 SFTP connection via backend API
 */
const FirmwareSftpUpload: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  const [version, setVersion] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { isConnected } = useWebSocket();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate .bin file
      if (!file.name.endsWith('.bin')) {
        setUploadState({
          status: 'error',
          progress: 0,
          message: '❌ Only .bin files are allowed',
          filename: file.name
        });
        return;
      }

      // Validate file size (max 4MB)
      if (file.size > 4 * 1024 * 1024) {
        setUploadState({
          status: 'error',
          progress: 0,
          message: '❌ File size exceeds 4MB limit',
          filename: file.name,
          size: file.size
        });
        return;
      }

      setSelectedFile(file);
      setUploadState({
        status: 'idle',
        progress: 0,
        message: `✅ Ready to upload: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: '❌ Please select a firmware file'
      });
      return;
    }

    if (!version.trim()) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: '❌ Please enter firmware version'
      });
      return;
    }

    const formData = new FormData();
    formData.append('firmware', selectedFile);
    formData.append('version', version);
    formData.append('notes', notes);

    setUploadState({
      status: 'uploading',
      progress: 25,
      message: '📤 Uploading to backend...',
      filename: selectedFile.name,
      version: version,
      size: selectedFile.size
    });

    try {
      const response = await fetch('/api/firmware/upload-sftp-v2', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();

      setUploadState({
        status: 'success',
        progress: 100,
        message: `✅ Firmware upload initiated! Backend is transferring to SFTP server...`,
        filename: data.file?.filename,
        version: data.file?.version,
        size: data.file?.size
      });

      // Reset form after 3 seconds
      setTimeout(() => {
        setSelectedFile(null);
        setVersion('');
        setNotes('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setUploadState({
          status: 'idle',
          progress: 0,
          message: ''
        });
      }, 3000);

    } catch (error) {
      console.error('Upload error:', error);
      setUploadState({
        status: 'error',
        progress: 0,
        message: `❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filename: selectedFile.name
      });
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setVersion('');
    setNotes('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadState({
      status: 'idle',
      progress: 0,
      message: ''
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            SFTP Firmware Upload
          </h2>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          isConnected 
            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
        }`}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </div>

      {/* File Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Firmware File (.bin)
        </label>
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin"
            onChange={handleFileSelect}
            disabled={uploadState.status === 'uploading'}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState.status === 'uploading'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileUp className="w-5 h-5" />
            {selectedFile ? selectedFile.name : 'Click to select firmware file'}
          </button>
        </div>
        {uploadState.message && uploadState.status !== 'uploading' && uploadState.status !== 'success' && (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            {uploadState.message}
          </p>
        )}
      </div>

      {/* Version Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Firmware Version *
        </label>
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          disabled={uploadState.status === 'uploading' || !selectedFile}
          placeholder="e.g., 3.1.0"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Release Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Release Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={uploadState.status === 'uploading' || !selectedFile}
          placeholder="Describe changes in this firmware version..."
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Status Messages */}
      {uploadState.status === 'uploading' && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <Loader className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
              {uploadState.message}
            </span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-full transition-all duration-300"
              style={{ width: `${uploadState.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {uploadState.status === 'success' && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-200">
                {uploadState.message}
              </p>
              {uploadState.filename && (
                <p className="text-sm text-green-800 dark:text-green-300 mt-1">
                  File: {uploadState.filename} | Version: {uploadState.version}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {uploadState.status === 'error' && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900 dark:text-red-200">
                {uploadState.message}
              </p>
              {uploadState.filename && (
                <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                  File: {uploadState.filename}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleUpload}
          disabled={
            uploadState.status === 'uploading' ||
            !selectedFile ||
            !version.trim() ||
            !isConnected
          }
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          {uploadState.status === 'uploading' ? 'Uploading...' : 'Upload to SFTP'}
        </button>
        <button
          onClick={handleClear}
          disabled={uploadState.status === 'uploading' || !selectedFile}
          className="px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
          ℹ️ How it works
        </h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <li>✓ Select a .bin firmware file (max 4MB)</li>
          <li>✓ Enter the firmware version number</li>
          <li>✓ Click upload to transfer to SFTP server via SSH2</li>
          <li>✓ Backend automatically deletes old .bin files on remote server</li>
          <li>✓ WebSocket notifications show upload progress</li>
        </ul>
      </div>
    </div>
  );
};

export default FirmwareSftpUpload;
