/**
 * Test Spoke Application Server
 * 
 * This is a simple Express server that demonstrates how a spoke application
 * integrates with the Central Authorization Service.
 * 
 * Usage: node examples/spoke-app-server.js
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const path = require('path');

const app = express();
const PORT = 3001;

// Configuration - Update these to match your Central Auth Service
const CENTRAL_AUTH_URL = 'https://auth.ainsemble.com';
const CENTRAL_AUTH_JWKS_URL = 'https://auth.ainsemble.com/.well-known/jwks.json';
const EXPECTED_ISSUER = 'https://auth.ainsemble.com';
const EXPECTED_AUDIENCE = 'spoke-applications';

// Initialize JWKS client
const client = jwksClient({
  jwksUri: CENTRAL_AUTH_JWKS_URL,
  cache: true,
  cacheMaxAge: 3600000, // 1 hour
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  // For self-signed certificates, disable SSL verification
  requestAgent: new (require('https').Agent)({
    rejectUnauthorized: false
  })
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/**
 * Get signing key from JWKS endpoint
 */
function getKey(header, callback) {
  console.log(`[JWKS] Fetching signing key for kid: ${header.kid}`);
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error(`[JWKS] Failed to get signing key for kid ${header.kid}:`, err.message);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    console.log(`[JWKS] Successfully retrieved signing key for kid: ${header.kid}`);
    callback(null, signingKey);
  });
}

/**
 * Verify and decode JWT token
 */
function verifyToken(token) {
  return new Promise((resolve, reject) => {
    console.log('[JWT] Verifying token...');
    const tokenPreview = token.substring(0, 20) + '...';
    console.log(`[JWT] Token preview: ${tokenPreview}`);
    
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: EXPECTED_ISSUER,
        audience: EXPECTED_AUDIENCE,
      },
      (err, decoded) => {
        if (err) {
          console.error('[JWT] Token verification failed:', err.message);
          console.error('[JWT] Error details:', {
            name: err.name,
            message: err.message,
            expectedIssuer: EXPECTED_ISSUER,
            expectedAudience: EXPECTED_AUDIENCE
          });
          return reject(err);
        }
        console.log('[JWT] Token verified successfully');
        console.log('[JWT] Decoded token:', {
          sub: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          roles: decoded.roles,
          groups: decoded.groups,
          tenant: decoded.tenant,
          iat: new Date(decoded.iat * 1000).toISOString(),
          exp: new Date(decoded.exp * 1000).toISOString()
        });
        resolve(decoded);
      }
    );
  });
}

/**
 * JWT Authentication Middleware
 */
async function authenticateJWT(req, res, next) {
  const timestamp = new Date().toISOString();
  console.log(`[AUTH] ${timestamp} - ${req.method} ${req.path}`);
  console.log(`[AUTH] IP: ${req.ip || req.connection.remoteAddress}`);
  
  // Get token from query parameter (from redirect)
  let token = req.query.token;
  let tokenSource = 'query';
  
  // Or from Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1];
      tokenSource = 'header';
    }
  }

  if (!token) {
    console.warn('[AUTH] No token provided');
    console.log('[AUTH] Available sources:', {
      queryToken: !!req.query.token,
      hasAuthHeader: !!req.headers.authorization
    });
    return res.status(401).json({ error: 'No token provided' });
  }

  console.log(`[AUTH] Token found in ${tokenSource}`);
  
  try {
    const decoded = await verifyToken(token);
    req.user = decoded;
    console.log(`[AUTH] Authentication successful for user: ${decoded.email}`);
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    console.error('[AUTH] Error type:', err.name);
    res.status(401).json({ error: 'Invalid or expired token', details: err.message });
  }
}

/**
 * Check user roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      console.warn('[ROLE] Authentication required but user not found');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    console.log(`[ROLE] Checking roles for ${req.user.email}:`, {
      required: roles,
      userRoles: userRoles,
      hasRole: hasRole
    });

    if (!hasRole) {
      console.warn(`[ROLE] Access denied for ${req.user.email}: missing required role(s) ${roles.join(', ')}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    console.log(`[ROLE] Access granted for ${req.user.email}`);
    next();
  };
}

/**
 * Check user groups
 */
