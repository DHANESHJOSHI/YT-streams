import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface StreamStats {
  isLive: boolean;
  status: 'offline' | 'connecting' | 'live' | 'error' | 'stopped';
  startedAt?: number;
  uptimeSeconds: number;
  videoSource?: string;
  videoName?: string;
  rtmpUrl?: string;
  streamKeyMasked?: string;
  fps: number;
  bitrate: string;
  timecode: string;
  speed: string;
  error?: string;
  logTail: string[];
}

interface ActiveStreamState {
  process: ChildProcess | null;
  stats: StreamStats;
  logBuffer: string[];
}

// Store globally across Next.js module reloads
const globalForStream = global as unknown as {
  activeStream: ActiveStreamState | undefined;
};

const defaultStats: StreamStats = {
  isLive: false,
  status: 'offline',
  uptimeSeconds: 0,
  fps: 0,
  bitrate: '0 kbps',
  timecode: '00:00:00',
  speed: '0x',
  logTail: [],
};

export const activeStreamState: ActiveStreamState = globalForStream.activeStream || {
  process: null,
  stats: { ...defaultStats },
  logBuffer: [],
};

globalForStream.activeStream = activeStreamState;

export interface StartStreamOptions {
  videoSource: string; // URL (http/https) or local absolute/relative path
  videoName?: string;
  rtmpServer: string;  // e.g. "rtmp://a.rtmp.youtube.com/live2"
  streamKey: string;   // e.g. "xxxx-xxxx-xxxx-xxxx"
  loop?: boolean;
  overlayText?: string;
  overlayXPct?: string | number;
  overlayYPct?: string | number;
  overlayColor?: string;
  overlayFontsize?: string | number;
  overlayTransform?: string;
  overlayBox?: boolean | string;
}

function probeVideoCodec(videoSource: string): { videoCodec: string; isH264: boolean } {
  try {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoSource}"`;
    const codec = execSync(cmd, { timeout: 8000 }).toString().trim();
    return {
      videoCodec: codec,
      isH264: codec.toLowerCase() === 'h264',
    };
  } catch {
    return { videoCodec: 'unknown', isH264: false };
  }
}

