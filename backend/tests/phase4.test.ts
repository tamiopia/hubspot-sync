import { createApp } from '../src/app';
import { fieldMappingItemSchema, saveMappingsSchema } from '../src/utils/validators';

const runPhase4Verification = async () => {
  console.log('Testing Phase 4: Field Mapping API...');

  // 1. Test Zod Schemas
  console.log('Validating Zod mapping schemas...');
  const validPayload = {
    wixInstanceId: 'instance-test-123',
    mappings: [
      { wixField: 'info.name.first', hsField: 'firstname', direction: 'bi' },
      { wixField: 'info.name.last', hsField: 'lastname', direction: 'wix_to_hs' },
      { wixField: 'info.emails.items.0.email', hsField: 'email', direction: 'bi' },
      { wixField: 'customFields.budget', hsField: 'annual_budget', direction: 'hs_to_wix' },
    ],
  };

  const parsed = saveMappingsSchema.safeParse(validPayload);
  if (!parsed.success) {
    throw new Error(`Valid mapping schema parsing failed: ${JSON.stringify(parsed.error)}`);
  }
  console.log('✅ Valid mapping schema successfully verified');

  // Negative test: invalid direction
  const invalidPayload = {
    wixInstanceId: 'instance-test-123',
    mappings: [
      { wixField: 'phone', hsField: 'phone', direction: 'invalid_direction' },
    ],
  };
  const invalidParsed = saveMappingsSchema.safeParse(invalidPayload);
  if (invalidParsed.success) {
    throw new Error('Expected invalid direction schema to fail validation');
  }
  console.log('✅ Invalid direction rejected as expected');

  // 2. Test Express App Route Mounting across all 4 phases
  console.log('Testing full application routing matrix across all 4 phases...');
  const app = createApp();
  const routes: string[] = [];

  // @ts-expect-error router stack inspection
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push(
        Object.keys(middleware.route.methods).join(',').toUpperCase() + ' ' + middleware.route.path
      );
    } else if (middleware.name === 'router') {
      const regexpStr = middleware.regexp.toString();
      let prefix = '';
      if (regexpStr.includes('auth')) prefix = '/auth';
      if (regexpStr.includes('webhooks')) prefix = '/webhooks';
      if (regexpStr.includes('api\\/mappings')) prefix = '/api/mappings';

      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          routes.push(
            Object.keys(handler.route.methods).join(',').toUpperCase() + ' ' + prefix + handler.route.path
          );
        }
      });
    }
  });

  console.log('Complete mounted route list:');
  routes.forEach((r) => console.log('  ➜', r));

  const expectedRoutes = [
    'GET /health',
    'GET /auth/hubspot',
    'GET /auth/hubspot/callback',
    'POST /webhooks/wix',
    'POST /webhooks/hubspot',
    'GET /api/mappings/:wixInstanceId',
    'GET /api/mappings/',
    'POST /api/mappings/',
  ];

  for (const exp of expectedRoutes) {
    const found = routes.some((r) => r.includes(exp));
    if (!found) {
      throw new Error(`Expected route "${exp}" was not found in Express router!`);
    }
  }

  console.log('✅ All 4 phases integrated and verified in Express router successfully!');
  process.exit(0);
};

runPhase4Verification().catch((err) => {
  console.error('Phase 4 verification failed:', err);
  process.exit(1);
});
