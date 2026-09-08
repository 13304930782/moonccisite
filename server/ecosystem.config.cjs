module.exports = {
  apps: [
    {
      name: 'mooncci-api',
      script: 'src/index.js',
      interpreter: '/opt/mooncci-node-v24.20.0/bin/node',
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
    {
      name: 'mooncci-worker',
      script: 'src/worker.js',
      interpreter: '/opt/mooncci-node-v24.20.0/bin/node',
      cwd: '/www/wwwroot/mooncci-source/server',
      exec_mode: 'fork',
      instances: 1,
      restart_delay: 5000,
      max_memory_restart: '300M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
