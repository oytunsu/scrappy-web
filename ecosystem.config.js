module.exports = {
  apps: [
    {
      name: 'scrappy-web',
      cwd: '/var/www/scrappy',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'scrappy-api',
      cwd: '/var/www/scrappy/scrappy-api',
      script: './venv/bin/python',
      args: 'main.py',
      env: {
        PORT: 8000
      }
    }
  ]
}
