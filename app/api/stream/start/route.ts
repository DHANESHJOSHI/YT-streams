import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { startLiveStream } from '@/lib/streamer';

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      videoSource,
      videoName,
      rtmpServer,
      streamKey,
      loop,
      overlayText,
      overlayXPct,
      overlayYPct,
      overlayColor,
      overlayFontsize,
      overlayTransform,
      overlayBox,
    } = body;

    if (!videoSource || !rtmpServer || !streamKey) {
      return NextResponse.json(
        { success: false, message: 'Video source, RTMP server, and stream key are required' },
        { status: 400 }
      );
    }

    const result = startLiveStream({
      videoSource,
      videoName,
      rtmpServer,
      streamKey,
      loop: loop !== false, // default true
      overlayText,
      overlayXPct,
      overlayYPct,
      overlayColor,
      overlayFontsize,
      overlayTransform,
      overlayBox,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, message: `Failed to start stream: ${message}` },
      { status: 500 }
    );
  }
}
