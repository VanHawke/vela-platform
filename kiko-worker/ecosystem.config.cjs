// ecosystem.config.cjs
// PM2 process config for kiko-worker.
// Run with: pm2 start ecosystem.config.cjs
// Save for auto-start on boot: pm2 save && sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u kiko --hp /home/kiko

module.exports = {
  apps: [
    {
      name: 'kiko-worker',
      script: 'server.js',
      cwd: '/home/kiko/kiko-worker',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: '3000'
      },
      error_file: '/home/kiko/kiko-worker/logs/err.log',
      out_file: '/home/kiko/kiko-worker/logs/out.log',
      time: true,
      merge_logs: true
    }
  ]
};
