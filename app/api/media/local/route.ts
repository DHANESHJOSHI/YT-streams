import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.flv'];

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cwd = process.cwd();
    const files = fs.readdirSync(cwd);

    const videoFiles = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return VIDEO_EXTENSIONS.includes(ext);
      })
      .map((filename) => {
        const filePath = path.join(cwd, filename);
        const stats = fs.statSync(filePath);
        return {
          key: filename,
          name: filename,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          url: `/api/media/stream-local/${encodeURIComponent(filename)}`,
          absolutePath: filePath,
          sourceType: 'local' as const,
        };
      })
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return NextResponse.json({
      success: true,
      videos: videoFiles,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
