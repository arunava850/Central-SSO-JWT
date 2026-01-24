#!/bin/bash

# Central Auth Service - Linux VM Setup Script
# This script sets up a Ubuntu 22.04 VM for running the Central Auth Service
# Run as: sudo bash setup-vm.sh

set -e

echo "=========================================="
echo "Central Auth Service - VM Setup"
echo "=========================================="

# Update system packages
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Node.js LTS (v20.x)
echo "Installing Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node_version=$(node --version)
npm_version=$(npm --version)
echo "Node.js version: $node_version"
echo "npm version: $npm_version"

# Install PM2 for process management
echo "Installing PM2..."
npm install -g pm2

# Install nginx (for reverse proxy and SSL termination)
echo "Installing nginx..."
apt-get install -y nginx

# Install certbot for SSL certificates
echo "Installing certbot..."
apt-get install -y certbot python3-certbot-nginx

# Create application directory
APP_DIR="/home/azureuser/central-auth"
echo "Creating application directory: $APP_DIR"
mkdir -p $APP_DIR
chown azureuser:azureuser $APP_DIR

# Create logs directory
echo "Creating logs directory..."
mkdir -p /var/log/central-auth
chown azureuser:azureuser /var/log/central-auth

# Setup firewall (UFW)
echo "Configuring firewall..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

# Install build essentials (for native modules)
echo "Installing build essentials..."
apt-get install -y build-essential

# Install git (if not already installed)
echo "Installing git..."
apt-get install -y git

echo "=========================================="
echo "VM Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Copy your application code to: $APP_DIR"
echo "2. Run: cd $APP_DIR && npm install"
echo "3. Configure .env file"
echo "4. Run: npm run build"
echo "5. Setup nginx configuration (see deploy/nginx.conf)"
echo "6. Setup SSL certificates with certbot"
echo "7. Start the service with PM2: pm2 start dist/app.js --name central-auth"
