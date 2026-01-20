import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore - react-grid-layout has type issues
import RGL from 'react-grid-layout';
// @ts-ignore
import WidthProvider from 'react-grid-layout/build/ReactGridLayoutBuilder';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Use RGL directly with types ignored for simplicity
const GridLayout: any = RGL;

import VoltageBlock from '../../components/VoltageBlock';
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
import { LayoutItem, widgetConfig, defaultLayouts } from '../../config/defaultDashboardLayout';

// Widget component map
const widgetComponents: Record<string, { component: React.FC; title: string }> = {
  'energy-cost': { component: EnergyCostBlock, title: 'Energy Cost' },
  'active-power': { component: ActivePowerBlock, title: 'Active Power' },
  'energy-accumulated': { component: EnergyAccumulatedBlock, title: 'Energy Accumulated' },
  'voltage': { component: VoltageBlock, title: 'Voltage' },
  'current': { component: CurrentBlock, title: 'Current' },
  'power-factor': { component: PowerFactorBlock, title: 'Power Factor' },
  'statistics': { component: StatisticsBlock, title: 'Statistics' },
};

// Grid configuration - Responsive
const BREAKPOINTS = {
  xxl: 1400,
  xl: 1200,
  lg: 992,
  md: 768,
  sm: 576,
  xs: 0
};

const COLS_BY_BREAKPOINT = {
  xxl: 12,
  xl: 12,
  lg: 12,
  md: 6,
  sm: 4,
  xs: 2
};

const ROW_HEIGHT = 80; // Consistent row height
const MARGIN: [number, number] = [12, 12]; // Margins

