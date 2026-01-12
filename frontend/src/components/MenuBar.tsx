import React, { useState, memo, useEffect } from 'react';
import {
  Home,
  BarChart,
  Settings,
  Bell,
  HelpCircle,
  Menu as MenuIcon,
  X,
  Database,
  ChevronDown,
  Settings2,
  AlertCircle,
  Zap,
  Server
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { useWebSocket } from '../context/WebSocketContext';

interface MenuItemProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  onClick?: () => void;
  active?: boolean;
  subItems?: Array<{
    id: string;
    label: string;
    onClick?: () => void;
  }>;
}

const MenuItem: React.FC<MenuItemProps> = memo(({
  icon,
  label,
  badge,
  onClick,
  active,
  subItems
}) => {
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);

  const handleClick = () => {
    if (subItems) {
      setIsSubMenuOpen(!isSubMenuOpen);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className={`
          flex items-center gap-3 w-full px-4 py-3 text-left
          hover:bg-gray-100 dark:hover:bg-gray-800
          transition-colors rounded-lg
          ${active ? 'bg-blue-50 text-blue-600 dark:bg-gray-800 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}
        `}
      >
        <span className="w-5 h-5">{icon}</span>
        <span className="flex-1">{label}</span>
        {badge && (
          <Badge variant={active ? "default" : "secondary"}>
            {badge}
          </Badge>
        )}
        {subItems && (
          <ChevronDown className={`w-4 h-4 transition-transform ${isSubMenuOpen ? 'transform rotate-180' : ''}`} />
        )}
      </button>

      {subItems && isSubMenuOpen && (
        <div className="pl-8 mt-1 space-y-1">
          {subItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className="w-full text-sm py-2 px-4 text-left hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-300"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

MenuItem.displayName = 'MenuItem';

const NotificationsDialog: React.FC = () => (
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Notifications</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 mt-4">
      <div className="flex items-start gap-4 p-4 bg-yellow-50 rounded-lg">
        <AlertCircle className="w-5 h-5 text-yellow-500 mt-1" />
        <div>
          <h4 className="font-medium text-sm">High Power Usage Alert</h4>
          <p className="text-sm text-gray-500">Meter M01 exceeded threshold (5000W)</p>
          <span className="text-xs text-gray-400 mt-1">2 minutes ago</span>
        </div>
      </div>
      <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
        <Settings className="w-5 h-5 text-blue-500 mt-1" />
        <div>
          <h4 className="font-medium text-sm">System Update</h4>
          <p className="text-sm text-gray-500">New features available</p>
          <span className="text-xs text-gray-400 mt-1">1 hour ago</span>
        </div>
      </div>
    </div>
  </DialogContent>
);

interface IconButtonProps {
  icon: React.ReactNode;
  badge?: number;
  onClick?: () => void;
}

const IconButton: React.FC<IconButtonProps> = ({ icon, badge, onClick }) => (
  <button
    onClick={onClick}
    className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
  >
    {icon}
    {badge !== undefined && badge > 0 && (
      <span className={`absolute -top-1 -right-1 flex items-center justify-center min-w-5 h-5 px-1 text-xs font-medium text-white rounded-full ${badge > 0 ? 'bg-red-600' : 'bg-blue-600'}`}>
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);

export const MenuBar: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('dashboard');
  const { alerts } = useWebSocket();

  // Count alerts for badge (critical and warning alerts)
  const alertCount = alerts?.filter((a: any) =>
    a.severity === 'critical' || a.severity === 'warning' || a.level === 'critical' || a.level === 'warning'
  ).length || 0;
  const hasCritical = alerts?.some((a: any) => a.severity === 'critical' || a.level === 'critical') || false;

  const menuItems: MenuItemProps[] = [
    {
      id: 'dashboard',
      icon: <Home className="w-full h-full" />,
      label: 'Dashboard',
      onClick: () => setActiveItem('dashboard')
    },
    {
      id: 'reports',
      icon: <BarChart className="w-full h-full" />,
      label: 'Reports',
      subItems: [
        { id: 'daily-report', label: 'Daily Report', onClick: () => console.log('Daily Report') },
        { id: 'weekly-report', label: 'Weekly Report', onClick: () => console.log('Weekly Report') },
        { id: 'monthly-report', label: 'Monthly Report', onClick: () => console.log('Monthly Report') },
      ]
    },
    {
      id: 'data-management',
      icon: <Database className="w-full h-full" />,
      label: 'Data Management',
      subItems: [
        { id: 'import-data', label: 'Import Data', onClick: () => console.log('Import') },
        { id: 'export-data', label: 'Export Data', onClick: () => console.log('Export') },
        { id: 'backup', label: 'Backup', onClick: () => console.log('Backup') },
      ]
    },
    {
      id: 'firmware',
      icon: <Server className="w-full h-full" />,
      label: 'Firmware Upload',
      onClick: () => window.location.href = '/firmware-sftp'
    },
    {
      id: 'system-settings',
      icon: <Settings2 className="w-full h-full" />,
      label: 'System Settings',
      subItems: [
        { id: 'meter-config', label: 'Meter Configuration', onClick: () => console.log('Meter Config') },
        { id: 'alert-settings', label: 'Alert Settings', onClick: () => console.log('Alerts') },
        { id: 'user-prefs', label: 'User Preferences', onClick: () => console.log('Preferences') },
      ]
    },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-md bg-gradient-to-br from-emerald-400 to-sky-500 text-white">
                  <Zap className="w-5 h-5" />
                </div>
                <span className="font-semibold text-xl text-gray-900 dark:text-white">
                  Energy Platform
                </span>
              </div>
            </div>
            <div className="hidden md:ml-6 md:flex md:space-x-2">
              {menuItems.map((item) => (
                <MenuItem
                  key={item.id}
                  {...item}
                  active={activeItem === item.label.toLowerCase()}
                />
              ))}
            </div>
          </div>

          {/* Right side icons */}
          <div className="hidden md:flex md:items-center md:space-x-4">
            <Dialog>
              <DialogTrigger>
                <IconButton
                  icon={<Bell className="h-5 w-5" />}
                  badge={alertCount}
                />
              </DialogTrigger>
              <NotificationsDialog />
            </Dialog>

            <IconButton
              icon={<HelpCircle className="h-5 w-5" />}
            />

            <IconButton
              icon={<Settings className="h-5 w-5" />}
            />
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <IconButton
              icon={isMobileMenuOpen ? <X className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {menuItems.map((item) => (
              <MenuItem
                key={item.id}
                {...item}
                active={activeItem === item.label.toLowerCase()}
              />
            ))}
          </div>
          <div className="pt-4 pb-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-around px-4">
              <Dialog>
                <DialogTrigger>
                  <IconButton
                    icon={<Bell className="h-5 w-5" />}
                    badge={alertCount}
                  />
                </DialogTrigger>
                <NotificationsDialog />
              </Dialog>

              <IconButton
                icon={<HelpCircle className="h-5 w-5" />}
              />

              <IconButton
                icon={<Settings className="h-5 w-5" />}
              />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};