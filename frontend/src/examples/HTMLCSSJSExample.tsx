import React, { useState, useEffect } from 'react';
import CustomEnergyCard from '../components/CustomEnergyCard';
import { useWebSocket } from '../context/WebSocketContext';

/**
 * ตัวอย่างการใช้ HTML, CSS, JavaScript ใน React
 * แสดงวิธีการผสมผสานทั้ง 3 เข้าด้วยกัน
 */
function HTMLCSSJSExample() {
  // ========================================
  // JavaScript: State Management
  // ========================================
  const [voltage, setVoltage] = useState(220);
  const [current, setCurrent] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [counter, setCounter] = useState(0);
  
  // Get real data from WebSocket
  const { energyData, isConnected } = useWebSocket();
  
  // ========================================
  // JavaScript: Calculations
  // ========================================
  const calculatePower = () => {
    return voltage * current;
  };
  
  const calculateEnergy = () => {
    return (calculatePower() * counter) / 3600; // Wh
  };
  
  // ========================================
  // JavaScript: Effects (Side Effects)
  // ========================================
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning) {
      interval = setInterval(() => {
        setCounter(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);
  
  // Update from real data
  useEffect(() => {
    if (energyData) {
      setVoltage(energyData.voltage.f1 || 220);
      setCurrent(energyData.current.i1 || 10);
    }
  }, [energyData]);
  
  // ========================================
  // JavaScript: Event Handlers
  // ========================================
  const handleStartStop = () => {
    setIsRunning(!isRunning);
  };
  
  const handleReset = () => {
    setCounter(0);
    setIsRunning(false);
  };
  
  const handleVoltageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVoltage(Number(e.target.value));
  };
  
  const handleCurrentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrent(Number(e.target.value));
  };
  
  // ========================================
  // JavaScript: Conditional Logic
  // ========================================
  const getStatusColor = () => {
    if (!isConnected) return '#ef4444'; // Red
    if (voltage > 240) return '#f59e0b'; // Orange
    if (voltage < 200) return '#f59e0b'; // Orange
    return '#10b981'; // Green
  };
  
  const getStatusText = () => {
    if (!isConnected) return 'Disconnected';
    if (voltage > 240) return 'High Voltage';
    if (voltage < 200) return 'Low Voltage';
    return 'Normal';
  };
  
  // ========================================
  // HTML (JSX): Component Structure
  // ========================================
  return (
    <div style={styles.container}>
      {/* Header Section */}
      <header style={styles.header}>
        <h1 style={styles.title}>
          HTML + CSS + JavaScript + React Example
        </h1>
        <p style={styles.subtitle}>
          ตัวอย่างการใช้งานทั้ง 3 ภาษาผสมกันใน React
        </p>
      </header>
      
      {/* Status Bar */}
      <div style={{
        ...styles.statusBar,
        backgroundColor: getStatusColor()
      }}>
        <span style={styles.statusText}>
          Status: {getStatusText()}
        </span>
        <span style={styles.statusText}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
      </div>
      
      {/* Main Content */}
      <div style={styles.content}>
        {/* Left Panel: Controls */}
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Controls</h2>
          
          {/* Voltage Control */}
          <div style={styles.controlGroup}>
            <label style={styles.label}>
              Voltage (V):
              <input
                type="range"
                min="180"
                max="260"
                value={voltage}
                onChange={handleVoltageChange}
                style={styles.slider}
              />
              <span style={styles.value}>{voltage.toFixed(1)} V</span>
            </label>
          </div>
          
          {/* Current Control */}
          <div style={styles.controlGroup}>
            <label style={styles.label}>
              Current (A):
              <input
                type="range"
                min="0"
                max="50"
                value={current}
                onChange={handleCurrentChange}
                style={styles.slider}
              />
              <span style={styles.value}>{current.toFixed(1)} A</span>
            </label>
          </div>
          
          {/* Buttons */}
          <div style={styles.buttonGroup}>
            <button
              onClick={handleStartStop}
              style={{
                ...styles.button,
                backgroundColor: isRunning ? '#ef4444' : '#10b981'
              }}
            >
              {isRunning ? '⏸ Stop' : '▶ Start'}
            </button>
            
            <button
              onClick={handleReset}
              style={{
                ...styles.button,
                backgroundColor: '#6b7280'
              }}
            >
              🔄 Reset
            </button>
          </div>
          
          {/* Timer */}
          <div style={styles.timer}>
            <span style={styles.timerLabel}>Time:</span>
            <span style={styles.timerValue}>
              {Math.floor(counter / 60)}:{(counter % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
        
        {/* Right Panel: Display Cards */}
        <div style={styles.cardsContainer}>
          <CustomEnergyCard
            title="Voltage"
            value={voltage}
            unit="V"
            color="#3b82f6"
          />
          
          <CustomEnergyCard
            title="Current"
            value={current}
            unit="A"
            color="#8b5cf6"
          />
          
          <CustomEnergyCard
            title="Power"
            value={calculatePower()}
            unit="W"
            color="#f59e0b"
          />
          
          <CustomEnergyCard
            title="Energy"
            value={calculateEnergy()}
            unit="Wh"
            color="#10b981"
          />
        </div>
      </div>
      
      {/* Real-time Data Section */}
      {isConnected && energyData && (
        <div style={styles.realtimeSection}>
          <h3 style={styles.sectionTitle}>Real-time Data from WebSocket</h3>
          <div style={styles.dataGrid}>
            {/* Voltage Phase 1 */}
            <div style={styles.dataItem}>
              <span style={styles.dataLabel}>V1:</span>
              <span style={styles.dataValue}>
                {energyData.voltage.f1.toFixed(2)} V
              </span>
            </div>
            
            {/* Voltage Phase 2 */}
            <div style={styles.dataItem}>
              <span style={styles.dataLabel}>V2:</span>
              <span style={styles.dataValue}>
                {energyData.voltage.f2.toFixed(2)} V
              </span>
            </div>
            
            {/* Voltage Phase 3 */}
            <div style={styles.dataItem}>
              <span style={styles.dataLabel}>V3:</span>
              <span style={styles.dataValue}>
                {energyData.voltage.f3.toFixed(2)} V
              </span>
            </div>
            
            {/* Current Phase 1 */}
            <div style={styles.dataItem}>
              <span style={styles.dataLabel}>I1:</span>
              <span style={styles.dataValue}>
                {energyData.current.i1.toFixed(2)} A
              </span>
            </div>
            
            {/* Current Phase 2 */}
            <div style={styles.dataItem}>
              <span style={styles.dataLabel}>I2:</span>
              <span style={styles.dataValue}>
                {energyData.current.i2.toFixed(2)} A
              </span>
            </div>
            
            {/* Current Phase 3 */}
            <div style={styles.dataItem}>
              <span style={styles.dataLabel}>I3:</span>
              <span style={styles.dataValue}>
                {energyData.current.i3.toFixed(2)} A
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerText}>
          Built with ❤️ using HTML, CSS, JavaScript, and React
        </p>
      </footer>
    </div>
  );
}

// ========================================
// CSS: Inline Styles (JavaScript Objects)
// ========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f1f5f9',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  
  header: {
    textAlign: 'center',
    marginBottom: '30px',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: '0 0 10px 0'
  },
  
  subtitle: {
    fontSize: '16px',
    color: '#64748b',
    margin: 0
  },
  
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderRadius: '8px',
    marginBottom: '20px',
    transition: 'background-color 0.3s ease'
  },
  
  statusText: {
    color: 'white',
    fontWeight: '600',
    fontSize: '14px'
  },
  
  content: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: '20px',
    marginBottom: '20px'
  },
  
  panel: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  
  panelTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 0,
    marginBottom: '20px'
  },
  
  controlGroup: {
    marginBottom: '24px'
  },
  
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#475569'
  },
  
  slider: {
    width: '100%',
    height: '8px',
    borderRadius: '4px',
    outline: 'none',
    cursor: 'pointer'
  },
  
  value: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#3b82f6'
  },
  
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px'
  },
  
  button: {
    flex: 1,
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  
  timer: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    textAlign: 'center'
  },
  
  timerLabel: {
    fontSize: '14px',
    color: '#64748b',
    marginRight: '8px'
  },
  
  timerValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#1e293b',
    fontFamily: 'monospace'
  },
  
  cardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px'
  },
  
  realtimeSection: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '20px'
  },
  
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 0,
    marginBottom: '16px'
  },
  
  dataGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px'
  },
  
  dataItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px'
  },
  
  dataLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748b'
  },
  
  dataValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#3b82f6'
  },
  
  footer: {
    textAlign: 'center',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  
  footerText: {
    margin: 0,
    fontSize: '14px',
    color: '#64748b'
  }
};

export default HTMLCSSJSExample;
