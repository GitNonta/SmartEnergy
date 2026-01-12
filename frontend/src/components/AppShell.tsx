import React, { useState, useEffect, createContext, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bell,
  Plug,
  BarChart as BarIcon,
  Sun,
  Moon,
  LayoutDashboard,
  Activity,
  Palette,
  Check,
  Calendar
} from 'lucide-react';
import { useWebSocket } from '../context/WebSocketContext';
import { TimeRangeProvider, useTimeRange, TimeRangeMode } from '../context/TimeRangeContext';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import { ChatProvider } from '../context/ChatContext';
import DateRangePicker from './DateRangePicker';
import LanguageSelector from './LanguageSelector';
import ChatWidget from './ChatWidget';
import UserMenuDropdown from './UserMenuDropdown';

// --- Types & Constants ---

type ThemeColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose';

interface ThemeConfig {
  name: string;
  primary: string;      // Gradient for headers
  accent: string;       // bg-{color}-600
  accentHover: string;  // hover:bg-{color}-700
  accentLight: string;  // bg-{color}-100 / dark:bg-{color}-900/20
  text: string;         // text-{color}-600 / dark:text-{color}-400
  border: string;       // border-{color}-200 / dark:border-{color}-700
  ring: string;
  bg: string;           // Solid color for the curve effect
  darkBg: string;       // Solid color for dark mode curve
}

const THEMES: Record<ThemeColor, ThemeConfig> = {
  blue: {
    name: 'Ocean Blue',
    primary: 'from-blue-600 to-indigo-700',
    accent: 'bg-blue-600',
    accentHover: 'hover:bg-blue-700',
    accentLight: 'bg-blue-100 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-700',
    ring: 'ring-blue-500',
    bg: '#eff6ff', // blue-50
    darkBg: '#1e3a8a' // blue-900
  },
  emerald: {
    name: 'Forest Emerald',
    primary: 'from-emerald-600 to-teal-700',
    accent: 'bg-emerald-600',
    accentHover: 'hover:bg-emerald-700',
    accentLight: 'bg-emerald-100 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-700',
    ring: 'ring-emerald-500',
    bg: '#ecfdf5', // emerald-50
    darkBg: '#064e3b' // emerald-900
  },
  violet: {
    name: 'Royal Violet',
    primary: 'from-violet-600 to-purple-700',
    accent: 'bg-violet-600',
    accentHover: 'hover:bg-violet-700',
    accentLight: 'bg-violet-100 dark:bg-violet-900/20',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-700',
    ring: 'ring-violet-500',
    bg: '#f5f3ff', // violet-50
    darkBg: '#4c1d95' // violet-900
  },
  amber: {
    name: 'Sunset Amber',
    primary: 'from-amber-500 to-orange-600',
    accent: 'bg-amber-500',
    accentHover: 'hover:bg-amber-600',
    accentLight: 'bg-amber-100 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-700',
    ring: 'ring-amber-500',
    bg: '#fffbeb', // amber-50
    darkBg: '#78350f' // amber-900
  },
  rose: {
    name: 'Crimson Rose',
    primary: 'from-rose-500 to-pink-600',
    accent: 'bg-rose-500',
    accentHover: 'hover:bg-rose-600',
    accentLight: 'bg-rose-100 dark:bg-rose-900/20',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-700',
    ring: 'ring-rose-500',
    bg: '#fff1f2', // rose-50
    darkBg: '#881337' // rose-900
  }
};

// --- Contexts ---

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  currentTheme: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within AppShell');
  }
  return context;
};

// Alias for backward compatibility
export const useDarkMode = () => {
  const { darkMode, toggleDarkMode } = useTheme();
  return { darkMode, toggleDarkMode };
};

// --- Components ---

// Helper component to translate nav labels inside LanguageProvider
const TranslatedLabel: React.FC<{ labelKey: string }> = ({ labelKey }) => {
  const { t } = useLanguage();
  return <>{t(labelKey)}</>;
};