// Inner component that uses the layout context
const DashboardContent: React.FC = () => {
  const { isConnected, lastUpdate } = useWebSocket();
  const { t } = useLanguage();
  const { layouts, isEditMode, setIsEditMode, isAdmin, isLoading, updateLayouts, resetLayoutToDefault } = useDashboardLayout();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [selectedDevice, setSelectedDevice] = useState('AI205');

  // Dashboard Mode State: 'default' or 'custom'
  // Persist in localStorage
  const [dashboardMode, setDashboardMode] = useState<'default' | 'custom'>(() => {
    return (localStorage.getItem('dashboardMode') as 'default' | 'custom') || 'custom';
  });

  // Persist mode choice
  useEffect(() => {
    localStorage.setItem('dashboardMode', dashboardMode);
  }, [dashboardMode]);

  // Real-time clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Track container width using ResizeObserver for accuracy
  useEffect(() => {
    const container = document.querySelector('.dashboard-grid-container');
    if (!container) return;

    // Initial width
    setContainerWidth(container.clientWidth);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use contentRect for precise content box width or clientWidth from target
        // RGL uses width prop to calculate column widths.
        // We use clientWidth to exclude scrollbars if any, though contentRect is often safer for standard boxes.
        // Let's stick to clientWidth as RGL usually expects the full available width.
        setContainerWidth(entry.target.clientWidth);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Determine current breakpoint based on container width
  const getCurrentBreakpoint = (width: number): keyof typeof BREAKPOINTS => {
    if (width >= BREAKPOINTS.xxl) return 'xxl';
    if (width >= BREAKPOINTS.xl) return 'xl';
    if (width >= BREAKPOINTS.lg) return 'lg';
    if (width >= BREAKPOINTS.md) return 'md';
    if (width >= BREAKPOINTS.sm) return 'sm';
    return 'xs';
  };

  const currentBreakpoint = getCurrentBreakpoint(containerWidth);
  const currentCols = COLS_BY_BREAKPOINT[currentBreakpoint];

  // Desktop (lg+) allows free positioning (no vertical compaction)
  // ONLY in Custom Mode. In Default Mode, we stick to the predefined layout structure (often compacted).
  // Actually, default layouts are also designed for free positioning now on desktop?
  // Let's keep logic simple: Desktop = Free, Mobile = Vertical.
  const compactType = (['lg', 'xl', 'xxl'].includes(currentBreakpoint)) ? null : 'vertical';

  // Select Layout Source
  const sourceLayouts = dashboardMode === 'default' ? defaultLayouts : layouts;

  // Get current layout based on breakpoint from the selected source
  const currentLayout = sourceLayouts[currentBreakpoint] || sourceLayouts.lg || [];

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
    // Convert back to our format
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

    // Logic: If on Desktop (Free Positioning), sync across desktop breakpoints.
    // If on Mobile/Tablet (Vertical Compact), sync across mobile/tablet.
    const isDesktop = ['lg', 'xl', 'xxl'].includes(currentBreakpoint);

    if (isDesktop) {
      updateLayouts({
        ...layouts,
        xxl: layoutItems,
        xl: layoutItems,
        lg: layoutItems,
        // Keep mobile layouts as they were
      });
    } else {
      updateLayouts({
        ...layouts,
        md: layoutItems,
        sm: layoutItems,
        xs: layoutItems,
      });
    }
  }, [updateLayouts, currentBreakpoint, layouts]);

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

  // Handle Reset Layout
  const handleResetLayout = () => {
    if (window.confirm('Reset dashboard layout to default settings? This will rearrange all widgets.')) {
      resetLayoutToDefault();
    }
  };

  if (isLoading) {
    return (
      <div className="flex bg-[#0F172A] flex-col items-center justify-center min-h-[400px] gap-4 text-slate-400">
        <div className="w-12 h-12 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className={`
      flex h-full w-full flex-col gap-6 p-4 md:p-6 lg:p-8 
      ${!isEditMode ? 'transition-all duration-300' : ''}
    `}>
      {/* Header Section */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            {t('dashboard.title')}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}></span>
            <span>{isConnected ? t('status.c_connect') : t('status.disconnect')}</span>
            <span className="mx-2 text-slate-700">|</span>
            <span>{t('dashboard.last_update')}: {lastUpdate ? lastUpdate.toLocaleTimeString() : '-'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Switcher */}
          <div className="bg-slate-800 dark:bg-white/5 rounded-lg p-1 flex border border-slate-700 dark:border-white/10">
            <button
              onClick={() => {
                setDashboardMode('default');
                if (isEditMode) setIsEditMode(false); // Force exit edit mode
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${dashboardMode === 'default' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              Default
            </button>
            <button
              onClick={() => setDashboardMode('custom')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${dashboardMode === 'custom' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              Custom
            </button>
          </div>

          <DeviceSelector
            selectedDevice={selectedDevice}
            onSelect={setSelectedDevice}
          />
          {dashboardMode === 'custom' && isEditMode && isAdmin && (
            <button
              onClick={handleResetLayout}
              className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs transition-colors shadow-sm whitespace-nowrap"
            >
              Reset Layout
            </button>
          )}
          {dashboardMode === 'custom' && isAdmin && <EditModeToggle />}
        </div>
      </header>

      {/* Error Notification Layer */}
      <div className="z-50 pointer-events-none sticky top-4">
        <InfluxErrorNotification />
      </div>

      {/* Time Range Summary Panel */}
      <TimeRangeSummaryPanel />

      {/* Main Grid Layout - Forcing width 100% */}
      <main className="dashboard-grid-container relative flex-1 w-full" style={{ width: '100%', maxWidth: '100%' }}>
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={currentCols}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          margin={MARGIN}
          isDraggable={canEdit}
          isResizable={canEdit}
          compactType={compactType}
          preventCollision={false}
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
                className={`widget-wrapper group flex flex-col h-full relative rounded-xl overflow-hidden transition-all duration-150 bg-transparent ${canEdit ? 'border border-dashed border-violet-400/50 hover:border-violet-400 cursor-move' : 'border border-transparent cursor-default'}`}
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