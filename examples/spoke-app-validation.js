/**
 * Example: JWT Validation in Spoke Application
 * 
 * This example shows how a spoke application can validate JWTs
 * issued by the Central Authorization Service.
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Configuration - Update to match your Central Auth Service
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
});

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
 * Express middleware example
 */
function authenticateJWT(req, res, next) {
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

  verifyToken(token)
    .then((decoded) => {
      // Attach user info to request
      req.user = decoded;
      console.log(`[AUTH] Authentication successful for user: ${decoded.email}`);
      next();
    })
    .catch((err) => {
      console.error('[AUTH] Token verification failed:', err.message);
      console.error('[AUTH] Error type:', err.name);
      res.status(401).json({ error: 'Invalid or expired token', details: err.message });
    });
}

/**
 * Example route using the middleware
 */
// app.get('/protected', authenticateJWT, (req, res) => {
//   res.json({
//     message: 'Protected resource',
//     user: req.user,
//   });
// });

/**
 * Example: Check user roles
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
 * Example: Check user groups
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

module.exports = {
  verifyToken,
  authenticateJWT,
  requireRole,
  requireGroup,
};
