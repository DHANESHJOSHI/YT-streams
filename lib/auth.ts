import { cookies, headers } from 'next/headers';
import crypto from 'crypto';

export const AUTH_COOKIE_NAME = 'fluid_studio_auth';
export const DEFAULT_PASSWORD = process.env.APP_PASSWORD || 'fluidislive@2026';

// Create a deterministic session token based on the password + secret salt
export function createSessionToken(password: string): string {
  const salt = process.env.AUTH_SECRET || 'fluid_live_salt_2026_youtube_studio';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

export function isValidPassword(password: string): boolean {
  return password === DEFAULT_PASSWORD;
}

export async function isAuthenticated(): Promise<boolean> {
  // Allow secret header for cloudflare worker or external automation
  try {
    const headerStore = headers();
    const authHeader = headerStore.get('authorization') || headerStore.get('x-studio-secret');
    if (authHeader) {
      const clean = authHeader.replace(/^Bearer\s+/i, '').trim();
      const secret = process.env.AUTH_SECRET || 'fluid_secret_broadcast_stream_2026';
      if (clean === secret || clean === DEFAULT_PASSWORD) {
        return true;
      }
    }
  } catch {}

  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return false;

  const validToken = createSessionToken(DEFAULT_PASSWORD);
  return token === validToken;
}

export async function requireAuth() {
  const authed = await isAuthenticated();
  if (!authed) {
    throw new Error('Unauthorized');
  }
}
