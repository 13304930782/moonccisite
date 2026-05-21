module.exports = {
  apps: [
    {
      name: 'mooncci-api',
      script: 'src/index.js',
      cwd: '/www/wwwroot/mooncci-source/server',
      exec_mode: 'fork',
      instances: 1,
      node_args: '--max-old-space-size=256',
      max_memory_restart: '300M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
