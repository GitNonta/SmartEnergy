/**
 * Layout Routes
 * 
 * API endpoints for managing dashboard widget layouts.
 * GET is public, PUT/POST require admin authentication.
 */

const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../services/sessionService');
const layoutService = require('../services/layoutService');
const { ACTIONS, logActivity } = require('../services/activityLogger');

/**
 * GET /api/layout/:key
 * Get layout by key (public - all users can read)
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const layout = await layoutService.getLayout(key);

    res.json({
      success: true,
      data: layout
    });
  } catch (error) {
    console.error('Get layout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get layout'
    });
  }
});

/**
 * GET /api/layout
 * Get default layout
 */
router.get('/', async (req, res) => {
  try {
    const layout = await layoutService.getLayout('default');

    res.json({
      success: true,
      data: layout
    });
  } catch (error) {
    console.error('Get layout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get layout'
    });
  }
});

/**
 * PUT /api/layout/:key
 * Update layout (admin only)
 */
router.put('/:key', authMiddleware('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const { layouts } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!layouts) {
      return res.status(400).json({
        success: false,
        error: 'Layouts data is required'
      });
    }

    // Validate layouts structure
    if (typeof layouts !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Layouts must be an object with breakpoint keys (lg, md, sm, xs)'
      });
    }

    const updatedLayout = await layoutService.saveLayout(key, layouts, req.user.userId);

    // Log activity
    await logActivity(req.user.userId, ACTIONS.ADMIN_ACTION, 'layout', {
      action: 'update_layout',
      layoutKey: key
    }, ipAddress);

    res.json({
      success: true,
      data: updatedLayout,
      message: 'Layout saved successfully'
    });
  } catch (error) {
    console.error('Save layout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save layout'
    });
  }
});

/**
 * POST /api/layout/:key/reset
 * Reset layout to default (admin only)
 */
router.post('/:key/reset', authMiddleware('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const defaultLayout = await layoutService.resetLayout(key, req.user.userId);

    // Log activity
    await logActivity(req.user.userId, ACTIONS.ADMIN_ACTION, 'layout', {
      action: 'reset_layout',
      layoutKey: key
    }, ipAddress);

    res.json({
      success: true,
      data: defaultLayout,
      message: 'Layout reset to default'
    });
  } catch (error) {
    console.error('Reset layout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset layout'
    });
  }
});

/**
 * GET /api/layout/:key/default
 * Get default layout configuration (for reference)
 */
router.get('/:key/default', (req, res) => {
  res.json({
    success: true,
    data: {
      layouts: layoutService.getDefaultLayouts(),
      isDefault: true
    }
  });
});

module.exports = router;
