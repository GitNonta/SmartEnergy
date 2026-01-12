import React from 'react';

interface TimeSelectorBlockProps {
  value: 'realtime' | 'hour' | 'day' | 'week' | 'month';
  onChange: (value: 'realtime' | 'hour' | 'day' | 'week' | 'month') => void;
}

export const TimeSelectorBlock: React.FC<TimeSelectorBlockProps> = ({ value, onChange }) => {
  const options = [
    { value: 'realtime', label: 'Real-time' },
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ];

  return (
    <div className="time-selector-block">
      {options.map(option => (
        <button
          key={option.value}
          className={`time-option ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value as typeof value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