// Mobile Bottom Navigation Component
const MobileBottomNav = ({ navItems }: { navItems: { id: string; labelKey: string; path: string; icon: any }[] }) => {
  const location = useLocation();
  const { currentTheme } = useTheme();

  // Find active index based on current path
  const activeIndex = navItems.findIndex(item =>
    location.pathname === item.path || (item.path === '/dashboard' && location.pathname === '/')
  );
  // Default to 0 if not found
  const safeActiveIndex = activeIndex === -1 ? 0 : activeIndex;

  return (
    <div className="fixed bottom-0 left-0 w-full h-[70px] bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 lg:hidden z-50 rounded-t-2xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
      <div className="relative flex w-full h-full">
        {navItems.map((item, index) => {
          const isActive = index === safeActiveIndex;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              to={item.path}
              className="relative z-20 flex-1 flex flex-col items-center justify-center group"
            >
              <span
                className={`
                  absolute transition-all duration-500 ease-in-out
                  ${isActive ? '-top-6' : 'top-5'}
                `}
              >
                <span className={`
                  flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300
                  ${isActive ? 'text-white' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'}
                `}>
                  <Icon className={`w-6 h-6 ${isActive ? 'animate-bounce-small' : ''}`} />
                </span>
              </span>

              <span className={`
                absolute bottom-4 text-[10px] font-medium transition-all duration-300
                ${isActive ? 'opacity-100 translate-y-0 text-gray-800 dark:text-white' : 'opacity-0 translate-y-4'}
              `}>
                <TranslatedLabel labelKey={item.labelKey} />
              </span>
            </Link>
          );
        })}

        {/* Sliding Indicator (The "Gooey" Background) */}
        {/* We use calculated left position based on percentage width of number of items */}
        <div
          className="absolute -top-6 h-16 w-16 bg-transparent z-10 transition-all duration-500 ease-in-out"
          style={{
            left: `calc((100% / ${navItems.length}) * ${safeActiveIndex} + (100% / ${navItems.length} / 2) - 32px)`
          }}
        >
          {/* The Circle */}
          <div className={`w-16 h-16 rounded-full border-[6px] border-gray-50 dark:border-gray-900 ${currentTheme.accent} flex items-center justify-center shadow-lg`}>
            {/* Icon placeholder is handled by the Link above */}
          </div>

          {/* Left Curve Pseudo-element simulation */}
          <div className="absolute top-[26px] -left-[21px] w-6 h-6 bg-transparent rounded-tr-[24px] shadow-[4px_-4px_0_0_#f9fafb] dark:shadow-[4px_-4px_0_0_#111827]"></div>

          {/* Right Curve Pseudo-element simulation */}
          <div className="absolute top-[26px] -right-[21px] w-6 h-6 bg-transparent rounded-tl-[24px] shadow-[-4px_-4px_0_0_#f9fafb] dark:shadow-[-4px_-4px_0_0_#111827]"></div>
        </div>
      </div>
    </div>
  );
};

// TimeSelectorBlock Component - Now integrated with TimeRangeContext
const TimeSelectorBlock: React.FC = () => {
  const { currentTheme } = useTheme();
  const { mode, setMode, openCalendar, getDisplayLabel } = useTimeRange();
  const { t } = useLanguage();

  const options: { label: string; value: TimeRangeMode }[] = [
    { label: t('time.realtime'), value: 'realtime' },
    { label: t('time.hour'), value: 'hour' },
    { label: t('time.day'), value: 'day' },
    { label: t('time.week'), value: 'week' },
    { label: t('time.month'), value: 'month' },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-700/50 rounded-full border border-gray-200 dark:border-gray-600">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => setMode(option.value)}
            className={`
              px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap
              ${mode === option.value
                ? `bg-white dark:bg-gray-600 shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${currentTheme.accent.replace('bg-', 'text-')}`
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-600/50'}
            `}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Calendar Button */}
      <button
        onClick={openCalendar}
        className={`
          p-2.5 rounded-full border transition-all duration-200
          ${mode === 'custom'
            ? `${currentTheme.accent} text-white border-transparent shadow-md`
            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'}
        `}
        title="Select custom date range"
      >
        <Calendar className="w-4 h-4" />
      </button>

      {/* Custom Range Label */}
      {mode === 'custom' && (
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
          {getDisplayLabel()}
        </span>
      )}

      <div className="relative">
        <DateRangePicker />
      </div>
    </div>
  );
};

// --- Main AppShell Layout ---

interface AppShellProps {
  children?: React.ReactNode;
}

