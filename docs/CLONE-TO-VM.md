# How to Clone Repository to VM

This guide shows you how to clone the Central SSO JWT repository to a Linux VM and set it up.

## Prerequisites

- Linux VM (Ubuntu 22.04 recommended) with SSH access
- Git installed on the VM (or install it: `sudo apt-get install -y git`)
- Node.js 20.x LTS installed (see [DEPLOYMENT.md](./DEPLOYMENT.md) for setup)

## Quick Clone Steps

### Option 1: Clone Directly on VM (Recommended)

**1. SSH into your VM:**
```bash
ssh azureuser@your-vm-ip
# or
ssh username@your-vm-ip
```

**2. Navigate to your home directory or desired location:**
```bash
cd ~
# or create a specific directory
mkdir -p ~/apps
cd ~/apps
```

**3. Clone the repository:**
```bash
git clone https://github.com/arunava850/Central-SSO-JWT.git central-auth
```

**4. Navigate into the cloned directory:**
```bash
cd central-auth
```

**5. Install dependencies:**
```bash
npm install
```

**6. Generate RSA keys:**
```bash
npm run generate-keys
```

**7. Configure environment:**
```bash
# Copy example env file
cp .env.example .env

# Edit with your credentials
nano .env
# or use vi: vi .env
```

**8. Build the application:**
```bash
npm run build
```

**9. Start the service:**
```bash
# Using PM2 (recommended for production)
pm2 start dist/app.js --name central-auth
pm2 save

# Or using npm (development)
npm start
```

---

### Option 2: Clone from Local Machine and Transfer

If you prefer to clone on your local machine first:

**1. Clone to your local machine:**
```bash
git clone https://github.com/arunava850/Central-SSO-JWT.git
cd Central-SSO-JWT
```

**2. Transfer to VM using SCP:**
```bash
# Transfer entire directory
scp -r Central-SSO-JWT azureuser@your-vm-ip:/home/azureuser/central-auth

# Or use rsync (more efficient)
rsync -avz --exclude 'node_modules' --exclude 'dist' \
  Central-SSO-JWT/ azureuser@your-vm-ip:/home/azureuser/central-auth/
```

**3. SSH into VM and continue from step 4 above:**
```bash
ssh azureuser@your-vm-ip
cd ~/central-auth
npm install
# ... continue with steps 5-9
```

---

## Complete Setup Example

Here's a complete example session:

```bash
# 1. SSH into VM
ssh azureuser@192.168.1.100

# 2. Install git if not already installed
sudo apt-get update
sudo apt-get install -y git

# 3. Clone repository
cd ~
git clone https://github.com/arunava850/Central-SSO-JWT.git central-auth
cd central-auth

# 4. Install Node.js if not installed (Ubuntu 22.04)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 5. Install dependencies
npm install

# 6. Generate RSA keys for JWT signing
npm run generate-keys

# 7. Configure environment
cp .env.example .env
nano .env
# Add your:
# - TENANT_ID
# - CLIENT_ID
# - CLIENT_SECRET
# - BASE_URL
# - REDIRECT_URIS
# etc.

# 8. Build TypeScript
npm run build

# 9. Install PM2 (process manager)
sudo npm install -g pm2

# 10. Start service with PM2
pm2 start dist/app.js --name central-auth
pm2 save
pm2 startup  # Enable PM2 to start on system boot

# 11. Check status
pm2 status
pm2 logs central-auth
```

---

## Verify Installation

**Check if the service is running:**
```bash
# If using PM2
pm2 status
pm2 logs central-auth

# Check if port is listening
sudo netstat -tlnp | grep 3000
# or
sudo ss -tlnp | grep 3000
```

**Test the health endpoint:**
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

## Troubleshooting

### Port 3000 Already in Use

If you get an error like:
```
errno: -98, syscall: 'listen', port: 3000
```

**Quick fix:**
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Stop all PM2 processes
pm2 delete all

# Start fresh
pm2 start dist/app.js --name central-auth
pm2 save
```

**Or use the fix script:**
```bash
bash scripts/fix-port-3000.sh
```

For detailed troubleshooting, see [TROUBLESHOOTING-PORT-3000.md](./TROUBLESHOOTING-PORT-3000.md)

### Git not installed
```bash
sudo apt-get update
sudo apt-get install -y git
```

### Node.js not installed
```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### Permission denied when cloning
```bash
# Make sure you have write permissions in the directory
cd ~
# or use sudo (not recommended)
sudo git clone https://github.com/arunava850/Central-SSO-JWT.git central-auth
sudo chown -R $USER:$USER central-auth
```

### npm install fails
```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install

# If still failing, check Node.js version
node --version  # Should be 20.x
```

### Port already in use
```bash
# Find process using port 3000
sudo lsof -i :3000
# or
sudo netstat -tlnp | grep 3000

# Kill the process
sudo kill -9 <PID>
```

---

## Next Steps

After cloning and basic setup:

1. **Configure Nginx** (for reverse proxy and SSL):
   - See [DEPLOYMENT.md](./DEPLOYMENT.md#configure-nginx)

2. **Setup SSL Certificate** (for HTTPS):
   - See [DEPLOYMENT.md](./DEPLOYMENT.md#setup-ssl-certificate)

3. **Configure Firewall**:
   ```bash
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw enable
   ```

4. **Update Application** (when new code is pushed):
   ```bash
   cd ~/central-auth
   git pull origin main
   npm install
   npm run build
   pm2 restart central-auth
   ```

---

## Repository URL

**GitHub:** https://github.com/arunava850/Central-SSO-JWT.git

**Clone command:**
```bash
git clone https://github.com/arunava850/Central-SSO-JWT.git
```

---

## Additional Resources

- [Full Deployment Guide](./DEPLOYMENT.md) - Complete production deployment
- [Environment Configuration](../README.md#environment-variables) - All environment variables
- [Troubleshooting](./README.md#troubleshooting) - Common issues and solutions
