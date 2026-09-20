import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { stopLiveStream } from '@/lib/streamer';

export async function POST() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const result = stopLiveStream();
  return NextResponse.json(result);
}
