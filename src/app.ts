import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import https from 'https';
import http from 'http';
import { readFileSync } from 'fs';
import { config } from './config';
import routes from './routes';
import {
  enforceHTTPS,
  corsMiddleware,
  securityHeaders,
} from './middleware/security.middleware';

const app = express();

// Security middleware (order matters!)
app.use(securityHeaders);
app.use(enforceHTTPS);
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/', routes);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = config.port;

// Check if SSL certificates are provided
const useHTTPS = config.httpsEnabled && config.sslKeyPath && config.sslCertPath;

if (useHTTPS) {
  try {
    const httpsOptions = {
      key: readFileSync(config.sslKeyPath!),
      cert: readFileSync(config.sslCertPath!),
    };

    const server = https.createServer(httpsOptions, app);
    server.listen(PORT, () => {
      console.log(`Central Auth Service running on HTTPS port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`HTTPS: enabled (using SSL certificates)`);
      console.log(`JWKS endpoint: https://localhost:${PORT}/.well-known/jwks.json`);
      console.log(`⚠️  Using self-signed certificate - browsers will show security warning`);
    });
  } catch (error) {
    console.error('Failed to start HTTPS server:', error);
    console.error('Falling back to HTTP...');
    http.createServer(app).listen(PORT, () => {
      console.log(`Central Auth Service running on HTTP port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`HTTPS: disabled (certificate error)`);
    });
  }
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`Central Auth Service running on HTTP port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`HTTPS: ${config.httpsEnabled ? 'enabled but no certificates configured' : 'disabled'}`);
    console.log(`JWKS endpoint: http://localhost:${PORT}/.well-known/jwks.json`);
  });
}

export default app;
