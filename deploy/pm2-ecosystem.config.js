/**
 * PM2 Ecosystem Configuration
 * Usage: pm2 start ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'central-auth',
      script: './dist/app.js',
      instances: 2, // Use cluster mode for better performance
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/central-auth/error.log',
      out_file: '/var/log/central-auth/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
    },
  ],
};
