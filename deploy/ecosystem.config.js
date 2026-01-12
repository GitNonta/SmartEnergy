/**
 * SMART Energy Monitoring System - PM2 Ecosystem Configuration
 * 
 * This file defines how PM2 should manage the backend service.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      // ═══════════════════════════════════════════════════════════════
      // Application Configuration
      // ═══════════════════════════════════════════════════════════════
      name: 'smart-energy-backend',
      script: './src/index.js',
      cwd: '/opt/smart-energy/backend',
      
      // ═══════════════════════════════════════════════════════════════
      // Environment
      // ═══════════════════════════════════════════════════════════════
      node_args: '--max-old-space-size=512',  // Limit memory to 512MB
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '0.0.0.0'
      },
      
      // ═══════════════════════════════════════════════════════════════
      // Process Management
      // ═══════════════════════════════════════════════════════════════
      instances: 1,                    // Single instance (stateful app)
      exec_mode: 'fork',               // Fork mode (not cluster)
      
      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,                // Max 10 restarts in a row
      min_uptime: '10s',               // Must run at least 10s before counting as stable
      restart_delay: 5000,             // Wait 5s between restarts
      
      // ═══════════════════════════════════════════════════════════════
      // Memory & Resource Limits
      // ═══════════════════════════════════════════════════════════════
      max_memory_restart: '500M',      // Restart if exceeds 500MB RAM
      
      // ═══════════════════════════════════════════════════════════════
      // Logging
      // ═══════════════════════════════════════════════════════════════
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/opt/smart-energy/logs/error.log',
      out_file: '/opt/smart-energy/logs/output.log',
      combine_logs: true,
      merge_logs: true,
      
      // ═══════════════════════════════════════════════════════════════
      // Watch Mode (Development Only - disable in production)
      // ═══════════════════════════════════════════════════════════════
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      
      // ═══════════════════════════════════════════════════════════════
      // Graceful Shutdown
      // ═══════════════════════════════════════════════════════════════
      kill_timeout: 10000,             // Wait 10s for graceful shutdown
      wait_ready: true,                // Wait for 'ready' signal
      listen_timeout: 10000,           // Timeout for ready signal
      
      // ═══════════════════════════════════════════════════════════════
      // Health Monitoring
      // ═══════════════════════════════════════════════════════════════
      exp_backoff_restart_delay: 1000, // Exponential backoff on restart
    }
  ],
  
  // ═══════════════════════════════════════════════════════════════════
  // Deployment Configuration (for pm2 deploy command)
  // ═══════════════════════════════════════════════════════════════════
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'YOUR_SERVER_IP',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/smart-energy.git',
      path: '/opt/smart-energy',
      'pre-deploy-local': '',
      'post-deploy': 'cd backend && npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