function requireGroup(...groups) {
  return (req, res, next) => {
    if (!req.user) {
      console.warn('[GROUP] Authentication required but user not found');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userGroups = req.user.groups || [];
    const hasGroup = groups.some(group => userGroups.includes(group));

    console.log(`[GROUP] Checking groups for ${req.user.email}:`, {
      required: groups,
      userGroups: userGroups,
      hasGroup: hasGroup
    });

    if (!hasGroup) {
      console.warn(`[GROUP] Access denied for ${req.user.email}: missing required group(s) ${groups.join(', ')}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    console.log(`[GROUP] Access granted for ${req.user.email}`);
    next();
  };
}

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[REQUEST] ${timestamp} - ${req.method} ${req.path} - IP: ${req.ip || req.connection.remoteAddress}`);
  next();
});

// Routes

// Serve the HTML page
app.get('/', (req, res) => {
  console.log('[ROUTE] Serving main page');
  res.sendFile(path.join(__dirname, 'spoke-app-redirect.html'));
});

// Callback endpoint - receives token from Central Auth
app.get('/auth/callback', (req, res) => {
  console.log('[CALLBACK] Received callback from Central Auth');
  const token = req.query.token;
  const state = req.query.state;

  console.log('[CALLBACK] Query parameters:', {
    hasToken: !!token,
    hasState: !!state,
    tokenPreview: token ? token.substring(0, 20) + '...' : 'none'
  });

  if (!token) {
    console.error('[CALLBACK] No token received in callback');
    return res.status(400).json({ error: 'No token received' });
  }

  console.log('[CALLBACK] Redirecting to main page with token');
  // Redirect to main page with token
  res.redirect(`/?token=${token}&state=${state}`);
});

// Protected API endpoint - requires valid JWT
app.get('/api/me', authenticateJWT, (req, res) => {
  const provider = req.user.tenant === 'google' ? 'Google' : 'Microsoft';
  
  console.log(`[API] /api/me accessed by ${req.user.email} (${provider})`);
  
  res.json({
    message: 'Protected resource accessed successfully',
    provider: provider,
    user: {
      id: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      roles: req.user.roles,
      groups: req.user.groups,
      tenant: req.user.tenant,
    },
    tokenInfo: {
      issuedAt: new Date(req.user.iat * 1000).toISOString(),
      expiresAt: new Date(req.user.exp * 1000).toISOString(),
    }
  });
});

// Protected endpoint with role requirement
app.get('/api/admin', authenticateJWT, requireRole('Admin'), (req, res) => {
  console.log(`[API] /api/admin accessed by ${req.user.email}`);
  res.json({
    message: 'Admin-only resource',
    user: req.user
  });
});

// Protected endpoint with group requirement
app.get('/api/finance', authenticateJWT, requireGroup('Finance'), (req, res) => {
  console.log(`[API] /api/finance accessed by ${req.user.email}`);
  res.json({
    message: 'Finance group resource',
    user: req.user
  });
});

// Logout endpoint
app.get('/logout', (req, res) => {
  console.log('[LOGOUT] Logout requested');
  
  // Option 1: Simple logout (just clear session)
  // req.session.destroy();
  // res.clearCookie('auth_token');
  // res.redirect('/');
  
  // Option 2: Full logout (clear IdP session via Central Auth)
  const postLogoutUrl = encodeURIComponent(`${req.protocol}://${req.get('host')}/`);
  const provider = req.query.provider || 'microsoft';
  const logoutUrl = `${CENTRAL_AUTH_URL}/auth/logout?post_logout_redirect_uri=${postLogoutUrl}&provider=${provider}`;
  
  console.log('[LOGOUT] Redirecting to Central Auth logout:', logoutUrl);
  res.redirect(logoutUrl);
});

// Health check
app.get('/health', (req, res) => {
  console.log('[HEALTH] Health check requested');
  res.json({ 
    status: 'ok',
    service: 'spoke-app',
    centralAuthUrl: CENTRAL_AUTH_URL,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('==========================================');
  console.log('Spoke Application Server');
  console.log('==========================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Central Auth URL: ${CENTRAL_AUTH_URL}`);
  console.log(`JWKS URL: ${CENTRAL_AUTH_JWKS_URL}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  - Main page: http://localhost:${PORT}/`);
  console.log(`  - Callback: http://localhost:${PORT}/auth/callback`);
  console.log(`  - Protected API: http://localhost:${PORT}/api/me`);
  console.log(`  - Health: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Open http://localhost:3001 in your browser to test!');
});
