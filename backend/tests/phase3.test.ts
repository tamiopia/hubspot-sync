import { createApp } from '../src/app';
import { acquireLock, isLocked } from '../src/utils/redisLock';
import { redis } from '../src/config/redis';

const runPhase3Verification = async () => {
  console.log('Testing Phase 3: Webhooks & Redis Loop Prevention...');

  // 1. Test Express Route Mounting
  console.log('Testing Webhook Express route mounting...');
  const app = createApp();
  const routes: string[] = [];

  // @ts-expect-error router stack inspection
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push(Object.keys(middleware.route.methods).join(',').toUpperCase() + ' ' + middleware.route.path);
    } else if (middleware.name === 'router') {
      const regexpStr = middleware.regexp.toString();
      let prefix = '';
      if (regexpStr.includes('auth')) prefix = '/auth';
      if (regexpStr.includes('webhooks')) prefix = '/webhooks';

      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          routes.push(Object.keys(handler.route.methods).join(',').toUpperCase() + ' ' + prefix + handler.route.path);
        }
      });
    }
  });

  console.log('Mounted routes list:', routes);

  const hasWixWebhook = routes.some((r) => r.includes('POST /webhooks/wix'));
  const hasHsWebhook = routes.some((r) => r.includes('POST /webhooks/hubspot'));

  if (!hasWixWebhook) {
    throw new Error('POST /webhooks/wix route is missing!');
  }
  if (!hasHsWebhook) {
    throw new Error('POST /webhooks/hubspot route is missing!');
  }

  console.log('✅ All Phase 3 webhook endpoints successfully registered and mounted!');

  // 2. Test Redis lock utility functions
  console.log('Testing Redis lock utility signature and resilience...');
  const testKey = `lock:wix_to_hs:test_contact_${Date.now()}`;
  const locked = await isLocked(testKey);
  console.log(`Initial lock check (resilience test without live Redis): ${locked}`);
  await acquireLock(testKey, 10);
  console.log('✅ acquireLock executed without throwing unhandled exceptions');

  // Disconnect Redis socket so test exits immediately
  redis.disconnect();
  console.log('✅ Phase 3 verification completed successfully!');
  process.exit(0);
};

runPhase3Verification().catch((err) => {
  console.error('Phase 3 verification failed:', err);
  redis.disconnect();
  process.exit(1);
});
