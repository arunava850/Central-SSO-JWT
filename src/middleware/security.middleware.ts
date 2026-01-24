import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

/**
 * HTTPS enforcement middleware
 */
export function enforceHTTPS(req: Request, res: Response, next: NextFunction): void {
  if (config.httpsEnabled && req.protocol !== 'https' && req.get('x-forwarded-proto') !== 'https') {
    // In production, redirect to HTTPS
    if (process.env.NODE_ENV === 'production') {
      return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    // In development, warn but allow
    console.warn('Warning: Request not using HTTPS');
  }
  next();
}

/**
 * CORS middleware with allowlist
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowlist
    if (config.allowedOrigins.includes(origin) || 
        config.allowedOrigins.includes('*') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

/**
 * Rate limiting middleware
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security headers middleware
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
