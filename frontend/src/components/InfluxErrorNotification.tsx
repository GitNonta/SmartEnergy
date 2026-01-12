/**
 * InfluxDB Error Notification
 * แสดง error เมื่อดึงข้อมูลจาก InfluxDB ไม่สำเร็จ
 */

import React, { useEffect } from 'react';
import { AlertCircle, X, RefreshCw } from 'lucide-react';
import { useInfluxData } from '../context/InfluxContext';
import './InfluxErrorNotification.css';

export const InfluxErrorNotification: React.FC = () => {
  const { error, clearError, refreshData, isConnected } = useInfluxData();
  const [isVisible, setIsVisible] = React.useState(false);

  useEffect(() => {
    if (error) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [error]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => clearError(), 300);
  };

  const handleRetry = () => {
    refreshData();
  };

  if (!isVisible) return null;

  return (
    <div className="influx-error-notification">
      <div className="influx-error-content">
        <div className="influx-error-icon">
          <AlertCircle className="w-5 h-5" />
        </div>
        
        <div className="influx-error-message">
          <div className="influx-error-title">
            {isConnected ? 'Data Loading Error' : 'InfluxDB Connection Failed'}
          </div>
          <div className="influx-error-description">
            {error}
          </div>
        </div>
        
        <div className="influx-error-actions">
          <button
            onClick={handleRetry}
            className="influx-error-retry"
            title="Retry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleClose}
            className="influx-error-close"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfluxErrorNotification;
