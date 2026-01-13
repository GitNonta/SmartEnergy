import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore - react-grid-layout has type issues
import RGL from 'react-grid-layout';
// @ts-ignore
import WidthProvider from 'react-grid-layout/build/ReactGridLayoutBuilder';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Use RGL directly with types ignored for simplicity
const GridLayout: any = RGL;

import FrequencyBlock from '../../components/FrequencyBlock';
import CurrentBlock from '../../components/CurrentBlock';
import PowerFactorBlock from '../../components/PowerFactorBlock';
import EnergyAccumulatedBlock from '../../components/EnergyAccumulatedBlock';
import ActivePowerBlock from '../../components/ActivePowerBlock';
import { InfluxProvider } from '../../context/InfluxContext';
import InfluxErrorNotification from '../../components/InfluxErrorNotification';
import { useWebSocket } from '../../context/WebSocketContext';
import { useLanguage } from '../../context/LanguageContext';
import EnergyCostBlock from '../../components/EnergyCostBlock';
import TimeRangeSummaryPanel from '../../components/TimeRangeSummaryPanel';
import StatisticsBlock from '../../components/StatisticsBlock';
import { DashboardLayoutProvider, useDashboardLayout } from '../../context/DashboardLayoutContext';
import EditModeToggle from '../../components/EditModeToggle';
import DeviceSelector from '../../components/DeviceSelector';
import { LayoutItem, widgetConfig } from '../../config/defaultDashboardLayout';
import './DashboardPage.css';

// Widget component map
const widgetComponents: Record<string, { component: React.FC; title: string }> = {
  'energy-cost': { component: EnergyCostBlock, title: 'Energy Cost' },
  'active-power': { component: ActivePowerBlock, title: 'Active Power' },
  'energy-accumulated': { component: EnergyAccumulatedBlock, title: 'Energy Accumulated' },
  'frequency': { component: FrequencyBlock, title: 'Voltage' },
  'current': { component: CurrentBlock, title: 'Current' },
  'power-factor': { component: PowerFactorBlock, title: 'Power Factor' },
  'statistics': { component: StatisticsBlock, title: 'Statistics' },
};

// Grid configuration - Auto-expanding, no limits
const GRID_COLS = 24; // More columns for finer horizontal positioning
const ROW_HEIGHT = 60; // Smaller rows for finer vertical positioning
const MARGIN: [number, number] = [8, 8]; // Smaller margins

