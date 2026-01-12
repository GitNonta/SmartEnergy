/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    screens: {
      'xs': '0px',      // < 576px (Default/Mobile)
      'sm': '576px',    // >= 576px (Tablet Vertical / Landscape Mobile)
      'md': '768px',    // >= 768px (Tablet)
      'lg': '992px',    // >= 992px (Laptop / Small Desktop)
      'xl': '1200px',   // >= 1200px (Wide Screen)
      'xxl': '1400px',  // >= 1400px (Ultra Wide)
    },
    extend: {
      colors: {
        primary: 'var(--primary)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(93, 186, 240, 0.4)' },
          '50%': { boxShadow: '0 0 30px rgba(93, 186, 240, 0.6)' },
        }
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}