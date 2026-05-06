import crypto from 'crypto';

let cachedToken: string | null = null;

export function getHookToken(): string {
  if (cachedToken === null) {
    cachedToken = crypto.randomBytes(32).toString('hex');
  }
  return cachedToken;
}

export function verifyHookToken(token: string | undefined | null): boolean {
  if (typeof token !== 'string' || token.length === 0) return false;
  const current = getHookToken();
  if (token.length !== current.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(current));
}
