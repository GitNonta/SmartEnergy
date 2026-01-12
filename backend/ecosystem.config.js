// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'smart-ingestor',
      script: './src/ingestor.js', // Service รับข้อมูล
      instances: 1,
      autorestart: true,
      watch: true,
      ignore_watch: ["node_modules", "logs", "*.log"],
      env: {
        NODE_ENV: 'production',
        MQTT_CLIENT_ID: 'smart_ingestor_service'
      }
    },
    {
      name: 'smart-api',
      script: './src/server.js',   // Service API & Web
      instances: 1,
      autorestart: true,
      watch: true,
      ignore_watch: ["node_modules", "logs", "*.log"],
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        MQTT_CLIENT_ID: 'smart_api_service'
      }
    }
  ]
};
