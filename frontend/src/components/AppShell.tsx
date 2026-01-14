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
import { NotificationPopup } from './NotificationPopup';

// --- Types & Constants ---

// Fixed theme colors (Blue gradient)
export const THEME = {
  primary: 'from-blue-600 to-indigo-700',
  accent: 'bg-blue-600',
  accentHover: 'hover:bg-blue-700',
  accentLight: 'bg-blue-100 dark:bg-blue-900/20',
  text: 'text-blue-600 dark:text-blue-400',
  border: 'border-blue-200 dark:border-blue-700',
  ring: 'ring-blue-500',
};

// --- Contexts ---

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
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
  const theme = THEME;

  // Find active index based on current path
  const activeIndex = navItems.findIndex(item =>
    location.pathname === item.path || (item.path === '/dashboard' && location.pathname === '/')
  );
  const safeActiveIndex = activeIndex === -1 ? 0 : activeIndex;

  return (
    <div className="mobile-nav-container lg:hidden">
      {navItems.map((item, index) => {
        const isActive = index === safeActiveIndex;
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            to={item.path}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="nav-icon" />
            {isActive && (
              <span className="nav-label">
                <TranslatedLabel labelKey={item.labelKey} />
              </span>
            )}
          </Link>
        );
      })}

      {/* User Info / Profile (replaces Reports) */}
      <div className="mobile-nav-item">
        <UserMenuDropdown dropUp />
      </div>
    </div>
  );
};

// TimeSelectorBlock Component - Now integrated with TimeRangeContext
const TimeSelectorBlock: React.FC = () => {
  // Theme used directly
  const theme = THEME;
  const { mode, setMode, openCalendar, getDisplayLabel } = useTimeRange();
  const { t } = useLanguage();

  const options: { label: string; abbr: string; value: TimeRangeMode }[] = [
    { label: t('time.realtime'), abbr: 'RT', value: 'realtime' },
    { label: t('time.hour'), abbr: '1H', value: 'hour' },
    { label: t('time.day'), abbr: '24H', value: 'day' },
    { label: t('time.week'), abbr: '7D', value: 'week' },
    { label: t('time.month'), abbr: '30D', value: 'month' },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-700/50 rounded-full border border-gray-200 dark:border-gray-600">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => setMode(option.value)}
            className={`
              px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap
              ${mode === option.value
                ? `bg-white dark:bg-gray-600 shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${theme.accent.replace('bg-', 'text-')}`
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-600/50'}
            `}
          >
            <span className="hidden sm:inline">{option.label}</span>
            <span className="inline sm:hidden">{option.abbr}</span>
          </button>
        ))}
      </div>

      {/* Calendar Button */}
      <button
        onClick={openCalendar}
        className={`
          w-8 h-8 sm:w-auto sm:h-auto flex items-center justify-center sm:block p-0 sm:p-2.5 rounded-full border transition-all duration-200
          ${mode === 'custom'
            ? `${theme.accent} text-white border-transparent shadow-md`
            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'}
        `}
        title="Select custom date range"
      >
        <Calendar className="w-4 h-4" />
      </button>

      {/* Custom Range Label */}
      {mode === 'custom' && (
        <span className="text-[10px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full whitespace-nowrap">
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

  // Removed theme picker state
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

  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Removed themeColor state

  // Effects
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Removed themeColor effect

  // Close menus on route change
  // useEffect(() => {
  //   setShowThemePicker(false);
  // }, [location]);

  // Handlers
  const toggleDarkMode = () => setDarkMode((prev: boolean) => !prev);

  // Fixed theme used directly
  const currentTheme = THEME; // Keep variable name for minimal diff in return, or could replace below

  // Use translation keys - actual translation happens in NavItem components
  const navItems = [
    { id: 'dashboard', labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard },
    { id: 'status', labelKey: 'nav.status', path: '/status', icon: Activity },
    { id: 'devices', labelKey: 'nav.devices', path: '/devices', icon: Plug },
  ];

  return (
    <LanguageProvider defaultLanguage="en">
      <TimeRangeProvider defaultMode="realtime">
        <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
          <div
            className="min-h-screen transition-colors duration-200 font-sans pb-24 lg:pb-0 bg-slate-50 dark:bg-slate-900"
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

                    {/* Theme Picker Removed */}

                    <button
                      onClick={toggleDarkMode}
                      className="p-2 rounded-full hover:bg-white/10 transition-colors group"
                    >
                      {darkMode ? <Sun className="w-5 h-5 text-yellow-300" /> : <Moon className="w-5 h-5 text-white/90" />}
                    </button>

                    <div className="hidden sm:block h-6 w-px bg-white/20 mx-1"></div>

                    {/* Notification Bell */}
                    <div className="relative">
                      <button
                        onClick={() => setIsNotifOpen(!isNotifOpen)}
                        className={`p-2 rounded-full hover:bg-white/10 transition-colors relative ${isNotifOpen ? 'bg-white/20' : ''}`}
                      >
                        <Bell className="w-5 h-5 text-white/90" />
                        {alertCount > 0 ? (
                          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full border-2 border-white/20">
                            {alertCount > 9 ? '9+' : alertCount}
                          </span>
                        ) : (
                          <span className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full border-2 border-white/10"></span>
                        )}
                      </button>

                      <NotificationPopup
                        isOpen={isNotifOpen}
                        onClose={() => setIsNotifOpen(false)}
                        alerts={alerts || []}
                      />
                    </div>

                    <UserMenuDropdown className="hidden lg:block" />
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
