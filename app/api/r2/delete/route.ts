import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { deleteR2Video } from '@/lib/r2';

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { key, r2Config } = await req.json();
    if (!key) {
      return NextResponse.json({ success: false, message: 'Key is required' }, { status: 400 });
    }

    const ok = await deleteR2Video(key, r2Config);
    return NextResponse.json({ success: ok });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
