/**
 * Default Dashboard Layout Configuration
 * 
 * Defines the default widget positions for each breakpoint.
 * This is used when no custom layout is stored in the database.
 */

export interface LayoutItem {
    i: string;        // Widget ID
    x: number;        // X position (grid units)
    y: number;        // Y position (grid units)
    w: number;        // Width (grid units)
    h: number;        // Height (grid units)
    minW?: number;    // Minimum width
    minH?: number;    // Minimum height
    maxW?: number;    // Maximum width
    maxH?: number;    // Maximum height
    static?: boolean; // If true, widget cannot be moved/resized
}

export interface Layouts {
    xxl: LayoutItem[];
    xl: LayoutItem[];
    lg: LayoutItem[];
    md: LayoutItem[];
    sm: LayoutItem[];
    xs: LayoutItem[];
}

// Widget definitions with their allowed size constraints (more flexible for canvas-like editing)
export const widgetConfig: Record<string, { minW: number; minH: number; maxW?: number; maxH?: number; title: string }> = {
    'energy-cost': { minW: 1, minH: 1, maxW: 8, maxH: 4, title: 'Energy Cost' },
    'active-power': { minW: 1, minH: 1, maxW: 6, maxH: 4, title: 'Active Power' },
    'energy-accumulated': { minW: 1, minH: 1, maxW: 6, maxH: 4, title: 'Energy Accumulated' },
    'voltage': { minW: 1, minH: 1, maxW: 4, maxH: 3, title: 'Voltage' },
    'current': { minW: 1, minH: 1, maxW: 4, maxH: 3, title: 'Current' },
    'power-factor': { minW: 1, minH: 1, maxW: 4, maxH: 3, title: 'Power Factor' },
    'statistics': { minW: 1, minH: 1, maxW: 8, maxH: 4, title: 'Statistics Summary' },
};

// Default layouts for each breakpoint
// Columns: xxl=12, xl=10, lg=8, md=6, sm=4, xs=2
export const defaultLayouts: Layouts = {
    xxl: [ // Desktop Large (≥1400px) -> 12 Cols "Hero Layout"
        // Row 1: Key KPIs (Money & Power) - Big impact
        { i: 'energy-cost', x: 0, y: 0, w: 6, h: 5, minW: 3, minH: 3 },
        { i: 'active-power', x: 6, y: 0, w: 6, h: 5, minW: 3, minH: 3 },

        // Row 2: Analysis & Accumulation
        { i: 'statistics', x: 0, y: 5, w: 8, h: 5, minW: 4, minH: 4 },
        { i: 'energy-accumulated', x: 8, y: 5, w: 4, h: 5, minW: 3, minH: 3 },

        // Row 3: Technical Details (Electrical Params)
        { i: 'voltage', x: 0, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
        { i: 'current', x: 4, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
        { i: 'power-factor', x: 8, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
    ],
    xl: [ // Desktop (1200px - 1399px) -> 12 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 6, h: 5, minW: 3, minH: 3 },
        { i: 'active-power', x: 6, y: 0, w: 6, h: 5, minW: 3, minH: 3 },
        { i: 'statistics', x: 0, y: 5, w: 8, h: 5, minW: 4, minH: 4 },
        { i: 'energy-accumulated', x: 8, y: 5, w: 4, h: 5, minW: 3, minH: 3 },
        { i: 'voltage', x: 0, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
        { i: 'current', x: 4, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
        { i: 'power-factor', x: 8, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
    ],
    lg: [ // Laptop (992px - 1199px) -> 12 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 6, h: 5, minW: 3, minH: 3 },
        { i: 'active-power', x: 6, y: 0, w: 6, h: 5, minW: 3, minH: 3 },
        { i: 'statistics', x: 0, y: 5, w: 8, h: 5, minW: 4, minH: 4 },
        { i: 'energy-accumulated', x: 8, y: 5, w: 4, h: 5, minW: 3, minH: 3 },
        { i: 'voltage', x: 0, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
        { i: 'current', x: 4, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
        { i: 'power-factor', x: 8, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
    ],
    md: [ // Tablet (768px - 991px) -> 6 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 6, h: 2, minW: 4, minH: 2 },
        { i: 'active-power', x: 0, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'energy-accumulated', x: 3, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'voltage', x: 0, y: 4, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'current', x: 3, y: 4, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'power-factor', x: 0, y: 6, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'statistics', x: 3, y: 6, w: 3, h: 2, minW: 2, minH: 2 },
    ],
    sm: [ // Small Tablet (576px - 767px) -> 4 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
        { i: 'active-power', x: 0, y: 2, w: 4, h: 2, minW: 2, minH: 2 },
        { i: 'energy-accumulated', x: 0, y: 4, w: 4, h: 2, minW: 2, minH: 2 },
        { i: 'voltage', x: 0, y: 6, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'current', x: 2, y: 6, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'power-factor', x: 0, y: 8, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'statistics', x: 2, y: 8, w: 2, h: 2, minW: 2, minH: 2 },
    ],
    xs: [ // Mobile (< 576px) -> 2 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'active-power', x: 0, y: 2, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'energy-accumulated', x: 0, y: 4, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'voltage', x: 0, y: 6, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'current', x: 0, y: 8, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'power-factor', x: 0, y: 10, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'statistics', x: 0, y: 12, w: 2, h: 2, minW: 2, minH: 2 },
    ],
};

// Grid configuration (updated to match DashboardPage)
export const gridConfig = {
    breakpoints: { xxl: 1400, xl: 1200, lg: 992, md: 768, sm: 576, xs: 0 },
    cols: { xxl: 12, xl: 12, lg: 12, md: 6, sm: 4, xs: 2 },
    rowHeight: 80,
    margin: [12, 12] as [number, number],
    containerPadding: [0, 0] as [number, number],
};
