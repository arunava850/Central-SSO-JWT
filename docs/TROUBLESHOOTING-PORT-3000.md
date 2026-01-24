# Troubleshooting: Port 3000 Already in Use

## Error Message

```
errno: -98,
syscall: 'listen',
address: '::',
port: 3000
```

**Error -98** = `EADDRINUSE` - Port 3000 is already being used by another process.

## Quick Fix

### Step 1: Check What's Using Port 3000

```bash
# Option 1: Using lsof
sudo lsof -i :3000

# Option 2: Using netstat
sudo netstat -tlnp | grep 3000

# Option 3: Using ss
sudo ss -tlnp | grep 3000

# Option 4: Using fuser
sudo fuser 3000/tcp
```

### Step 2: Stop the Conflicting Process

**If it's another PM2 instance:**
```bash
# List all PM2 processes
pm2 list

# Stop the conflicting process
pm2 stop <process-name>
# or
pm2 delete <process-name>

# Or stop all PM2 processes
pm2 stop all
```

**If it's a different process:**
```bash
# Kill the process using the PID from Step 1
sudo kill -9 <PID>

# Or using fuser
sudo fuser -k 3000/tcp
```

### Step 3: Restart Your Service

```bash
# Restart your central-auth service
pm2 restart central-auth

# Or start it if it's not running
pm2 start dist/app.js --name central-auth
```

## Alternative Solutions

### Option 1: Change the Port

If you can't free port 3000, change your application port:

**1. Update `.env` file:**
```env
PORT=3001
# or any other available port
```

**2. Update PM2 ecosystem config** (if using):
```javascript
// deploy/pm2-ecosystem.config.js
module.exports = {
  apps: [{
    name: 'central-auth',
    script: './dist/app.js',
    env: {
      PORT: 3001
    }
  }]
}
```

**3. Restart PM2:**
```bash
pm2 restart central-auth
# or
pm2 delete central-auth
pm2 start deploy/pm2-ecosystem.config.js
```

### Option 2: Use PM2 Ecosystem Config

Create/update `deploy/pm2-ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'central-auth',
    script: './dist/app.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/central-auth/error.log',
    out_file: '/var/log/central-auth/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
}
```

Then start with:
```bash
pm2 start deploy/pm2-ecosystem.config.js
pm2 save
```

## Common Scenarios

### Scenario 1: Multiple PM2 Instances

**Problem:** You started the service multiple times.

**Solution:**
```bash
# List all processes
pm2 list

# Delete all instances
pm2 delete all

# Start fresh
pm2 start dist/app.js --name central-auth
pm2 save
```

### Scenario 2: Previous Process Not Stopped

**Problem:** A previous instance is still running.

**Solution:**
```bash
# Find and kill the process
sudo lsof -i :3000
sudo kill -9 <PID>

# Or use PM2
pm2 delete central-auth
pm2 start dist/app.js --name central-auth
```

### Scenario 3: Another Application Using Port 3000

**Problem:** Another service (Node.js app, Docker container, etc.) is using port 3000.

**Solution:**
```bash
# Identify the process
sudo lsof -i :3000

# If it's another Node.js app, stop it
# If it's Docker, stop the container
docker ps
docker stop <container-id>

# If it's a system service, stop it
sudo systemctl stop <service-name>
```

### Scenario 4: Port Reserved by System

**Problem:** Port might be reserved or in a TIME_WAIT state.

**Solution:**
```bash
# Wait a few seconds for TIME_WAIT to clear
sleep 5

# Try starting again
pm2 restart central-auth

# Or change to a different port (see Option 1 above)
```

## Verification Steps

**1. Check if port is free:**
```bash
sudo lsof -i :3000
# Should return nothing if port is free
```

**2. Check PM2 status:**
```bash
pm2 status
# Should show central-auth as "online"
```

**3. Check PM2 logs:**
```bash
pm2 logs central-auth
# Should show no errors about port binding
```

**4. Test the service:**
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}
```

## Prevention

**1. Always stop PM2 processes before restarting:**
```bash
pm2 stop central-auth
pm2 start dist/app.js --name central-auth
```

**2. Use PM2 ecosystem config for better management:**
```bash
pm2 start deploy/pm2-ecosystem.config.js
pm2 save
```

**3. Check for existing processes before starting:**
```bash
# Before starting, check if port is in use
if sudo lsof -i :3000 > /dev/null 2>&1; then
    echo "Port 3000 is in use. Stopping existing process..."
    pm2 delete central-auth 2>/dev/null || true
fi

pm2 start dist/app.js --name central-auth
```

## Using a Different Port (Recommended for Production)

For production, it's recommended to:
1. Run the app on a non-standard port (e.g., 3000 internally)
2. Use Nginx as reverse proxy on port 80/443
3. This allows multiple apps and better security

**Example Nginx config:**
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
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Still Having Issues?

1. **Check system logs:**
   ```bash
   sudo journalctl -xe
   ```

2. **Check PM2 logs:**
   ```bash
   pm2 logs central-auth --lines 50
   ```

3. **Restart PM2 daemon:**
   ```bash
   pm2 kill
   pm2 resurrect
   ```

4. **Check firewall:**
   ```bash
   sudo ufw status
   sudo ufw allow 3000/tcp
   ```
