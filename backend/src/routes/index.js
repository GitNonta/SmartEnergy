/**
 * Routes Index
 * Modular route setup for Express app
 * 
 * Usage in index.js:
 *   const routes = require('./routes');
 *   routes.setup(app, { influxService, energyState, firmwareManager });
 * 
 * Routes Structure:
 * - /api/energy/*        → Energy data & charts (public)
 * - /api/data/*          → Data integrity checks (public)
 * - /api/summary/*       → Usage summary dashboard (public)
 * - /api/firmware/*      → Firmware management (auth for upload/delete)
 * - /api/admin/*         → Admin operations (auth required for all)
 * - /api/notifications/* → LINE Messaging notifications
 */

const energyRoutes = require('./energyRoutes');
const dataRoutes = require('./dataRoutes');
const firmwareRoutes = require('./firmwareRoutes');
const adminRoutes = require('./adminRoutes');
const summaryRoutes = require('./summaryRoutes');
const notificationRoutes = require('./notificationRoutes');
const chatRoutes = require('./chatRoutes');
const authRoutes = require('./authRoutes');
const layoutRoutes = require('./layoutRoutes');
const userRoutes = require('./userRoutes');
const lineMessagingService = require('../services/lineMessagingService');
const aiChatService = require('../services/aiChatService');

function setup(app, dependencies) {
  const { influxService, energyState, firmwareManager } = dependencies;
  
  console.log('🔧 Setting up modular routes...');
  
  // Energy routes (public)
  if (influxService && energyState) {
    app.use('/api/energy', energyRoutes(influxService, energyState));
    console.log('  ✅ /api/energy/* routes mounted');
  }
  
  // Data integrity routes (public)
  if (influxService) {
    app.use('/api/data', dataRoutes(influxService));
    console.log('  ✅ /api/data/* routes mounted');
  }
  
  // Summary routes (public)
  if (influxService) {
    app.use('/api/summary', summaryRoutes(influxService));
    console.log('  ✅ /api/summary/* routes mounted');
  }
  
  // Firmware routes (auth for upload/delete/announce)
  if (firmwareManager) {
    app.use('/api/firmware', firmwareRoutes(firmwareManager));
    console.log('  ✅ /api/firmware/* routes mounted (auth protected)');
  }
  
  // Admin routes (auth required for all)
  if (influxService && energyState) {
    app.use('/api/admin', adminRoutes(influxService, energyState));
    console.log('  ✅ /api/admin/* routes mounted (auth required)');
  }
  
  // Notification routes (LINE Messaging API)
  app.use('/api/notifications', notificationRoutes(lineMessagingService));
  console.log('  ✅ /api/notifications/* routes mounted (LINE Messaging)');
  
  // Alert History endpoint
  if (influxService) {
    app.get('/api/alerts/history', async (req, res) => {
      try {
        const { deviceId, severity, startTime, limit } = req.query;
        const result = await influxService.queryAlertHistory({
          deviceId: deviceId || 'AI205',
          severity: severity || null,
          startTime: startTime || '-7d',
          limit: parseInt(limit) || 100
        });
        res.json(result);
      } catch (error) {
        console.error('❌ Error fetching alert history:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('  ✅ /api/alerts/history route mounted');
  }
  
  // AI Chat routes
  app.use('/api/chat', chatRoutes(aiChatService));
  console.log('  ✅ /api/chat/* routes mounted (AI Agent)');
  
  // Auth routes (login, logout, sessions, logs)
  app.use('/api/auth', authRoutes);
  console.log('  ✅ /api/auth/* routes mounted (Authentication)');
  
  // Layout routes (dashboard widget positioning - public read, admin write)
  app.use('/api/layout', layoutRoutes);
  console.log('  ✅ /api/layout/* routes mounted (Dashboard Layout)');
  
  // User management routes (admin and self)
  app.use('/api/users', userRoutes);
  console.log('  ✅ /api/users/* routes mounted (User Management)');
  
  console.log('✅ All modular routes configured');
}

// Export LINE messaging service for use in other modules
module.exports = { setup, lineMessagingService };
