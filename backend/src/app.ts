import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { NotFoundError } from './utils/errors';
import oauthRoutes from './routes/oauthRoutes';
import webhookRoutes from './routes/webhookRoutes';
import mappingRoutes from './routes/mappingRoutes';

export const createApp = (): Application => {
  const app: Application = express();

  // Security Middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-wix-instance-id'],
    })
  );

  // Request Body Parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Request Logger
  app.use((req: Request, _res: Response, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });

  // Health Check Endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'hubspot-sync-backend',
      environment: env.NODE_ENV,
    });
  });

  // Fallback root POST handler for Wix webhooks configured without subpath
  app.post('/', (req: Request, res: Response, next) => {
    const { handleWixWebhook } = require('./controllers/webhookController');
    handleWixWebhook(req, res, next);
  });

  // OAuth Authentication Routes
  app.use('/auth', oauthRoutes);

  // Webhook Event Routes
  app.use('/webhooks', webhookRoutes);

  // Field Mapping Dashboard REST API
  app.use('/api/mappings', mappingRoutes);

  // 404 Catch-All Route
  app.use((_req: Request, _res: Response) => {
    throw new NotFoundError('API endpoint not found');
  });

  // Global Centralized Error Handler
  app.use(errorHandler);

  return app;
};
