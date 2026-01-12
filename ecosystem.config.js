// SMART Energy Monitoring System
// PM2 Ecosystem Configuration File
// ไฟล์กำหนดค่าสำหรับ PM2 Process Manager

module.exports = {
  apps: [
    {
      name: 'smart-backend',
      script: './src/index.js',
      cwd: './backend',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        FRONTEND_URL: 'http://localhost:3000'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        FRONTEND_URL: 'http://your-domain.com'
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: './logs/backend.log',
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-error.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process monitoring
      min_uptime: '10s',
      max_restarts: 10,
      
      // Performance settings
      node_args: '--max-old-space-size=2048',
      
      // Health check
      health_check_url: 'http://localhost:3001/health',
      health_check_grace_period: 3000
    },
    {
      name: 'smart-frontend',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './frontend/build',
        PM2_SERVE_PORT: 3000,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html'
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_file: './logs/frontend.log',
      out_file: './logs/frontend-out.log',
      error_file: './logs/frontend-error.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process monitoring
      min_uptime: '5s',
      max_restarts: 5
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/smart-energy-monitoring.git',
      path: '/var/www/smart-energy-monitoring',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};