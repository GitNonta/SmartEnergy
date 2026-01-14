import React, { useState, useEffect } from 'react';
import { getApiBase } from '../config/api';

interface DeviceSelectorProps {
    selectedDevice: string;
    onDeviceChange: (deviceId: string) => void;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({
    selectedDevice,
    onDeviceChange
}) => {
    const [devices, setDevices] = useState<string[]>(['AI205']);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const response = await fetch(`${getApiBase()}/api/devices`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.devices.length > 0) {
                        setDevices(data.devices);
                    }
                }
            } catch (error) {
                console.error('Error fetching devices:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDevices();
        // Refresh device list every 5 minutes
        const interval = setInterval(fetchDevices, 300000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="device-selector">
            <label>Device:</label>
            <select
                value={selectedDevice}
                onChange={(e) => onDeviceChange(e.target.value)}
                disabled={loading}
            >
                {devices.map(device => (
                    <option key={device} value={device}>
                        {device}
                    </option>
                ))}
            </select>
            {loading && <span className="loading-indicator">•</span>}
        </div>
    );
};

export default DeviceSelector;
