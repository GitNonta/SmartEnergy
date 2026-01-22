module.exports = {
  apps: [
    {
      name: 'smart-ingestor',
      script: './backend/src/ingestor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        MQTT_CLIENT_ID: 'smart_ingestor_pm2'
      }
    },
    {
      name: 'smart-backend',
      script: './backend/src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
