import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getPresignedUploadUrl, isR2Configured } from '@/lib/r2';

export async function POST(req: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { filename, contentType, r2Config } = await req.json();

    if (!filename) {
      return NextResponse.json({ success: false, message: 'Filename is required' }, { status: 400 });
    }

    if (!isR2Configured(r2Config)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Cloudflare R2 is not configured yet. Please open Settings and enter your R2 credentials.',
          isConfigured: false,
        },
        { status: 400 }
      );
    }

    const data = await getPresignedUploadUrl(filename, contentType || 'video/mp4', r2Config);
    if (!data) {
      return NextResponse.json(
        { success: false, message: 'Failed to generate presigned upload URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
