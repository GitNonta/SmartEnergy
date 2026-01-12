/**
 * Smooth Chart Configuration
 * การตั้งค่าสำหรับทำให้กราฟนิ่งและ smooth
 */

export const SMOOTH_CHART_CONFIG = {
  /**
   * Sampling Configuration
   */
  sampling: {
    // Minimum interval ระหว่างการเพิ่มข้อมูลใหม่ (ms)
    minInterval: 1000, // 1 วินาที
    
    // จำนวนจุดข้อมูลสูงสุดที่เก็บไว้
    maxDataPoints: 300,
    
    // Retention time สำหรับข้อมูลในหน่วยชั่วโมง
    retentionHours: 1
  },

  /**
   * Smoothing Configuration
   */
  smoothing: {
    // Enable/Disable smoothing
    enabled: true,
    
    // EMA alpha (0-1, ยิ่งน้อยยิ่ง smooth)
    emaAlpha: 0.3,
    
    // Moving average window size
    movingAverageWindow: 3
  },

  /**
   * Y-Axis Stability Configuration
   */
  yAxis: {
    // Padding รอบ ๆ ข้อมูล (%)
    padding: 0.1, // 10%
    
    // Smooth factor สำหรับการเปลี่ยนแปลง range (0-1)
    // ค่ายิ่งน้อย แกนยิ่งนิ่ง แต่อาจจะไม่ตามทันข้อมูล
    smoothFactor: 0.15,
    
    // Update interval สำหรับ Y-axis range (ms)
    updateInterval: 500,
    
    // Enable auto-scaling
    autoScale: true
  },

  /**
   * Animation Configuration
   */
  animation: {
    // Enable animation
    enabled: true,
    
    // Animation duration (ms)
    duration: 300,
    
    // Animation easing
    easing: 'ease-in-out' as const,
    
    // Animation delay
    begin: 0
  },

  /**
   * Line Configuration
   */
  line: {
    // Line type
    type: 'monotoneX' as const,
    
    // Line width
    strokeWidth: 2.5,
    
    // Show dots
    showDots: false,
    
    // Active dot radius
    activeDotRadius: 4
  },

  /**
   * Performance Configuration
   */
  performance: {
    // Downsampling threshold
    downsampleThreshold: 500,
    
    // Interpolation enabled
    interpolationEnabled: false,
    
    // Debounce delay สำหรับการ update (ms)
    debounceDelay: 100,
    
    // Throttle limit สำหรับการ render (ms)
    throttleLimit: 200
  },

  /**
   * Time Window Configuration
   */
  timeWindow: {
    // Default window duration (ms)
    defaultDuration: 60000, // 60 seconds
    
    // Update interval (ms)
    updateInterval: 1000,
    
    // Show time labels
    showTimeLabels: true,
    
    // Time format
    timeFormat: 'time' as 'time' | 'datetime' | 'relative'
  }
};

/**
 * Preset Configurations
 */
export const CHART_PRESETS = {
  /**
   * Ultra Smooth - สำหรับกราฟที่ต้องการความนิ่งสูงสุด
   */
  ultraSmooth: {
    ...SMOOTH_CHART_CONFIG,
    sampling: {
      ...SMOOTH_CHART_CONFIG.sampling,
      minInterval: 2000 // 2 วินาที
    },
    smoothing: {
      ...SMOOTH_CHART_CONFIG.smoothing,
      emaAlpha: 0.2 // Smooth มากขึ้น
    },
    yAxis: {
      ...SMOOTH_CHART_CONFIG.yAxis,
      smoothFactor: 0.1, // นิ่งมากขึ้น
      updateInterval: 1000
    },
    animation: {
      ...SMOOTH_CHART_CONFIG.animation,
      duration: 500
    }
  },

  /**
   * Balanced - สมดุลระหว่างความนิ่งกับความตอบสนอง
   */
  balanced: {
    ...SMOOTH_CHART_CONFIG,
    sampling: {
      ...SMOOTH_CHART_CONFIG.sampling,
      minInterval: 1000 // 1 วินาที
    },
    smoothing: {
      ...SMOOTH_CHART_CONFIG.smoothing,
      emaAlpha: 0.3
    },
    yAxis: {
      ...SMOOTH_CHART_CONFIG.yAxis,
      smoothFactor: 0.15,
      updateInterval: 500
    },
    animation: {
      ...SMOOTH_CHART_CONFIG.animation,
      duration: 300
    }
  },

  /**
   * Responsive - ตอบสนองเร็ว แต่อาจจะกระตุกเล็กน้อย
   */
  responsive: {
    ...SMOOTH_CHART_CONFIG,
    sampling: {
      ...SMOOTH_CHART_CONFIG.sampling,
      minInterval: 500 // 0.5 วินาที
    },
    smoothing: {
      ...SMOOTH_CHART_CONFIG.smoothing,
      emaAlpha: 0.5 // Smooth น้อยลง
    },
    yAxis: {
      ...SMOOTH_CHART_CONFIG.yAxis,
      smoothFactor: 0.3, // ตามทันข้อมูลเร็วขึ้น
      updateInterval: 200
    },
    animation: {
      ...SMOOTH_CHART_CONFIG.animation,
      duration: 150
    }
  }
};

/**
 * Helper: Get configuration by preset name
 */
export const getChartConfig = (preset: keyof typeof CHART_PRESETS = 'balanced') => {
  return CHART_PRESETS[preset];
};

export default SMOOTH_CHART_CONFIG;
