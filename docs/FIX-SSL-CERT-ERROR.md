# Fix: SSL Certificate Error (ENOENT)

## Error Message

```
Error: ENOENT: no such file or directory, open './certs/key.pem'
Falling back to HTTP...
```

## Quick Fix

The service is working (running on HTTP), but you're seeing error logs. Here are two ways to fix it:

### Option 1: Disable HTTPS (Recommended for Production with Nginx)

If you're using Nginx as a reverse proxy with SSL termination (recommended), disable HTTPS in the app:

**On your VM:**
```bash
cd ~/central-auth
nano .env
```

**Set:**
```env
HTTPS_ENABLED=false
```

**Or comment out SSL paths:**
```env
# SSL_KEY_PATH=./certs/key.pem
# SSL_CERT_PATH=./certs/cert.pem
```

**Restart:**
```bash
pm2 restart central-auth
pm2 logs central-auth
```

The error will disappear and you'll see:
```
Central Auth Service running on HTTP port 3000
HTTPS: disabled
```

### Option 2: Pull Latest Code (Fixes the Error Check)

The latest code checks if certificates exist before trying to read them. Pull and rebuild:

**On your VM:**
```bash
cd ~/central-auth

# Pull latest code
git pull origin main

# Rebuild
npm run build

# Restart
pm2 restart central-auth

# Check logs
pm2 logs central-auth --lines 20
```

After this, you'll see cleaner warnings instead of errors:
```
⚠️  SSL key file not found: ./certs/key.pem
⚠️  SSL cert file not found: ./certs/cert.pem
Central Auth Service running on HTTP port 3000
HTTPS: enabled but certificates not found
```

### Option 3: Generate SSL Certificates (For Local HTTPS)

If you want HTTPS directly in the app (not recommended for production):

```bash
cd ~/central-auth

# Generate self-signed certificates
bash scripts/generate-ssl-cert.sh

# Restart
pm2 restart central-auth
```

## Recommended Setup for Production

For production, use **Nginx with Let's Encrypt**:

1. **App runs on HTTP** (port 3000) - no SSL needed
2. **Nginx handles SSL** (port 443) - uses Let's Encrypt certificates
3. **Nginx proxies** to app on localhost:3000

This is more secure and standard practice.

## Verify Fix

After applying the fix:

```bash
# Check logs (should be clean)
pm2 logs central-auth --lines 10

# Test service
curl http://localhost:3000/health

# Should return: {"status":"ok","timestamp":"..."}
```

## Summary

- **Error is harmless** - service works on HTTP
- **Quick fix**: Set `HTTPS_ENABLED=false` in `.env`
- **Better fix**: Pull latest code (has improved error handling)
- **Production**: Use Nginx with Let's Encrypt for SSL
