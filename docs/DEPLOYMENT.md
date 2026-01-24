# Deployment Guide - Linux VM

This guide provides step-by-step instructions for deploying the Central Authorization Service on a Linux VM (Ubuntu 22.04).

## Prerequisites

- Ubuntu 22.04 LTS VM (Azure, AWS, or other cloud provider)
- SSH access with sudo privileges
- Domain name pointing to VM IP address (for SSL certificates)
- Microsoft Entra ID app registration completed (see README.md)

## Quick Deployment Steps

### 1. Initial VM Setup

SSH into your VM and run the setup script:

```bash
# Copy setup script to VM
scp deploy/setup-vm.sh azureuser@your-vm-ip:/tmp/

# SSH into VM
ssh azureuser@your-vm-ip

# Run setup (requires sudo)
sudo bash /tmp/setup-vm.sh
```

This script will:
- Update system packages
- Install Node.js 20.x LTS
- Install PM2 process manager
- Install nginx
- Install certbot for SSL
- Configure firewall
- Create application directory

### 2. Deploy Application Code

```bash
# Navigate to app directory
cd /home/azureuser/central-auth

# Option A: Clone from git repository
git clone https://your-repo-url.git .

# Option B: Copy files via SCP (from local machine)
# scp -r /local/path/* azureuser@your-vm-ip:/home/azureuser/central-auth/

# Install dependencies
npm install

# Generate RSA key pair
npm run generate-keys
```

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit configuration
nano .env
```

**Required configuration:**
```env
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REDIRECT_URIS=https://your-domain.com/auth/callback,https://spoke-app.com/auth/callback
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
BASE_URL=https://your-domain.com
HTTPS_ENABLED=true
```

### 4. Build Application

```bash
npm run build
```

### 5. Configure Nginx

```bash
# Copy nginx configuration
sudo cp deploy/nginx.conf /etc/nginx/sites-available/central-auth

# Edit with your domain name
sudo nano /etc/nginx/sites-available/central-auth
# Replace "your-domain.com" with your actual domain

# Enable site
sudo ln -s /etc/nginx/sites-available/central-auth /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 6. Setup SSL Certificate

```bash
# Obtain SSL certificate from Let's Encrypt
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

Certbot will automatically configure nginx with SSL.

### 7. Start Application

```bash
# Start with PM2
cd /home/azureuser/central-auth
pm2 start deploy/pm2-ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions shown (usually: sudo env PATH=... pm2 startup systemd -u azureuser --hp /home/azureuser)
```

### 8. Verify Deployment

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs central-auth

# Test endpoints
curl https://your-domain.com/health
curl https://your-domain.com/.well-known/jwks.json
```

## Updating the Application

When you need to update the application:

```bash
cd /home/azureuser/central-auth

# Pull latest code (if using git)
git pull origin main

# Or copy new files via SCP

# Run deployment script
bash deploy/deploy.sh
```

The deployment script will:
- Install dependencies
- Build TypeScript
- Restart PM2 service

## Monitoring

### View Logs

```bash
# Application logs
pm2 logs central-auth

# Nginx access logs
sudo tail -f /var/log/nginx/central-auth-access.log

# Nginx error logs
sudo tail -f /var/log/nginx/central-auth-error.log
```

### PM2 Commands

```bash
# Status
pm2 status

# Restart
pm2 restart central-auth

# Stop
pm2 stop central-auth

# Monitor (real-time)
pm2 monit

# View info
pm2 info central-auth
```

## Troubleshooting

### Application Not Starting

1. Check PM2 logs: `pm2 logs central-auth`
2. Verify .env file exists and is configured correctly
3. Check if keys exist: `ls -la keys/`
4. Verify Node.js version: `node --version` (should be 20.x)

### Nginx Errors

1. Test configuration: `sudo nginx -t`
2. Check error logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify nginx is running: `sudo systemctl status nginx`

### SSL Certificate Issues

1. Check certificate status: `sudo certbot certificates`
2. Manually renew: `sudo certbot renew`
3. Verify nginx SSL config: `sudo nginx -t`

### Port Already in Use

If port 3000 is already in use:

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process (replace PID)
sudo kill -9 PID

# Or change PORT in .env file
```

### Firewall Issues

```bash
# Check firewall status
sudo ufw status

# Allow ports if needed
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## Security Hardening

### 1. Secure .env File

```bash
chmod 600 .env
```

### 2. Secure Keys Directory

```bash
chmod 700 keys
chmod 600 keys/*.pem
```

### 3. Disable Root Login (SSH)

```bash
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
sudo systemctl restart sshd
```

### 4. Setup Fail2ban

```bash
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 5. Enable Automatic Security Updates

```bash
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Backup Strategy

### What to Backup

1. **Application code** - Git repository or file backup
2. **Environment configuration** - `.env` file (store securely)
3. **RSA keys** - `keys/private.pem` and `keys/public.pem` (store very securely!)
4. **Nginx configuration** - `/etc/nginx/sites-available/central-auth`
5. **PM2 configuration** - `~/.pm2/`

### Backup Script Example

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/home/azureuser/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup .env (encrypted)
tar -czf $BACKUP_DIR/env_$DATE.tar.gz -C /home/azureuser/central-auth .env

# Backup keys (encrypted)
tar -czf $BACKUP_DIR/keys_$DATE.tar.gz -C /home/azureuser/central-auth keys/

# Backup nginx config
sudo cp /etc/nginx/sites-available/central-auth $BACKUP_DIR/nginx_$DATE.conf

echo "Backup completed: $BACKUP_DIR"
```

## Scaling

### Horizontal Scaling

For high availability, deploy multiple instances behind a load balancer:

1. Deploy on multiple VMs
2. Use Azure Load Balancer / AWS ELB / nginx load balancer
3. Share session storage (use Redis instead of in-memory Map)
4. Ensure all instances use the same JWT keys

### Vertical Scaling

Increase VM resources:
- More CPU cores
- More RAM
- PM2 will automatically use all cores in cluster mode

## Maintenance

### Regular Tasks

- **Weekly**: Review logs for errors
- **Monthly**: Update dependencies (`npm audit`, `npm update`)
- **Quarterly**: Rotate client secrets
- **As needed**: Update Node.js version

### Dependency Updates

```bash
cd /home/azureuser/central-auth
npm audit
npm update
npm run build
pm2 restart central-auth
```

## Support

For issues:
1. Check logs: `pm2 logs central-auth`
2. Review SECURITY.md for security best practices
3. Check README.md for configuration details
