# Central Authorization Service

A production-ready Central Authorization Service that authenticates users via Microsoft Entra ID and issues RS256-signed JWTs to trusted spoke applications.

## Features

- ✅ Microsoft Entra ID (Azure AD) authentication via OAuth2 Authorization Code Flow
- ✅ PKCE (Proof Key for Code Exchange) for enhanced security
- ✅ RS256-signed JWTs with user identity, roles, and groups
- ✅ JWKS endpoint for JWT verification by spoke applications
- ✅ Multiple redirect URI support (different domains + localhost)
- ✅ CORS allowlist configuration
- ✅ HTTPS enforcement
- ✅ Rate limiting
- ✅ Security headers (Helmet)
- ✅ Role and group-based authorization middleware
- ✅ Production-ready deployment scripts for Linux VMs

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ Spoke App 1 │────────▶│ Central Auth │────────▶│ Entra ID    │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              │ Issues JWT
                              ▼
                        ┌─────────────┐
                        │ Spoke App 2 │
                        └─────────────┘
```

### Authentication Flow

1. Spoke app redirects unauthenticated user to `/auth/login?client_id=xxx&redirect_uri=xxx`
2. Central Auth redirects to Entra ID login page (with PKCE, state, nonce)
3. User authenticates with Entra ID
4. Entra ID redirects back to Central Auth `/auth/callback` with authorization code
5. Central Auth:
   - Exchanges code for access token
   - Fetches user profile, roles, and groups from Microsoft Graph API
   - Generates RS256-signed JWT with user claims
   - Redirects back to spoke app with JWT token
6. Spoke app validates JWT using JWKS endpoint `/.well-known/jwks.json`

## 🚀 Quick Start for Developers

**Want to integrate your app with Central Auth?**

👉 **[Start with the Integration Guide](./docs/INTEGRATION-GUIDE.md)** - Complete step-by-step guide  
👉 **[Quick Start (5 minutes)](./INTEGRATION-QUICK-START.md)** - Fast integration guide

**Key Information:**
- **Central Auth URL:** `https://auth.ainsemble.com`
- **JWKS Endpoint:** `https://auth.ainsemble.com/.well-known/jwks.json`
- **Issuer:** `https://auth.ainsemble.com`
- **Audience:** `spoke-applications`

## Prerequisites

- Node.js 20.x LTS or higher
- npm 9.x or higher
- Microsoft Entra ID tenant
- Registered application in Entra ID (see setup instructions below)

## Quick Start

### 1. Clone and Install

```bash
cd central-auth
npm install
```

### 2. Generate RSA Key Pair

```bash
npm run generate-keys
```

This creates `keys/private.pem` and `keys/public.pem`. **Keep these secure!**

### 3. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your Entra ID credentials and configuration.

### 4. Build

```bash
npm run build
```

### 5. Run

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## Microsoft Entra ID App Registration

### Step 1: Register Application

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click "New registration"
3. Name: `Central Auth Service`
4. Supported account types: Choose based on your needs
5. Redirect URI: `https://your-domain.com/auth/callback` (Web platform)
6. Click "Register"

### Step 2: Configure API Permissions

1. Go to "API permissions"
2. Add permissions:
   - Microsoft Graph → Delegated permissions:
     - `openid`
     - `profile`
     - `email`
     - `User.Read`
     - `GroupMember.Read.All`
     - `Directory.Read.All`
3. Click "Grant admin consent" (if you have permissions)

### Step 3: Create Client Secret