// Inner component that uses the layout context
const DashboardContent: React.FC = () => {
  const { isConnected, lastUpdate } = useWebSocket();
  const { t } = useLanguage();
  const { layouts, isEditMode, isAdmin, isLoading, updateLayouts } = useDashboardLayout();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [selectedDevice, setSelectedDevice] = useState('AI205');

  // Real-time clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Track container width
  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector('.dashboard-grid-container');
      if (container) {
        setContainerWidth(container.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Get current layout (use lg for all breakpoints for simplicity)
  const currentLayout = layouts.lg || [];

  // Get hidden widgets (not in current layout)
  const hiddenWidgets = Object.keys(widgetComponents).filter(
    widgetId => !currentLayout.some(item => item.i === widgetId)
  );

  // Check if user can edit (must be admin AND in edit mode)
  const canEdit = isEditMode && isAdmin;

  // Convert our layout format to react-grid-layout format
  // Add static:true when user cannot edit to completely disable interaction
  // No min/max constraints for unlimited resizing freedom
  const gridLayout = currentLayout.map(item => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    // Minimum size 1x1 to prevent disappearing, no maximum limits
    minW: 1,
    minH: 1,
    static: !canEdit, // Static = true means widget cannot be moved/resized
  }));

  // Handle layout change from react-grid-layout
  const handleLayoutChange = useCallback((newLayout: any[]) => {
    // Convert back to our format and update all breakpoints
    const layoutItems: LayoutItem[] = newLayout.map(item => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH,
    }));

    updateLayouts({
      xxl: layoutItems,
      xl: layoutItems,
      lg: layoutItems,
      md: layoutItems,
      sm: layoutItems,
      xs: layoutItems,
    });
  }, [updateLayouts]);

  // Handle add widget
  const handleAddWidget = useCallback((widgetId: string) => {
    if (!isEditMode || !isAdmin) return;

    const config = widgetConfig[widgetId] || { minW: 1, minH: 1 };
    const maxY = currentLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

    const newWidget: LayoutItem = {
      i: widgetId,
      x: 0,
      y: maxY,
      w: config.minW || 2,
      h: config.minH || 2,
      minW: config.minW,
      minH: config.minH,
    };

    const newLayout = [...currentLayout, newWidget];
    updateLayouts({
      xxl: newLayout,
      xl: newLayout,
      lg: newLayout,
      md: newLayout,
      sm: newLayout,
      xs: newLayout,
    });
    setShowAddPanel(false);
  }, [isEditMode, isAdmin, currentLayout, updateLayouts]);

  // Handle delete widget
  const handleDeleteWidget = useCallback((widgetId: string) => {
    if (!isEditMode || !isAdmin) return;
    if (!window.confirm(`Remove "${widgetComponents[widgetId]?.title}" from dashboard?`)) return;

    const newLayout = currentLayout.filter(item => item.i !== widgetId);
    updateLayouts({
      xxl: newLayout,
      xl: newLayout,
      lg: newLayout,
      md: newLayout,
      sm: newLayout,
      xs: newLayout,
    });
  }, [isEditMode, isAdmin, currentLayout, updateLayouts]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-slate-400">
        <div className="w-12 h-12 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className={`p-4 sm:p-6 min-h-screen text-slate-900 dark:text-slate-50 font-sans relative flex flex-col overflow-x-hidden ${isEditMode ? 'editing' : ''}`}>

      {/* Dashboard Header */}
      <header className="relative flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-slate-200 dark:border-white/10 gap-4">
        <div className="flex-1 w-full md:w-auto">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-wide m-0 flex items-center gap-2 text-slate-800 dark:bg-gradient-to-r dark:from-white dark:to-slate-400 dark:bg-clip-text dark:text-transparent">
            <span className="text-xl sm:text-2xl filter drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">⚡</span>
            <span className="hidden sm:inline">{t('dashboard.title').toUpperCase()}</span>
            <span className="sm:hidden">MDB</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm md:text-base mt-1 font-medium">{t('dashboard.subtitle')}</p>
        </div>

        <div className="w-full md:w-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Device Selector */}
          <DeviceSelector
            selectedDevice={selectedDevice}
            onDeviceChange={setSelectedDevice}
          />
          <div className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/5">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <div className="flex flex-col leading-tight">
              <span className="text-[0.65rem] text-slate-500 dark:text-slate-400 font-bold tracking-wider">{t('dashboard.systemStatus').toUpperCase()}</span>
              <span className={`text-xs font-bold tracking-wide ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                {isConnected ? t('dashboard.operational').toUpperCase() : t('dashboard.disconnected').toUpperCase()}
              </span>
            </div>
          </div>
          <div className="text-left sm:text-right border-l-0 sm:border-l border-slate-200 dark:border-white/10 pl-0 sm:pl-6">
            <span className="block text-xl font-bold font-mono text-slate-900 dark:text-white leading-none">{currentTime.toLocaleTimeString('th-TH', { hour12: false })}</span>
            <span className="block text-xs text-slate-500 mt-0.5">{currentTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
          </div>
        </div>
      </header>

      {/* Error Notification Layer */}
      <div className="z-50 pointer-events-none sticky top-4">
        <InfluxErrorNotification />
      </div>

      {/* Time Range Summary Panel */}
      <TimeRangeSummaryPanel />

      {/* Edit Mode Indicator */}
      {isEditMode && (
        <div className="mb-4 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-300 text-sm flex items-center gap-2">
          <span className="text-lg">✏️</span>
          <span>Edit Mode: ลาก widget ไปวางที่ใดก็ได้บนบอร์ด | Resize ที่มุมขวาล่าง</span>
        </div>
      )}

      {/* Main Grid Layout - Free Positioning with auto-expand */}
      <main className="dashboard-grid-container relative flex-1 w-full">
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={GRID_COLS}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          margin={MARGIN}
          isDraggable={canEdit}
          isResizable={canEdit}
          compactType={null}
          preventCollision={false}
          allowOverlap={true}
          autoSize={true}
          isBounded={false}
          onLayoutChange={canEdit ? (handleLayoutChange as any) : undefined}
          draggableHandle=".widget-drag-handle"
          resizeHandles={['se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's']}
        >
          {gridLayout.map(item => {
            const widgetInfo = widgetComponents[item.i];
            if (!widgetInfo) return null;
            const Component = widgetInfo.component;

            return (
              <div
                key={item.i}
                className={`widget-wrapper group flex flex-col h-full relative rounded-xl overflow-hidden transition-all duration-150 bg-white/5 dark:bg-slate-800/50 ${canEdit ? 'border border-dashed border-violet-400/50 hover:border-violet-400 cursor-move' : 'border border-transparent cursor-default'}`}
              >
                {/* Edit Mode Controls - Only for admin */}
                {canEdit && (
                  <>
                    {/* Drag Handle */}
                    <div className="widget-drag-handle absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-violet-500/40 to-transparent flex items-center justify-center cursor-grab active:cursor-grabbing z-10">
                      <span className="text-white/80 text-xs tracking-[2px]">⋮⋮ {widgetInfo.title}</span>
                      <span className="ml-2 text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-mono text-white/70">{item.w}×{item.h}</span>
                    </div>

                    {/* Delete Button */}
                    <button
                      className="absolute top-1 right-1 w-6 h-6 rounded-md border-0 cursor-pointer flex items-center justify-center text-xs bg-red-500/60 text-white hover:bg-red-500 z-20"
                      onClick={() => handleDeleteWidget(item.i)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </>
                )}

                {/* Widget Content */}
                <div className="flex-1 h-full overflow-hidden widget-content">
                  <Component />
                </div>
              </div>
            );
          })}
        </GridLayout>
      </main>

      {/* Add Widget Panel (Edit Mode Only) */}
      {isEditMode && isAdmin && hiddenWidgets.length > 0 && (
        <div className="mt-6 p-4 bg-violet-500/10 rounded-xl border border-dashed border-violet-500/30">
          <button
            className="bg-gradient-to-br from-blue-500 to-violet-500 text-white border-0 px-5 py-2.5 rounded-lg font-bold cursor-pointer transition-all hover:scale-105"
            onClick={() => setShowAddPanel(!showAddPanel)}
          >
            {showAddPanel ? '✕ Close' : '➕ Add Widget'}
          </button>

          {showAddPanel && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <h3 className="text-slate-200 text-sm font-bold mb-3 uppercase tracking-wider">Available Widgets</h3>
              <div className="flex flex-wrap gap-2">
                {hiddenWidgets.map(widgetId => (
                  <button
                    key={widgetId}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-100 cursor-pointer transition-all hover:bg-blue-500/20 hover:border-blue-500/50"
                    onClick={() => handleAddWidget(widgetId)}
                  >
                    <span className="text-sm">{widgetComponents[widgetId]?.title}</span>
                    <span className="text-emerald-400 font-bold">+</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Mode Toggle */}
      <EditModeToggle />

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t border-slate-200 dark:border-white/5 flex justify-end text-slate-400 dark:text-white/30 text-xs">
        <div>v3.0.0 (Free Position)</div>
      </footer>
    </div>
  );
};

// Main component
const DashboardPage: React.FC = () => {
  return (
    <DashboardLayoutProvider>
      <InfluxProvider autoFetch={true} defaultRange="Real-time">
        <DashboardContent />
      </InfluxProvider>
    </DashboardLayoutProvider>
  );
};

export default DashboardPage;