import React, { useState, useEffect } from 'react';
import {
  Upload,
  DownloadCloud,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Cpu,
  Wifi,
  Clock,
  HardDrive,
  Activity,
  RefreshCcw
} from 'lucide-react';
import { useWebSocket } from '../context/WebSocketContext';
import { getApiBase } from '../config/api';
import { useTheme } from './AppShell';
import { useLanguage } from '../context/LanguageContext';

interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'updating';
  version: string;
  mac?: string;
  ip?: string;
  ssid?: string;
  heap_free_kb?: number;
  cpu_freq_mhz?: number;
  uptime_sec?: number;
  receivedAt?: Date;
}

const formatUptime = (seconds?: number) => {
  if (!seconds || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${['B', 'KB', 'MB'][i]}`;
};

/**
 * Device Card Component
 */
const DeviceCard: React.FC<{
  device: Device;
  onSelect: () => void;
  isSelected: boolean;
  t: (key: string) => string;
}> = ({ device, onSelect, isSelected, t }) => {
  const isOnline = device.status === 'online';

  return (
    <div
      onClick={onSelect}
      className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected
        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-lg'
        : isOnline
          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-300'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-60'
        }`}
    >
      {/* Status Indicator */}
      <div className="absolute top-3 right-3">
        <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
      </div>

      {/* Device Info */}
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${isOnline ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
          <Cpu className={`w-6 h-6 ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 truncate">{device.name || 'ESP32 Device'}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{device.ip || 'No IP'}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <Activity className="w-3 h-3" />
          <span className="font-mono truncate">{device.version}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <Clock className="w-3 h-3" />
          <span>{formatUptime(device.uptime_sec)}</span>
        </div>
        {device.heap_free_kb && (
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <HardDrive className="w-3 h-3" />
            <span>{device.heap_free_kb.toFixed(0)} KB</span>
          </div>
        )}
        {device.ssid && (
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <Wifi className="w-3 h-3" />
            <span className="truncate">{device.ssid}</span>
          </div>
        )}
      </div>

      {/* Select Badge */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
          {t('firmware.selected')}
        </div>
      )}
    </div>
  );
};

/**
 * Smart Upload Section Component
 * Auto-detects file type: .bin uploads directly, .ino compiles first
 */
const SmartUploadSection: React.FC<{
  selectedDevice?: Device | null;
  t: (key: string) => string;
}> = ({ selectedDevice, t }) => {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const fileType = file?.name.endsWith('.bin') ? 'bin' : file?.name.endsWith('.ino') ? 'ino' : null;
  const canUpload = selectedDevice?.ip && selectedDevice?.status === 'online';

  const uploadToDevice = async (binBlob: Blob, deviceIp: string): Promise<boolean> => {
    try {
      setStatus({ type: 'info', message: t('firmware.loginToDevice') });
      setProgress(70);

      // Login to ESP
      const loginForm = new FormData();
      loginForm.append('username', 'admin');
      loginForm.append('password', '1234');

      const loginRes = await fetch(`http://${deviceIp}/api/login`, {
        method: 'POST',
        body: loginForm
      });

      if (!loginRes.ok) {
        throw new Error('Login failed');
      }

      const loginData = await loginRes.json();
      const token = loginData.token;

      if (!token) {
        throw new Error('No token received');
      }

      setStatus({ type: 'info', message: 'Uploading firmware...' });
      setProgress(85);

      // Upload firmware
      const formData = new FormData();
      formData.append('update', binBlob, 'firmware.bin');

      const response = await fetch(`http://${deviceIp}/fwupdate?token=${token}`, {
        method: 'POST',
        body: formData
      });

      const text = await response.text();
      return response.ok && text.includes('OK');

    } catch (error: any) {
      console.error('Upload error:', error);
      return false;
    }
  };

  const handleProcess = async () => {
    if (!file || !canUpload) return;

    setProcessing(true);
    setProgress(10);

    try {
      let binBlob: Blob;

      if (fileType === 'ino') {
        // Compile .ino first
        setStatus({ type: 'info', message: 'Compiling... (1-2 minutes)' });
        setProgress(20);

        const formData = new FormData();
        formData.append('sketch', file);

        const response = await fetch(`${getApiBase()}/api/firmware/compile`, {
          method: 'POST',
          body: formData
        });

        setProgress(60);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Compilation failed');
        }

        binBlob = await response.blob();
        setStatus({ type: 'info', message: 'Compile done! Uploading...' });

      } else {
        // Direct .bin file
        binBlob = file;
        setStatus({ type: 'info', message: 'Preparing upload...' });
        setProgress(50);
      }

      // Upload to device
      const success = await uploadToDevice(binBlob, selectedDevice!.ip!);

      if (success) {
        setProgress(100);
        setStatus({ type: 'success', message: `✅ Updated ${selectedDevice?.name}! Device restarting...` });
        setFile(null);
      } else {
        throw new Error('Upload to device failed');
      }

    } catch (error: any) {
      setStatus({ type: 'error', message: error.message || 'Process failed' });
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  return (
    <div className="space-y-3">
      {/* File Input - accepts both .ino and .bin */}
      <label className={`flex items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-all ${processing ? 'border-slate-300 cursor-not-allowed bg-slate-50 dark:bg-slate-800' :
        'border-slate-300 hover:border-emerald-400 bg-slate-50 dark:bg-slate-700/30'
        }`}>
        <input
          type="file"
          className="hidden"
          accept=".ino,.bin"
          disabled={processing}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setStatus(null);
          }}
        />
        {file ? (
          <div className="text-center">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-2 ${fileType === 'bin' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
              {fileType === 'bin' ? '📦 Binary' : '📝 Source'}
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{file.name}</p>
            <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
          </div>
        ) : (
          <div className="text-center">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('firmware.selectFileDesc')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('firmware.inoDesc')}</p>
          </div>
        )}
      </label>

      {/* Device Status */}
      {!canUpload && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {selectedDevice ? t('firmware.deviceOffline') : t('firmware.selectDeviceFirst')}
          </span>
        </div>
      )}

      {/* Progress Bar */}
      {processing && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{fileType === 'ino' && progress < 60 ? t('firmware.compiling') : t('firmware.uploading')}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleProcess}
        disabled={!file || !canUpload || processing}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/20"
      >
        {processing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {fileType === 'ino' && progress < 60 ? t('firmware.compiling') : t('firmware.uploading')}
          </>
        ) : (
          <>
            {fileType === 'ino' ? <Cpu className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
            {fileType === 'ino' ? t('firmware.compileUpdate') : fileType === 'bin' ? t('firmware.updateDevice') : t('firmware.selectFile')}
          </>
        )}
      </button>

      {/* Status */}
      {status && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' :
          status.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
            'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
          }`}>
          {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
            status.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
              <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Upload Modal Component
 */
const UploadModal: React.FC<{
  device: Device;
  onClose: () => void;
}> = ({ device, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleUpload = async () => {
    if (!file || !device.ip) return;

    setUploading(true);
    setStatus({ type: 'info', message: 'Logging in to device...' });
    setProgress(10);

    try {
      // Step 1: Login to ESP and get token
      const loginForm = new FormData();
      loginForm.append('username', 'admin');
      loginForm.append('password', '1234');

      const loginRes = await fetch(`http://${device.ip}/api/login`, {
        method: 'POST',
        body: loginForm
      });

      if (!loginRes.ok) {
        throw new Error('Login failed. Check credentials.');
      }

      const loginData = await loginRes.json();
      const token = loginData.token;

      if (!token) {
        throw new Error('No token received from device');
      }

      setStatus({ type: 'info', message: 'Uploading firmware...' });
      setProgress(30);

      // Step 2: Upload firmware with token in URL
      const formData = new FormData();
      formData.append('update', file, file.name);

      const response = await fetch(`http://${device.ip}/fwupdate?token=${token}`, {
        method: 'POST',
        body: formData
      });

      setProgress(90);

      const text = await response.text();

      if (response.ok && text.includes('OK')) {
        setProgress(100);
        setStatus({ type: 'success', message: 'Firmware uploaded! Device is restarting...' });
        setTimeout(onClose, 3000);
      } else {
        throw new Error(text || 'Upload failed');
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message || 'Connection failed' });
    } finally {
      setUploading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Firmware Update</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{device.ip}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Current Version */}
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current Version</div>
            <div className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{device.version}</div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Firmware File (.bin)</label>
            <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors bg-slate-50 dark:bg-slate-700/30 ${uploading ? 'border-slate-300 dark:border-slate-600 cursor-not-allowed' : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400'}`}>
              <input
                type="file"
                className="hidden"
                accept=".bin"
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div className="text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{formatFileSize(file.size)}</p>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">Click to select file</p>
                </div>
              )}
            </label>
          </div>

          {/* Progress Bar */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Message */}
          {status && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' :
              status.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
                'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
              }`}>
              {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
                status.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
                  <Loader2 className="w-4 h-4 animate-spin" />}
              {status.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-slate-600 dark:text-slate-400 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <DownloadCloud className="w-4 h-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Main Component
 */
const DeviceFirmwareManager: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { espStatus, isConnected } = useWebSocket();
  const { currentTheme } = useTheme();
  const { t } = useLanguage();

  useEffect(() => {
    if (espStatus && espStatus.ip) {
      const device: Device = {
        id: espStatus.mac || 'unknown',
        name: 'AI205 Energy Meter',
        ssid: espStatus.ssid,
        status: espStatus.receivedAt ? 'online' : 'offline',
        version: espStatus.fw_version || espStatus.fw_current_version || 'Unknown',
        mac: espStatus.mac,
        ip: espStatus.ip,
        heap_free_kb: espStatus.heap_free_kb,
        cpu_freq_mhz: espStatus.cpu_freq_mhz,
        uptime_sec: espStatus.uptime_sec,
        receivedAt: espStatus.receivedAt
      };
      setDevices([device]);
      if (!selectedDevice) setSelectedDevice(device);
    } else {
      setDevices([]);
      setSelectedDevice(null);
    }
  }, [espStatus]);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100">{t('firmware.title')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('firmware.subtitle')}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isConnected
            ? `${currentTheme.accentLight} ${currentTheme.text}`
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? `${currentTheme.accent} animate-pulse` : 'bg-slate-400'}`} />
            {isConnected ? t('firmware.connected') : t('firmware.offline')}
          </div>
        </div>

        {/* Device List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{t('firmware.availableDevices')}</h2>
            <span className="text-xs text-slate-400">{devices.length} found</span>
          </div>

          {devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-full mb-4">
                <Wifi className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-center">
                {t('firmware.noDevices')}<br />
                <span className="text-xs">{t('firmware.waitingDevice')}</span>
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onSelect={() => setSelectedDevice(device)}
                  isSelected={selectedDevice?.id === device.id}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        {/* Smart Upload Section - All in One */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <SmartUploadSection selectedDevice={selectedDevice} t={t} />
        </div>
      </div>
    </div>
  );
};

export default DeviceFirmwareManager;