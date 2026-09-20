import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { listR2Videos, isR2Configured, R2Config } from '@/lib/r2';

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let r2Config: Partial<R2Config> | undefined;
    try {
      const body = await req.json();
      r2Config = body?.r2Config;
    } catch {
      // no body passed
    }

    if (!isR2Configured(r2Config)) {
      return NextResponse.json({
        success: true,
        videos: [],
        isConfigured: false,
        message: 'R2 not configured. Add credentials in Settings.',
      });
    }

    const videos = await listR2Videos(r2Config);
    return NextResponse.json({
      success: true,
      videos,
      isConfigured: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
