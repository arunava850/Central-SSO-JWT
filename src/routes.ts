import { Router } from 'express';
import { login } from './auth/login.controller';
import { callback } from './auth/callback.controller';
import { logout, simpleLogout } from './auth/logout.controller';
import { getJWKS } from './jwt/jwks.controller';
import { authRateLimit, apiRateLimit } from './middleware/security.middleware';
import { verifyToken } from './middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/auth/login', authRateLimit, login);
router.get('/auth/callback', authRateLimit, callback);
router.get('/auth/logout', logout);
router.get('/auth/logout/simple', simpleLogout);
router.get('/.well-known/jwks.json', apiRateLimit, getJWKS);

// Protected routes (example)
router.get('/auth/me', apiRateLimit, verifyToken, (req, res) => {
  res.json({ user: (req as any).user });
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
