/**
 * Layout Service
 * 
 * Manages dashboard widget layouts stored in MySQL database.
 * Layouts are shared across all users - only admin can modify.
 */

const db = require('./db');

// Default layout configuration for all breakpoints
const defaultLayouts = {
  lg: [
    { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2 },
    { i: 'active-power', x: 2, y: 0, w: 2, h: 2 },
    { i: 'energy-accumulated', x: 4, y: 0, w: 2, h: 2 },
    { i: 'frequency', x: 0, y: 2, w: 2, h: 1 },
    { i: 'current', x: 2, y: 2, w: 2, h: 1 },
    { i: 'power-factor', x: 4, y: 2, w: 2, h: 1 },
    { i: 'statistics', x: 0, y: 3, w: 6, h: 2 },
  ],
  md: [
    { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2 },
    { i: 'active-power', x: 2, y: 0, w: 2, h: 2 },
    { i: 'energy-accumulated', x: 0, y: 2, w: 2, h: 2 },
    { i: 'frequency', x: 2, y: 2, w: 2, h: 1 },
    { i: 'current', x: 0, y: 4, w: 2, h: 1 },
    { i: 'power-factor', x: 2, y: 4, w: 2, h: 1 },
    { i: 'statistics', x: 0, y: 5, w: 4, h: 2 },
  ],
  sm: [
    { i: 'energy-cost', x: 0, y: 0, w: 2, h: 2 },
    { i: 'active-power', x: 0, y: 2, w: 2, h: 2 },
    { i: 'energy-accumulated', x: 0, y: 4, w: 2, h: 2 },
    { i: 'frequency', x: 0, y: 6, w: 2, h: 1 },
    { i: 'current', x: 0, y: 7, w: 2, h: 1 },
    { i: 'power-factor', x: 0, y: 8, w: 2, h: 1 },
    { i: 'statistics', x: 0, y: 9, w: 2, h: 2 },
  ],
  xs: [
    { i: 'energy-cost', x: 0, y: 0, w: 1, h: 2 },
    { i: 'active-power', x: 0, y: 2, w: 1, h: 2 },
    { i: 'energy-accumulated', x: 0, y: 4, w: 1, h: 2 },
    { i: 'frequency', x: 0, y: 6, w: 1, h: 1 },
    { i: 'current', x: 0, y: 7, w: 1, h: 1 },
    { i: 'power-factor', x: 0, y: 8, w: 1, h: 1 },
    { i: 'statistics', x: 0, y: 9, w: 1, h: 2 },
  ],
};

/**
 * Get layout by key
 * @param {string} layoutKey - Layout identifier (default: 'default')
 * @returns {Promise<object>} Layout data with metadata
 */
async function getLayout(layoutKey = 'default') {
  try {
    const result = await db.queryOne(`
      SELECT 
        dl.layout_key,
        dl.layouts,
        dl.updated_at,
        u.id as updater_id,
        u.display_name as updater_name
      FROM dashboard_layouts dl
      LEFT JOIN users u ON dl.updated_by = u.id
      WHERE dl.layout_key = ?
    `, [layoutKey]);

    if (!result) {
      // Return default layout if not found in DB
      return {
        layoutKey,
        layouts: defaultLayouts,
        updatedAt: null,
        updatedBy: null,
        isDefault: true
      };
    }

    return {
      layoutKey: result.layout_key,
      layouts: typeof result.layouts === 'string' 
        ? JSON.parse(result.layouts) 
        : result.layouts,
      updatedAt: result.updated_at,
      updatedBy: result.updater_id ? {
        id: result.updater_id,
        displayName: result.updater_name
      } : null,
      isDefault: false
    };
  } catch (error) {
    console.error('❌ Error getting layout:', error.message);
    throw error;
  }
}

/**
 * Save layout (create or update)
 * @param {string} layoutKey - Layout identifier
 * @param {object} layouts - Layout data for all breakpoints
 * @param {number} userId - User ID who is saving
 * @returns {Promise<object>} Updated layout data
 */
async function saveLayout(layoutKey, layouts, userId) {
  try {
    const layoutsJson = JSON.stringify(layouts);

    // Upsert: insert or update
    await db.query(`
      INSERT INTO dashboard_layouts (layout_key, layouts, updated_by)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        layouts = VALUES(layouts),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
    `, [layoutKey, layoutsJson, userId]);

    console.log(`✅ Layout '${layoutKey}' saved by user ${userId}`);

    return await getLayout(layoutKey);
  } catch (error) {
    console.error('❌ Error saving layout:', error.message);
    throw error;
  }
}

/**
 * Reset layout to default
 * @param {string} layoutKey - Layout identifier
 * @param {number} userId - User ID who is resetting
 * @returns {Promise<object>} Default layout data
 */
async function resetLayout(layoutKey, userId) {
  try {
    // Delete existing layout (will fall back to default)
    await db.query(
      'DELETE FROM dashboard_layouts WHERE layout_key = ?',
      [layoutKey]
    );

    console.log(`🔄 Layout '${layoutKey}' reset to default by user ${userId}`);

    return {
      layoutKey,
      layouts: defaultLayouts,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
      isDefault: true
    };
  } catch (error) {
    console.error('❌ Error resetting layout:', error.message);
    throw error;
  }
}

/**
 * Get default layouts
 * @returns {object} Default layout configuration
 */
function getDefaultLayouts() {
  return defaultLayouts;
}

module.exports = {
  getLayout,
  saveLayout,
  resetLayout,
  getDefaultLayouts,
  defaultLayouts
};
