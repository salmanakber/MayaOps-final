# PM2 Quick Start Guide

## Quick Commands

```bash
# Start both Next.js app and worker
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs

# Restart all
pm2 restart all

# Stop all
pm2 stop all

# Save PM2 configuration (so it persists after reboot)
pm2 save

# Set up PM2 to start on system boot
pm2 startup
# Follow the instructions it provides
```

## Individual App Commands

```bash
# Start specific app
pm2 start mayaops-web
pm2 start recurring-jobs-worker

# Restart specific app
pm2 restart mayaops-web
pm2 restart recurring-jobs-worker

# View logs for specific app
pm2 logs mayaops-web
pm2 logs recurring-jobs-worker

# Stop specific app
pm2 stop mayaops-web
pm2 stop recurring-jobs-worker
```

## Monitoring

```bash
# Real-time monitoring dashboard
pm2 monit

# View detailed info
pm2 show mayaops-web
pm2 show recurring-jobs-worker

# View process list
pm2 list
```

## Logs

```bash
# View all logs
pm2 logs

# View last 100 lines
pm2 logs --lines 100

# View only errors
pm2 logs --err

# Clear logs
pm2 flush
```

## Troubleshooting

### Worker Not Starting

1. Check if Redis is running:
   ```bash
   redis-cli ping
   ```

2. Check worker logs:
   ```bash
   pm2 logs recurring-jobs-worker --err
   ```

3. Check environment variables:
   ```bash
   pm2 env recurring-jobs-worker
   ```

### Restart Worker

```bash
pm2 restart recurring-jobs-worker
```

### Delete and Recreate

```bash
pm2 delete recurring-jobs-worker
pm2 start ecosystem.config.js --only recurring-jobs-worker
```
