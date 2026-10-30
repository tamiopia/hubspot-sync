import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ENCRYPTION_KEY: z
    .string()
    .min(32, 'ENCRYPTION_KEY must be at least 32 characters or 64 hex characters'),
  HUBSPOT_CLIENT_ID: z.string().default('mock_hubspot_client_id'),
  HUBSPOT_CLIENT_SECRET: z.string().default('mock_hubspot_client_secret'),
  HUBSPOT_REDIRECT_URI: z
    .string()
    .default('http://localhost:4000/auth/hubspot/callback'),
  WIX_APP_ID: z.string().default('mock_wix_app_id'),
  WIX_APP_SECRET: z.string().default('mock_wix_app_secret'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
