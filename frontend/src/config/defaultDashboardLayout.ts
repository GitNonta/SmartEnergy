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
    'frequency': { minW: 1, minH: 1, maxW: 4, maxH: 3, title: 'Voltage' },
    'current': { minW: 1, minH: 1, maxW: 4, maxH: 3, title: 'Current' },
    'power-factor': { minW: 1, minH: 1, maxW: 4, maxH: 3, title: 'Power Factor' },
    'statistics': { minW: 1, minH: 1, maxW: 8, maxH: 4, title: 'Statistics Summary' },
};

// Default layouts for each breakpoint
export const defaultLayouts: Layouts = {
    xxl: [
        { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'active-power', x: 2, y: 0, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'energy-accumulated', x: 4, y: 0, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'frequency', x: 6, y: 0, w: 2, h: 1, minW: 1, minH: 1 }, // Extra space in XXL
        { i: 'current', x: 6, y: 1, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'power-factor', x: 0, y: 2, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'statistics', x: 2, y: 2, w: 6, h: 2, minW: 2, minH: 1 },
    ],
    xl: [
        { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'active-power', x: 2, y: 0, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'energy-accumulated', x: 4, y: 0, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'frequency', x: 0, y: 2, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'current', x: 2, y: 2, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'power-factor', x: 4, y: 2, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'statistics', x: 0, y: 3, w: 6, h: 2, minW: 2, minH: 1 },
    ],
    lg: [ // Laptop (992px - 1199px) -> 4 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'active-power', x: 2, y: 0, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'energy-accumulated', x: 0, y: 2, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'frequency', x: 2, y: 2, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'current', x: 0, y: 4, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'power-factor', x: 2, y: 4, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'statistics', x: 0, y: 5, w: 4, h: 2, minW: 2, minH: 1 },
    ],
    md: [ // Tablet (768px - 991px) -> 3 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
        { i: 'active-power', x: 2, y: 0, w: 1, h: 2, minW: 1, minH: 1 }, // Compressed
        { i: 'energy-accumulated', x: 0, y: 2, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'frequency', x: 2, y: 2, w: 1, h: 1, minW: 1, minH: 1 },
        { i: 'current', x: 2, y: 3, w: 1, h: 1, minW: 1, minH: 1 },
        { i: 'power-factor', x: 0, y: 4, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'statistics', x: 0, y: 5, w: 3, h: 2, minW: 2, minH: 1 },
    ],
    sm: [ // Tablet Vertical (576px - 767px) -> 2 Cols
        { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2, minW: 1, minH: 2 },
        { i: 'active-power', x: 0, y: 2, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'energy-accumulated', x: 0, y: 4, w: 2, h: 2, minW: 1, minH: 1 },
        { i: 'frequency', x: 0, y: 6, w: 1, h: 1, minW: 1, minH: 1 },
        { i: 'current', x: 1, y: 6, w: 1, h: 1, minW: 1, minH: 1 },
        { i: 'power-factor', x: 0, y: 7, w: 2, h: 1, minW: 1, minH: 1 },
        { i: 'statistics', x: 0, y: 8, w: 2, h: 2, minW: 1, minH: 1 },
    ],
    xs: [ // Mobile (< 576px) -> 1 Col
        { i: 'energy-cost', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 2 },
        { i: 'active-power', x: 0, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'energy-accumulated', x: 0, y: 4, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'frequency', x: 0, y: 6, w: 1, h: 1, minW: 1, minH: 1 },
        { i: 'current', x: 0, y: 7, w: 1, h: 1, minW: 1, minH: 1 },
        { i: 'power-factor', x: 0, y: 8, w: 1, h: 1, minW: 1, minH: 1 },
        { i: 'statistics', x: 0, y: 9, w: 1, h: 2, minW: 1, minH: 1 },
    ],
};

// Grid configuration
export const gridConfig = {
    breakpoints: { xxl: 1400, xl: 1200, lg: 992, md: 768, sm: 576, xs: 0 },
    cols: { xxl: 8, xl: 6, lg: 4, md: 3, sm: 2, xs: 1 },
    rowHeight: 120,
    margin: [16, 16] as [number, number],
    containerPadding: [0, 0] as [number, number],
};
