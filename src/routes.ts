import { Router } from 'express';
import { login } from './auth/login.controller';
import { callback } from './auth/callback.controller';
import { logout, simpleLogout } from './auth/logout.controller';
import { exchangeToken, refreshToken } from './auth/token.controller';
import { passwordToken } from './auth/password.controller';
import { signupStart, signupComplete, signupVerifyOtp, signupSubmitPassword } from './auth/signup.controller';
import { passwordResetStart, passwordResetVerifyOtp, passwordResetSubmitPassword } from './auth/password-reset.controller';
import { getJWKS } from './jwt/jwks.controller';
import { authRateLimit, apiRateLimit } from './middleware/security.middleware';
import { verifyToken } from './middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/auth/login', authRateLimit, login);
router.get('/auth/callback', authRateLimit, callback);
router.get('/auth/logout', logout);
router.get('/auth/logout/simple', simpleLogout);
router.post('/auth/token/exchange', apiRateLimit, exchangeToken);
router.post('/auth/token/refresh', apiRateLimit, refreshToken);
router.post('/auth/token/password', apiRateLimit, passwordToken);
router.post('/auth/signup/start', apiRateLimit, signupStart);
router.post('/auth/signup/verify-otp', apiRateLimit, signupVerifyOtp);
router.post('/auth/signup/submit-password', apiRateLimit, signupSubmitPassword);
router.post('/auth/signup/complete', apiRateLimit, signupComplete);
router.post('/auth/password-reset/start', apiRateLimit, passwordResetStart);
router.post('/auth/password-reset/verify-otp', apiRateLimit, passwordResetVerifyOtp);
router.post('/auth/password-reset/submit-password', apiRateLimit, passwordResetSubmitPassword);
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