1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Description: `Central Auth Service Secret`
4. Expires: Choose expiration (recommend 24 months)
5. Click "Add"
6. **Copy the secret value immediately** (you won't see it again)
7. Add to your `.env` file as `CLIENT_SECRET`

### Step 4: Configure Redirect URIs

1. Go to "Authentication"
2. Under "Redirect URIs", add:
   - `https://your-domain.com/auth/callback`
   - `https://spoke-app1.com/auth/callback` (your spoke app callbacks)
   - `http://localhost:3000/auth/callback` (for local development)
3. Under "Implicit grant and hybrid flows", ensure "ID tokens" is checked
4. Click "Save"

### Step 5: Get Configuration Values

- **Tenant ID**: Found in "Overview" → "Tenant ID"
- **Client ID**: Found in "Overview" → "Application (client) ID"
- **Client Secret**: From Step 3

## Environment Configuration

### Required Variables

```env
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REDIRECT_URIS=https://spoke-app1.com/auth/callback,https://spoke-app2.com/auth/callback
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
```

### Optional Variables

```env
PORT=3000
BASE_URL=https://your-domain.com
HTTPS_ENABLED=true
JWT_EXPIRATION_MINUTES=15
ALLOWED_ORIGINS=https://spoke-app1.com,https://spoke-app2.com
```

## API Endpoints

### Public Endpoints

- `GET /auth/login?client_id=xxx&redirect_uri=xxx` - Initiate login
- `GET /auth/callback?code=xxx&state=xxx` - OAuth callback
- `GET /.well-known/jwks.json` - JWKS endpoint for JWT verification
- `GET /health` - Health check

### Protected Endpoints

- `GET /auth/me` - Get current user info (requires Bearer token)

## JWT Claims

The issued JWT contains the following claims:

```json
{
  "sub": "user_object_id",
  "email": "user@email.com",
  "name": "User Name",
  "roles": ["Admin", "Editor"],
  "groups": ["Finance", "HR"],
  "tenant": "entra-tenant-id",
  "iat": 1234567890,
  "exp": 1234568790,
  "iss": "https://your-domain.com",
  "aud": "spoke-applications"
}
```

## Spoke Application Integration

### 1. Redirect to Login

```javascript
const loginUrl = `https://central-auth.com/auth/login?client_id=spoke-app&redirect_uri=${encodeURIComponent('https://spoke-app.com/auth/callback')}`;
window.location.href = loginUrl;
```

### 2. Handle Callback

```javascript
// Extract token from callback URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

// Store token securely
localStorage.setItem('auth_token', token);
```

### 3. Validate JWT

See `examples/spoke-app-validation.js` for complete JWT validation code using JWKS.

## Linux VM Deployment

### Prerequisites

- Ubuntu 22.04 LTS VM
- SSH access with sudo privileges
- Domain name pointing to VM IP (for SSL)

### Step 1: Initial VM Setup

```bash
# On your local machine, copy setup script to VM
scp deploy/setup-vm.sh azureuser@your-vm-ip:/tmp/

# SSH into VM
ssh azureuser@your-vm-ip

# Run setup script (as root/sudo)
sudo bash /tmp/setup-vm.sh
```

### Step 2: Deploy Application

```bash
# On VM, create app directory
mkdir -p /home/azureuser/central-auth
cd /home/azureuser/central-auth

# Copy your code (using git, scp, or other method)
# git clone your-repo .
# OR
# scp -r /local/path/* azureuser@your-vm-ip:/home/azureuser/central-auth/

# Install dependencies
npm install

# Generate keys
npm run generate-keys

# Configure .env
nano .env  # Edit with your configuration

# Build
npm run build
```

### Step 3: Configure Nginx

```bash
# Copy nginx config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/central-auth

# Edit with your domain
sudo nano /etc/nginx/sites-available/central-auth

# Enable site
sudo ln -s /etc/nginx/sites-available/central-auth /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 4: Setup SSL with Let's Encrypt

```bash
# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### Step 5: Start Application with PM2

```bash
# Start with PM2
cd /home/azureuser/central-auth
pm2 start deploy/pm2-ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions shown

# View logs
pm2 logs central-auth
```

### Step 6: Verify Deployment

```bash
# Check service status
pm2 status

# Test endpoints
curl https://your-domain.com/health
curl https://your-domain.com/.well-known/jwks.json
```

## Security Best Practices

- ✅ **Never commit** `.env` files or private keys to version control
- ✅ Use **strong client secrets** and rotate them regularly
- ✅ Enable **HTTPS** in production (required for OAuth2)
- ✅ Use **PKCE** for all OAuth flows (already implemented)
- ✅ Validate **state parameter** to prevent CSRF (already implemented)
- ✅ Use **short JWT expiration** times (15 minutes default)
- ✅ Implement **rate limiting** (already implemented)
- ✅ Use **security headers** (Helmet already configured)
- ✅ Keep dependencies **up to date**: `npm audit` and `npm update`
- ✅ Monitor logs for suspicious activity
- ✅ Use **Redis** for session storage in production (replace in-memory Map)
- ✅ Implement **token revocation** if needed (consider refresh tokens)

## Troubleshooting

### Common Issues

**1. "Invalid redirect_uri" error**
- Ensure redirect URI is in both `.env` `REDIRECT_URIS` and Entra ID app registration

**2. "Failed to acquire token"**
- Verify `CLIENT_SECRET` is correct and not expired
- Check `TENANT_ID` and `CLIENT_ID` are correct

**3. "Token verification failed" in spoke app**
- Ensure JWKS endpoint is accessible: `https://your-domain.com/.well-known/jwks.json`
- Verify issuer and audience match in validation code

**4. "CORS error"**
- Add spoke app origin to `ALLOWED_ORIGINS` in `.env`

## Development

### Project Structure

```
central-auth/
├── src/
│   ├── auth/           # Authentication controllers
│   ├── jwt/            # JWT signing and JWKS
│   ├── config/         # Configuration management
│   ├── middleware/     # Security and auth middleware
│   ├── routes.ts       # Route definitions
│   └── app.ts          # Express app setup
├── docs/               # Documentation (see docs/README.md)
├── deploy/             # Deployment scripts
├── examples/           # Spoke app examples
├── scripts/            # Utility scripts
├── keys/               # RSA keys (gitignored)
└── dist/               # Compiled TypeScript
```

### Scripts

- `npm run build` - Compile TypeScript
- `npm start` - Run production build
- `npm run dev` - Run in development mode with hot reload
- `npm run generate-keys` - Generate RSA key pair

## License

MIT

## Support

For issues and questions, please open an issue in the repository.
