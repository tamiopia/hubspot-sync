import { encrypt, decrypt } from '../src/utils/crypto';
import { createApp } from '../src/app';

const runVerification = () => {
  console.log('Testing AES-256-GCM encryption & decryption...');
  const testPayload = 'sample-hubspot-oauth-access-token-xyz-1234567890';
  const encrypted = encrypt(testPayload);

  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error(`Expected 3 parts (iv.authTag.ciphertext), got ${parts.length}`);
  }

  const decrypted = decrypt(encrypted);
  if (decrypted !== testPayload) {
    throw new Error(`Mismatch! Expected ${testPayload}, got ${decrypted}`);
  }
  console.log('✅ AES-256-GCM verification passed!');

  console.log('Testing Express route mounting...');
  const app = createApp();
  const routes: string[] = [];

  // @ts-expect-error router stack inspection
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push(Object.keys(middleware.route.methods).join(',').toUpperCase() + ' ' + middleware.route.path);
    } else if (middleware.name === 'router') {
      const regexpStr = middleware.regexp.toString();
      const prefix = regexpStr.includes('auth') ? '/auth' : '';
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          routes.push(Object.keys(handler.route.methods).join(',').toUpperCase() + ' ' + prefix + handler.route.path);
        }
      });
    }
  });

  const hasAuthHubspot = routes.some((r) => r.includes('/auth/hubspot'));
  const hasCallback = routes.some((r) => r.includes('/auth/hubspot/callback'));

  if (!hasAuthHubspot || !hasCallback) {
    throw new Error('OAuth routes not properly mounted!');
  }

  console.log('✅ OAuth routes successfully mounted to Express app:', routes);
};

runVerification();
