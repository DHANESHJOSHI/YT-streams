import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let defaultServer = 'rtmp://a.rtmp.youtube.com/live2';
  let defaultKey = '';

  try {
    const keyPath = path.join(process.cwd(), 'key.txt');
    if (fs.existsSync(keyPath)) {
      const content = fs.readFileSync(keyPath, 'utf-8');
      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

      if (lines.length > 0) {
        if (lines[0].startsWith('rtmp://') || lines[0].startsWith('rtmps://')) {
          defaultServer = lines[0];
          if (lines.length > 1) {
            defaultKey = lines[1];
          }
        } else {
          defaultKey = lines[0];
        }
      }
    }
  } catch (err) {
    console.error('Error reading key.txt:', err);
  }

  return NextResponse.json({
    defaultServer,
    defaultKey,
    hasR2Env: Boolean(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
    ),
  });
}