export function startLiveStream(options: StartStreamOptions): { success: boolean; message: string } {
  if (activeStreamState.process && !activeStreamState.process.killed) {
    return { success: false, message: 'A stream is already actively running. Stop it first.' };
  }

  const { videoSource, videoName, rtmpServer, streamKey, loop = true } = options;

  if (!videoSource || !rtmpServer || !streamKey) {
    return { success: false, message: 'Missing video source, RTMP server, or stream key' };
  }

  // Sanitize RTMP destination
  let cleanServer = rtmpServer.trim().replace(/\/$/, '');
  const cleanKey = streamKey.trim();
  // Auto-append /app for Amazon IVS / Twitch endpoints if missing
  if (cleanServer.includes('live-video.net') && !cleanServer.endsWith('/app')) {
    cleanServer += '/app';
  }
  const rtmpTarget = `${cleanServer}/${cleanKey}`;
  const maskedKey = cleanKey.length > 8 ? `${cleanKey.slice(0, 4)}••••••••${cleanKey.slice(-4)}` : '••••••••';

  // Check if video source is local file or remote URL
  let resolvedSource = videoSource;
  if (!videoSource.startsWith('http://') && !videoSource.startsWith('https://')) {
    if (!fs.existsSync(resolvedSource)) {
      // Try resolving in current working directory
      const localAttempt = path.resolve(process.cwd(), videoSource);
      if (fs.existsSync(localAttempt)) {
        resolvedSource = localAttempt;
      } else {
        return { success: false, message: `Video file not found at: ${videoSource}` };
      }
    }
  }

  // Probe codec to pick optimal encoding strategy
  const { videoCodec, isH264 } = probeVideoCodec(resolvedSource);
  console.log(`[Streamer] Starting stream. Source: ${resolvedSource}, Codec: ${videoCodec}`);

  // Build FFmpeg command arguments
  const args: string[] = [];

  // Looping: -stream_loop -1 loops indefinitely
  if (loop) {
    args.push('-stream_loop', '-1');
  }

  // Real-time input reading
  args.push('-re');

  // Input source
  args.push('-i', resolvedSource);

  // Check for OBS interactive text overlay
  let hasText = !!options.overlayText && options.overlayText.trim().length > 0;
  if (hasText) {
    let text = options.overlayText!.trim();
    const transform = String(options.overlayTransform || 'none').toLowerCase();
    if (transform === 'uppercase') {
      text = text.toUpperCase();
    } else if (transform === 'lowercase') {
      text = text.toLowerCase();
    }

    const xRatio = (parseFloat(String(options.overlayXPct ?? 50)) / 100).toFixed(4);
    const yRatio = (parseFloat(String(options.overlayYPct ?? 12)) / 100).toFixed(4);
    const color = options.overlayColor || 'yellow';
    const size = parseInt(String(options.overlayFontsize ?? 48), 10) || 48;
    const drawBox = String(options.overlayBox) !== 'false';

    const fontCandidates = [
      '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
      '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    ];
    const fontPath = fontCandidates.find(f => fs.existsSync(f)) || '';
    const fontArg = fontPath ? `fontfile=${fontPath}:` : '';
    const boxArg = drawBox ? ':box=1:boxcolor=black@0.65:boxborderw=14' : ':box=0';
    const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');

    args.push('-vf', `drawtext=${fontArg}text='${escaped}':x=(w-text_w)*${xRatio}:y=(h-text_h)*${yRatio}:fontsize=${size}:fontcolor=${color}${boxArg}`);
    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-b:v', '2800k',
      '-maxrate', '3500k',
      '-bufsize', '6000k',
      '-g', '60'
    );
  } else if (isH264) {
    args.push('-c:v', 'copy');
  } else {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-b:v', '2800k',
      '-maxrate', '3500k',
      '-bufsize', '6000k',
      '-g', '60'
    );
  }

  // Audio encoding: always encode to AAC 44.1kHz 192k for pristine YouTube compatibility
  args.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100'
  );

  // FLV format for YouTube RTMP
  args.push(
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    rtmpTarget
  );

  activeStreamState.logBuffer = [];
  activeStreamState.stats = {
    isLive: true,
    status: 'connecting',
    startedAt: Date.now(),
    uptimeSeconds: 0,
    videoSource: resolvedSource,
    videoName: videoName || path.basename(resolvedSource),
    rtmpUrl: cleanServer,
    streamKeyMasked: maskedKey,
    fps: 0,
    bitrate: 'Connecting...',
    timecode: '00:00:00',
    speed: '0x',
    logTail: [],
  };

  try {
    const ffmpegProc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeStreamState.process = ffmpegProc;

    // Parse FFmpeg stderr output for live stats
    ffmpegProc.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      activeStreamState.logBuffer.push(line);
      if (activeStreamState.logBuffer.length > 50) {
        activeStreamState.logBuffer.shift();
      }

      // Check for stream connection success
      if (line.includes('Stream #0') || line.includes('Output #0') || line.includes('frame=')) {
        activeStreamState.stats.status = 'live';
        activeStreamState.stats.isLive = true;
        delete activeStreamState.stats.error;
      }

      // Regex parse frame stats: frame=  123 fps= 30.0 q=-1.0 size=    1234kB time=00:00:04.10 bitrate=2463.1kbits/s speed=1.00x
      const fpsMatch = line.match(/fps=\s*([\d.]+)/);
      const bitrateMatch = line.match(/bitrate=\s*([\d.]+\s*\w+\/s)/);
      const timeMatch = line.match(/time=\s*([\d:.]+)/);
      const speedMatch = line.match(/speed=\s*([\d.]+x)/);

      if (fpsMatch) activeStreamState.stats.fps = parseFloat(fpsMatch[1]);
      if (bitrateMatch) activeStreamState.stats.bitrate = bitrateMatch[1];
      if (timeMatch) activeStreamState.stats.timecode = timeMatch[1];
      if (speedMatch) activeStreamState.stats.speed = speedMatch[1];

      if (activeStreamState.stats.startedAt) {
        activeStreamState.stats.uptimeSeconds = Math.floor(
          (Date.now() - activeStreamState.stats.startedAt) / 1000
        );
      }
    });

    ffmpegProc.on('error', (err) => {
      console.error('[Streamer Error]:', err);
      if (activeStreamState.process !== ffmpegProc) return;
      activeStreamState.stats.status = 'error';
      activeStreamState.stats.error = err.message;
      activeStreamState.stats.isLive = false;
      activeStreamState.process = null;
    });

    ffmpegProc.on('close', (code) => {
      console.log(`[Streamer] Process exited with code ${code}`);
      if (activeStreamState.process !== ffmpegProc) return;
      if (activeStreamState.stats.status !== 'stopped') {
        if (code === 0) {
          activeStreamState.stats.status = 'offline';
        } else {
          activeStreamState.stats.status = 'error';
          activeStreamState.stats.error = `FFmpeg exited with code ${code}`;
        }
      }
      activeStreamState.stats.isLive = false;
      activeStreamState.process = null;
    });

    return { success: true, message: 'Stream initialized successfully' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    activeStreamState.stats.status = 'error';
    activeStreamState.stats.error = message;
    activeStreamState.stats.isLive = false;
    return { success: false, message };
  }
}

export function stopLiveStream(): { success: boolean; message: string } {
  try {
    if (activeStreamState.process && !activeStreamState.process.killed) {
      try {
        activeStreamState.process.kill('SIGKILL');
      } catch {}
      activeStreamState.process = null;
    }

    try {
      execSync('pkill -9 ffmpeg || true');
    } catch {}

    activeStreamState.stats.status = 'stopped';
    activeStreamState.stats.isLive = false;
    activeStreamState.stats.fps = 0;
    activeStreamState.stats.bitrate = 'Offline';
    activeStreamState.stats.speed = '0x';
    delete activeStreamState.stats.error;

    return { success: true, message: 'Stream stopped successfully' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message };
  }
}

export function getStreamStats(): StreamStats {
  if (activeStreamState.stats.isLive && activeStreamState.stats.startedAt) {
    activeStreamState.stats.uptimeSeconds = Math.floor(
      (Date.now() - activeStreamState.stats.startedAt) / 1000
    );
  }
  return {
    ...activeStreamState.stats,
    logTail: activeStreamState.logBuffer.slice(-15),
  };
}
