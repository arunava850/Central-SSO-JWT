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
 * Express middleware example
 */
function authenticateJWT(req, res, next) {
  // Get token from query parameter (from redirect)
  const token = req.query.token;
  
  // Or from Authorization header
  // const authHeader = req.headers.authorization;
  // const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  verifyToken(token)
    .then((decoded) => {
      // Attach user info to request
      req.user = decoded;
      next();
    })
    .catch((err) => {
      console.error('Token verification failed:', err);
      res.status(401).json({ error: 'Invalid or expired token' });
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
