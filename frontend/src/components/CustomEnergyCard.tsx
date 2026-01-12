import React, { useState, useEffect } from 'react';
//import './CustomEnergyCard.css';

interface CustomEnergyCardProps {
  title: string;
  value: number;
  unit: string;
  color?: string;
}

/**
 * ตัวอย่าง Component ที่ใช้ HTML, CSS, JavaScript ผสมกับ React
 */
function CustomEnergyCard({ title, value, unit, color = '#3b82f6' }: CustomEnergyCardProps) {
  // JavaScript: State management
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [animatedValue, setAnimatedValue] = useState(0);
  
  // JavaScript: useEffect hook
  useEffect(() => {
    // Animate value from 0 to target value
    let current = 0;
    const increment = value / 50;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        current = value;
        clearInterval(timer);
      }
      setAnimatedValue(current);
    }, 20);
    
    return () => clearInterval(timer);
  }, [value]);
  
  // JavaScript: Event handlers
  const handleMouseEnter = () => {
    setIsHighlighted(true);
  };
  
  const handleMouseLeave = () => {
    setIsHighlighted(false);
  };
  
  const handleClick = () => {
    alert(`${title}: ${value} ${unit}`);
  };
  
  // JavaScript: Conditional styling
  const cardStyle = {
    borderColor: color,
    transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
    boxShadow: isHighlighted ? '0 8px 16px rgba(0,0,0,0.2)' : '0 4px 8px rgba(0,0,0,0.1)'
  };
  
  const valueStyle = {
    color: color
  };
  
  // HTML (JSX): Component structure
  return (
    <div 
      className="custom-energy-card"
      style={cardStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Title section */}
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        {isHighlighted && <span className="highlight-badge">Active</span>}
      </div>
      
      {/* Value section */}
      <div className="card-body">
        <div className="value-container">
          <span className="value" style={valueStyle}>
            {animatedValue.toFixed(2)}
          </span>
          <span className="unit">{unit}</span>
        </div>
        
        {/* Progress bar */}
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ 
              width: `${Math.min((value / 300) * 100, 100)}%`,
              backgroundColor: color
            }}
          />
        </div>
      </div>
      
      {/* Footer section */}
      <div className="card-footer">
        <small className="timestamp">
          {new Date().toLocaleTimeString('th-TH')}
        </small>
      </div>
    </div>
  );
}

export default CustomEnergyCard;
