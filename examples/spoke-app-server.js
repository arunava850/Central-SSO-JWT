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
const CENTRAL_AUTH_URL = 'https://localhost:3000';
const CENTRAL_AUTH_JWKS_URL = 'https://localhost:3000/.well-known/jwks.json';
const EXPECTED_ISSUER = 'https://localhost:3000';
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
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verify and decode JWT token
 */
function verifyToken(token) {
  return new Promise((resolve, reject) => {
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
          return reject(err);
        }
        resolve(decoded);
      }
    );
  });
}

/**
 * JWT Authentication Middleware
 */
async function authenticateJWT(req, res, next) {
  // Get token from query parameter (from redirect)
  let token = req.query.token;
  
  // Or from Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = await verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired token', details: err.message });
  }
}

/**
 * Check user roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Check user groups
 */
function requireGroup(...groups) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userGroups = req.user.groups || [];
    const hasGroup = groups.some(group => userGroups.includes(group));

    if (!hasGroup) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Routes

// Serve the HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'spoke-app-redirect.html'));
});

// Callback endpoint - receives token from Central Auth
app.get('/auth/callback', (req, res) => {
  const token = req.query.token;
  const state = req.query.state;

  if (!token) {
    return res.status(400).json({ error: 'No token received' });
  }

  // Redirect to main page with token
  res.redirect(`/?token=${token}&state=${state}`);
});

// Protected API endpoint - requires valid JWT
app.get('/api/me', authenticateJWT, (req, res) => {
  const provider = req.user.tenant === 'google' ? 'Google' : 'Microsoft';
  
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
  res.json({
    message: 'Admin-only resource',
    user: req.user
  });
});

// Protected endpoint with group requirement
app.get('/api/finance', authenticateJWT, requireGroup('Finance'), (req, res) => {
  res.json({
    message: 'Finance group resource',
    user: req.user
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'spoke-app',
    centralAuthUrl: CENTRAL_AUTH_URL
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