const AppShellLayout: React.FC<AppShellProps> = ({ children }) => {
  const location = useLocation();
  const currentPage = location.pathname.split('/')[1] || 'dashboard';

  const [showThemePicker, setShowThemePicker] = useState(false);
  // Removed: timeRange state now managed by TimeRangeContext

  // Get real-time alerts from WebSocket
  const { alerts } = useWebSocket();
  const alertCount = alerts?.filter((a: any) =>
    a.severity === 'critical' || a.severity === 'warning' || a.level === 'critical' || a.level === 'warning'
  ).length || 0;

  // State Initialization
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [themeColor, setThemeColorState] = useState<ThemeColor>(() => {
    return (localStorage.getItem('themeColor') as ThemeColor) || 'emerald'; // Default to emerald to match system
  });

  // Effects
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('themeColor', themeColor);
  }, [themeColor]);

  // Close menus on route change
  useEffect(() => {
    setShowThemePicker(false);
  }, [location]);

  // Handlers
  const toggleDarkMode = () => setDarkMode((prev: boolean) => !prev);
  const setThemeColor = (color: ThemeColor) => setThemeColorState(color);

  const currentTheme = THEMES[themeColor];

  // Use translation keys - actual translation happens in NavItem components
  const navItems = [
    { id: 'dashboard', labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard },
    { id: 'status', labelKey: 'nav.status', path: '/status', icon: Activity },
    { id: 'devices', labelKey: 'nav.devices', path: '/devices', icon: Plug },
    { id: 'reports', labelKey: 'nav.alerts', path: '/reports', icon: BarIcon },
  ];

  return (
    <LanguageProvider defaultLanguage="en">
      <TimeRangeProvider defaultMode="realtime">
        <ThemeContext.Provider value={{ darkMode, toggleDarkMode, themeColor, setThemeColor, currentTheme }}>
          <div
            className="min-h-screen transition-colors duration-200 font-sans pb-24 lg:pb-0"
            style={{ backgroundColor: darkMode ? currentTheme.darkBg : currentTheme.bg }}
          >

            {/* Navigation Bar - Responsive Top for Desktop */}
            <header className={`sticky top-0 z-40 w-full bg-gradient-to-r ${currentTheme.primary} shadow-lg text-white transition-all duration-500`}>
              <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">

                  {/* Brand Logo */}
                  <Link to="/" className="flex-shrink-0 flex items-center gap-2 group">
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform duration-200">
                      <Plug className="w-5 h-5 text-yellow-300" />
                    </div>
                    <div className="font-bold text-xl tracking-wider">
                      ENERGY<span className="text-white/80 font-normal">SYSTEM</span>
                    </div>
                  </Link>

                  {/* Desktop Menu - Hidden on Mobile */}
                  <nav className="hidden lg:flex items-center gap-1 mx-6">
                    {navItems.map((item) => {
                      const isActive = currentPage === item.id || (item.id === 'dashboard' && location.pathname === '/');
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.id}
                          to={item.path}
                          className={`
                        flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                        ${isActive
                              ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/20 backdrop-blur-sm'
                              : 'text-white/80 hover:bg-white/10 hover:text-white'}
                      `}
                        >
                          <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-white' : 'text-white/70'}`} />
                          <TranslatedLabel labelKey={item.labelKey} />
                        </Link>
                      );
                    })}
                  </nav>

                  {/* Right Side: Actions */}
                  <div className="flex items-center gap-2">
                    {/* Language Selector */}
                    <LanguageSelector />

                    {/* Theme Picker */}
                    <div className="relative">
                      <button
                        onClick={() => setShowThemePicker(!showThemePicker)}
                        className={`p-2 rounded-full hover:bg-white/10 transition-colors ${showThemePicker ? 'bg-white/20' : ''}`}
                      >
                        <Palette className="w-5 h-5 text-white/90" />
                      </button>
                      {showThemePicker && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowThemePicker(false)} />
                          <div className="absolute right-0 mt-3 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-black/5 z-20 overflow-hidden">
                            <div className="p-2 space-y-1">
                              {(Object.keys(THEMES) as ThemeColor[]).map((t) => (
                                <button
                                  key={t}
                                  onClick={() => setThemeColor(t)}
                                  className={`
                                w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors
                                ${themeColor === t
                                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}
                              `}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${THEMES[t].primary}`} />
                                    <span className="capitalize">{t}</span>
                                  </div>
                                  {themeColor === t && <Check className="w-4 h-4 text-gray-500" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={toggleDarkMode}
                      className="p-2 rounded-full hover:bg-white/10 transition-colors group"
                    >
                      {darkMode ? <Sun className="w-5 h-5 text-yellow-300" /> : <Moon className="w-5 h-5 text-white/90" />}
                    </button>

                    <div className="hidden sm:block h-6 w-px bg-white/20 mx-1"></div>

                    <Link to="/alerts" className="p-2 rounded-full hover:bg-white/10 transition-colors relative">
                      <Bell className="w-5 h-5 text-white/90" />
                      {alertCount > 0 ? (
                        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full border-2 border-white/20">
                          {alertCount > 9 ? '9+' : alertCount}
                        </span>
                      ) : (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full border-2 border-white/10"></span>
                      )}
                    </Link>

                    <UserMenuDropdown />
                  </div>
                </div>
              </div>
            </header>

            {/* Sub-header: Time Selector (Dashboard Only) */}
            {(currentPage === 'dashboard' || location.pathname === '/') && (
              <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <TimeSelectorBlock />
              </div>
            )}

            {/* Content Layout */}
            <div className="w-full mx-auto flex items-start pt-6 px-4 sm:px-6 lg:px-8">
              <main className="flex-1 w-full min-w-0">
                {children}
              </main>
            </div>

            {/* Mobile Bottom Navigation (Visible only on lg:hidden) */}
            <MobileBottomNav navItems={navItems} />

            {/* AI Chat Widget */}
            <ChatProvider>
              <ChatWidget />
            </ChatProvider>

          </div>
        </ThemeContext.Provider>
      </TimeRangeProvider>
    </LanguageProvider>
  );
};

export default AppShellLayout;
