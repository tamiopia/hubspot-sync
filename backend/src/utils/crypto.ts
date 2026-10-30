import crypto from 'crypto';
import { env } from '../config/env';
import { AppError } from './errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 16; // Standard 128-bit IV
const DELIMITER = '.';

/**
 * Derives a secure 32-byte Buffer from the configured ENCRYPTION_KEY.
 * Supports 64-char hex strings, exact 32-char utf-8 strings, or SHA-256 normalization.
 */
const getKeyBuffer = (): Buffer => {
  const raw = env.ENCRYPTION_KEY.trim();
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const utf8Buf = Buffer.from(raw, 'utf-8');
  if (utf8Buf.length === 32) {
    return utf8Buf;
  }
  return crypto.createHash('sha256').update(raw).digest();
};

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: `<ivHex>.<authTagHex>.<ciphertextHex>`
 */
export const encrypt = (plaintext: string): string => {
  if (!plaintext) {
    throw new AppError('Cannot encrypt empty or null value', 500);
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(DELIMITER);
};

/**
 * Decrypts an AES-256-GCM delimited string.
 * Supports both '.' and ':' delimiters for robustness.
 */
export const decrypt = (encryptedPayload: string): string => {
  if (!encryptedPayload) {
    throw new AppError('Cannot decrypt empty or null payload', 500);
  }

  // Handle either '.' or ':' delimiter
  const delimiter = encryptedPayload.includes(DELIMITER) ? DELIMITER : ':';
  const parts = encryptedPayload.split(delimiter);

  if (parts.length !== 3) {
    throw new AppError('Invalid encrypted token format: expected iv, authTag, and ciphertext', 500);
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;

  try {
    const key = getKeyBuffer();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  } catch (err) {
    throw new AppError(
      `Failed to decrypt token: ${err instanceof Error ? err.message : 'Authentication tag verification failed'}`,
      500
    );
  }
};
