import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getPresignedUploadUrl } from '@/lib/r2';

const NONI_WORKER_URL = process.env.NONI_WORKER_URL || 'https://clips.techwithjoshi.in';

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

    // 1. If standard S3 API credentials are provided, generate S3 presigned URL
    if (r2Config?.accessKeyId && r2Config?.secretAccessKey) {
      const data = await getPresignedUploadUrl(filename, contentType || 'video/mp4', r2Config);
      if (data) {
        return NextResponse.json({
          success: true,
          uploadUrl: data.uploadUrl,
          key: data.key,
          publicUrl: data.publicUrl,
          httpMethod: 'PUT',
        });
      }
    }

    // 2. Default: Use Noni Cloudflare Worker R2 Gateway
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `videos/${Date.now()}_${sanitized}`;
    const directUploadUrl = `/api/r2/upload-direct?filename=${encodeURIComponent(filename)}`;
    const publicUrl = `${NONI_WORKER_URL.replace(/\/$/, '')}/api/clips/download/${encodeURIComponent(key)}`;

    return NextResponse.json({
      success: true,
      uploadUrl: directUploadUrl,
      key,
      publicUrl,
      httpMethod: 'POST',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
