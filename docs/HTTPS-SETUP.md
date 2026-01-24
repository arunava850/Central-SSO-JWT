# HTTPS Setup Complete ✅

## Summary

The Central Auth Service is now running with HTTPS support using self-signed SSL certificates for local development.

## What Was Done

### 1. SSL Certificate Generation
- Generated self-signed SSL certificate using OpenSSL
- Certificate files created:
  - `./certs/key.pem` - Private key
  - `./certs/cert.pem` - Certificate
- Certificate valid for 365 days
- Includes Subject Alternative Names (SAN) for:
  - `localhost`
  - `*.localhost`
  - `127.0.0.1`
  - `::1` (IPv6)

### 2. Code Updates
- **`src/config/index.ts`**: Added `sslKeyPath` and `sslCertPath` to configuration
- **`src/app.ts`**: Updated to support HTTPS server with SSL certificates
  - Automatically detects SSL certificates from environment
  - Falls back to HTTP if certificates are missing or invalid
  - Uses Node.js `https` module when certificates are available

### 3. Environment Configuration
- Updated `.env` file with SSL certificate paths:
  ```env
  SSL_KEY_PATH=./certs/key.pem
  SSL_CERT_PATH=./certs/cert.pem
  ```

### 4. Security
- Added `certs/` directory to `.gitignore` to prevent committing certificates

## Test Results

✅ **Health Endpoint**: `https://localhost:3000/health` - HTTP 200
✅ **JWKS Endpoint**: `https://localhost:3000/.well-known/jwks.json` - HTTP 200
✅ **Login Endpoint**: `https://localhost:3000/auth/login` - HTTP 400 (validation working)
✅ **Server Running**: HTTPS server listening on port 3000

## Testing

### Quick Test
```bash
# Test health endpoint
curl -k https://localhost:3000/health

# Test JWKS endpoint
curl -k https://localhost:3000/.well-known/jwks.json

# Run comprehensive test script
bash scripts/test-https.sh
```

### Browser Testing
1. Navigate to `https://localhost:3000/health`
2. Browser will show security warning (expected for self-signed certificate)
3. Click "Advanced" → "Proceed to localhost" (or similar)
4. You should see the health check response

## Certificate Details

- **Subject**: `C=US, ST=State, L=City, O=Central Auth, CN=localhost`
- **Issuer**: `C=US, ST=State, L=City, O=Central Auth, CN=localhost` (self-signed)
- **Valid for**: 365 days
- **Key Size**: 4096 bits RSA

## Important Notes

⚠️ **Self-Signed Certificate Warning**
- This certificate is for **local development only**
- Browsers will show security warnings (this is expected)
- For production, use valid SSL certificates from:
  - Let's Encrypt (free)
  - Commercial CA (DigiCert, GlobalSign, etc.)
  - Your organization's internal CA

## Production Deployment

For production, use one of these options:

### Option 1: Let's Encrypt (Recommended)
```bash
# On your Linux VM
sudo certbot --nginx -d your-domain.com
```

### Option 2: Commercial Certificate
1. Purchase SSL certificate from a trusted CA
2. Update `.env`:
   ```env
   SSL_KEY_PATH=/path/to/private.key
   SSL_CERT_PATH=/path/to/certificate.crt
   ```

### Option 3: Load Balancer / Reverse Proxy
- Use nginx or a load balancer (AWS ALB, Azure Application Gateway) for SSL termination
- Application runs on HTTP internally
- See `deploy/nginx.conf` for nginx configuration

## Regenerating Certificates

If you need to regenerate certificates:

```bash
bash scripts/generate-ssl-cert.sh
```

Then restart the application.

## Troubleshooting

### Certificate Errors
If you see certificate errors:
1. Verify certificate files exist: `ls -la certs/`
2. Check file permissions: `chmod 600 certs/key.pem`
3. Verify paths in `.env` are correct

### Port Already in Use
```bash
# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### HTTPS Not Starting
- Check `.env` has `HTTPS_ENABLED=true`
- Verify `SSL_KEY_PATH` and `SSL_CERT_PATH` are set
- Check application logs for errors

## Files Created/Modified

- ✅ `scripts/generate-ssl-cert.sh` - Certificate generation script
- ✅ `scripts/test-https.sh` - HTTPS testing script
- ✅ `certs/key.pem` - Private key (gitignored)
- ✅ `certs/cert.pem` - Certificate (gitignored)
- ✅ `src/config/index.ts` - Added SSL config
- ✅ `src/app.ts` - Added HTTPS server support
- ✅ `.env` - Added SSL certificate paths
- ✅ `.gitignore` - Added certs/ directory

## Next Steps

1. ✅ HTTPS is working - Application is accessible via HTTPS
2. Test OAuth flow with HTTPS endpoints
3. Update spoke applications to use HTTPS URLs
4. For production: Replace self-signed certificates with valid certificates
