module.exports = {
  apps: [
    {
      name: 'afs-api',
      script: 'dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'afs-worker',
      script: 'dist/workers/index.js',
      instances: 1, // Workers handle concurrency internally or via BullMQ
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
