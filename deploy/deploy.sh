#!/bin/bash

# Central Auth Service - Deployment Script
# Run this script from the project root directory
# Usage: bash deploy/deploy.sh

set -e

APP_DIR="/home/azureuser/central-auth"
SERVICE_NAME="central-auth"

echo "=========================================="
echo "Central Auth Service - Deployment"
echo "=========================================="

# Check if running as azureuser
if [ "$USER" != "azureuser" ]; then
    echo "Warning: This script should be run as azureuser"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Navigate to app directory
cd $APP_DIR

# Pull latest code (if using git)
# git pull origin main

# Install dependencies
echo "Installing dependencies..."
npm ci --production

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Generate keys if they don't exist
if [ ! -f "keys/private.pem" ] || [ ! -f "keys/public.pem" ]; then
    echo "Generating RSA key pair..."
    npm run generate-keys
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found!"
    echo "Please create .env file from .env.example"
    exit 1
fi

# Restart PM2 service
echo "Restarting PM2 service..."
pm2 restart $SERVICE_NAME || pm2 start dist/app.js --name $SERVICE_NAME

# Save PM2 configuration
pm2 save

# Show status
pm2 status

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Service status: pm2 status"
echo "View logs: pm2 logs $SERVICE_NAME"
echo "Monitor: pm2 monit"
