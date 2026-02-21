# DigitalOcean Deployment Guide

## Overview

This guide explains how to deploy your Next.js app with BullMQ recurring jobs worker on DigitalOcean using PM2.

## Architecture

- **Next.js App**: Main web server (runs on PM2)
- **Recurring Jobs Worker**: Separate process for processing recurring jobs (runs on PM2)
- **Redis**: Managed Redis database (DigitalOcean Managed Database)
- **PostgreSQL**: Managed PostgreSQL database (DigitalOcean Managed Database)

## Prerequisites

1. DigitalOcean account
2. Droplet (recommended: 2GB RAM minimum)
3. Domain name (optional)

## Step 1: Set Up DigitalOcean Droplet

1. Create a new Droplet:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic (2GB RAM minimum recommended)
   - **Region**: Choose closest to your users
   - **Authentication**: SSH keys (recommended)

2. Connect to your droplet:
   ```bash
   ssh root@your-droplet-ip
   ```

## Step 2: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install build tools (for native modules)
sudo apt-get install -y build-essential python3

# Install Git
sudo apt-get install -y git
```

## Step 3: Set Up Redis

### Option A: DigitalOcean Managed Redis (Recommended)

1. Create a Managed Redis database in DigitalOcean
2. Get the connection string from the dashboard
3. Update your `.env` file with the connection string

### Option B: Install Redis on Droplet

```bash
# Install Redis
sudo apt-get install -y redis-server

# Start Redis
sudo systemctl start redis-server

# Enable Redis on boot
sudo systemctl enable redis-server

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

## Step 4: Deploy Your Application

```bash
# Clone your repository
git clone https://github.com/your-username/your-repo.git
cd your-repo/web

# Install dependencies
npm install

# Build the application
npm run build

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

## Step 5: Configure Environment Variables

Create a `.env` file:

```bash
nano .env
```

Add your environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Redis (Managed Database)
REDIS_URL=redis://user:password@host:port
# OR (Local Redis)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key

# Other required variables...
```

## Step 6: Set Up PM2

### Create Logs Directory

```bash
mkdir -p logs
```

### Start Applications with PM2

```bash
# Start both Next.js app and worker
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
pm2 startup
# Follow the instructions it provides
```

### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs

# View logs for specific app
pm2 logs mayaops-web
pm2 logs recurring-jobs-worker

# Restart apps
pm2 restart all
pm2 restart mayaops-web
pm2 restart recurring-jobs-worker

# Stop apps
pm2 stop all

# Monitor
pm2 monit

# Delete apps
pm2 delete all
```

## Step 7: Set Up Nginx (Reverse Proxy)

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/mayaops
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mayaops /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 8: Set Up SSL (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Step 9: Verify Everything is Working

1. **Check PM2 Status:**
   ```bash
   pm2 status
   ```
   Both `mayaops-web` and `recurring-jobs-worker` should be "online"

2. **Check Logs:**
   ```bash
   pm2 logs recurring-jobs-worker
   ```
   You should see:
   ```
   [Worker] ✓ Worker initialized
   [Worker] ✓ Recovery completed
   [Worker] ✓ Worker is running and ready
   ```

3. **Test Redis Connection:**
   ```bash
   redis-cli ping
   ```

4. **Test Your App:**
   Visit `https://your-domain.com` in your browser

## Step 10: Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# View detailed info
pm2 show mayaops-web
pm2 show recurring-jobs-worker
```

### Log Management

PM2 automatically rotates logs. To view logs:

```bash
# All logs
pm2 logs

# Specific app
pm2 logs recurring-jobs-worker --lines 100

# Follow logs
pm2 logs recurring-jobs-worker --lines 0
```

## Troubleshooting

### Worker Not Starting

1. Check Redis connection:
   ```bash
   redis-cli ping
   ```

2. Check worker logs:
   ```bash
   pm2 logs recurring-jobs-worker
   ```

3. Check environment variables:
   ```bash
   pm2 env recurring-jobs-worker
   ```

### Redis Connection Errors

1. Verify Redis is running:
   ```bash
   sudo systemctl status redis-server
   ```

2. Test connection:
   ```bash
   redis-cli -h your-redis-host -p your-redis-port ping
   ```

3. Check firewall:
   ```bash
   sudo ufw status
   ```

### Worker Keeps Restarting

Check PM2 logs for errors:
```bash
pm2 logs recurring-jobs-worker --err
```

Common issues:
- Redis not accessible
- Missing environment variables
- Port conflicts

## Updating Your Application

```bash
# Pull latest changes
git pull

# Install new dependencies
npm install

# Build
npm run build

# Run migrations
npm run prisma:migrate

# Restart PM2
pm2 restart all
```

## Backup Strategy

1. **Database Backups**: Use DigitalOcean automated backups
2. **Redis Backups**: Use DigitalOcean automated backups (if using managed Redis)
3. **Application Code**: Git repository
4. **Environment Variables**: Store securely (use DigitalOcean App Platform secrets or similar)

## Production Checklist

- [ ] Redis is running and accessible
- [ ] PostgreSQL is running and accessible
- [ ] Environment variables are set correctly
- [ ] PM2 is running both apps
- [ ] Nginx is configured and running
- [ ] SSL certificate is installed
- [ ] Firewall is configured (UFW)
- [ ] Logs are being written
- [ ] Worker is processing jobs (check logs)
- [ ] Auto-restart on boot is configured

## Security Recommendations

1. **Firewall:**
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

2. **Fail2Ban:**
   ```bash
   sudo apt-get install -y fail2ban
   ```

3. **Regular Updates:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

## Cost Estimation

- **Droplet (2GB RAM)**: ~$12/month
- **Managed Redis**: ~$15/month (or free if using local Redis)
- **Managed PostgreSQL**: ~$15/month
- **Total**: ~$42/month (or ~$27/month with local Redis)

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs`
2. Check system logs: `journalctl -u nginx`
3. Verify Redis: `redis-cli ping`
4. Check environment variables: `pm2 env`
