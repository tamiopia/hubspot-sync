import { createApp } from './app';
import { env } from './config/env';
import { pool } from './config/db';
import { redis } from './config/redis';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Hubspot-Sync Backend running on http://localhost:${env.PORT}`);
  console.log(`📦 Environment: ${env.NODE_ENV}`);
});

// Graceful Shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);

  server.close(async () => {
    console.log('HTTP server closed.');

    try {
      await redis.quit();
      console.log('Redis connection closed.');
    } catch (err) {
      console.error('Error closing Redis connection:', err);
    }

    try {
      await pool.end();
      console.log('PostgreSQL pool drained.');
    } catch (err) {
      console.error('Error draining PostgreSQL pool:', err);
    }

    process.exit(0);
  });

  // Force shutdown after 10s if dangling handles remain
  setTimeout(() => {
    console.error('Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
