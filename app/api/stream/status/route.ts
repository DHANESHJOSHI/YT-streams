import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getStreamStats } from '@/lib/streamer';

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const stats = getStreamStats();
  return NextResponse.json(stats);
}
