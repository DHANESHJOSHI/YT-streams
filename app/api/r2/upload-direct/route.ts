import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

const NONI_WORKER_URL = process.env.NONI_WORKER_URL || 'https://clips.techwithjoshi.in';
const NONI_ADMIN_SECRET = process.env.NONI_ADMIN_SECRET || '72f92c51ad5faa1df56f48de83529054ff544fd619dbd3d84572fd7418226af0';

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const rawFilename = searchParams.get('filename') || `video_${Date.now()}.mp4`;
    const sanitized = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `videos/${Date.now()}_${sanitized}`;

    const targetUrl = `${NONI_WORKER_URL.replace(/\/$/, '')}/api/clips/upload/${encodeURIComponent(key)}`;

    const workerRes = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${NONI_ADMIN_SECRET}`,
        'Content-Type': req.headers.get('content-type') || 'video/mp4',
      },
      body: req.body,
      // @ts-ignore - needed for Node 18+ streaming request bodies
      duplex: 'half',
    });

    if (!workerRes.ok) {
      const errText = await workerRes.text();
      return NextResponse.json(
        { success: false, message: `R2 upload failed: ${errText}` },
        { status: workerRes.status }
      );
    }

    const publicUrl = `${NONI_WORKER_URL.replace(/\/$/, '')}/api/clips/download/${encodeURIComponent(key)}`;

    return NextResponse.json({
      success: true,
      key,
      name: rawFilename,
      publicUrl,
      sourceType: 'r2',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
