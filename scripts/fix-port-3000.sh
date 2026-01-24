#!/bin/bash

# Fix Port 3000 Already in Use Error
# This script helps identify and resolve port 3000 conflicts

echo "=========================================="
echo "Port 3000 Conflict Resolution"
echo "=========================================="
echo ""

# Check what's using port 3000
echo "1. Checking what's using port 3000..."
echo "----------------------------------------"
if command -v lsof &> /dev/null; then
    sudo lsof -i :3000
elif command -v netstat &> /dev/null; then
    sudo netstat -tlnp | grep 3000
elif command -v ss &> /dev/null; then
    sudo ss -tlnp | grep 3000
else
    echo "No port checking tool found. Install lsof, netstat, or ss."
fi
echo ""

# Check PM2 processes
echo "2. Checking PM2 processes..."
echo "----------------------------------------"
if command -v pm2 &> /dev/null; then
    pm2 list
    echo ""
    echo "PM2 processes using port 3000:"
    pm2 list | grep -E "central-auth|3000" || echo "No PM2 processes found"
else
    echo "PM2 not found"
fi
echo ""

# Provide options
echo "3. Resolution Options:"
echo "----------------------------------------"
echo ""
echo "Option A: Stop all PM2 processes and restart"
echo "  pm2 delete all"
echo "  pm2 start dist/app.js --name central-auth"
echo ""
echo "Option B: Stop specific process"
echo "  pm2 stop central-auth"
echo "  pm2 delete central-auth"
echo "  pm2 start dist/app.js --name central-auth"
echo ""
echo "Option C: Kill process by PID (from step 1)"
echo "  sudo kill -9 <PID>"
echo ""
echo "Option D: Use PM2 ecosystem config"
echo "  pm2 delete central-auth"
echo "  pm2 start deploy/pm2-ecosystem.config.js"
echo ""

# Ask if user wants to proceed
read -p "Do you want to stop all PM2 processes and restart? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Stopping all PM2 processes..."
    pm2 delete all 2>/dev/null || true
    
    echo "Waiting 2 seconds..."
    sleep 2
    
    echo "Starting central-auth service..."
    cd /home/azureuser/central-auth || cd ~/central-auth
    pm2 start dist/app.js --name central-auth
    pm2 save
    
    echo ""
    echo "Checking status..."
    pm2 status
    
    echo ""
    echo "Checking if port 3000 is now free..."
    sleep 1
    if sudo lsof -i :3000 &> /dev/null; then
        echo "✅ Port 3000 is in use (service should be running)"
    else
        echo "⚠️  Port 3000 is free (service might not have started)"
    fi
    
    echo ""
    echo "View logs: pm2 logs central-auth"
fi

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="
