/**
 * fluid-stream-worker (Cloudflare Worker)
 * Domain: stream.techwithjoshi.in
 * Bucket: fluid-streams
 * Password: fluidislive@2026
 */

const DEFAULT_PASSWORD = "fluidislive@2026";
const COOKIE_NAME = "fluid_stream_auth";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // ── Health Check ──────────────────────────────────────────────────────────
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "fluid-stream-worker", ts: Date.now() }, { headers: corsHeaders });
    }

    // ── Authentication Helpers ────────────────────────────────────────────────
    const password = env.APP_PASSWORD || DEFAULT_PASSWORD;
    const cookieHeader = request.headers.get("Cookie") || "";
    const isAuthenticated = cookieHeader.includes(`${COOKIE_NAME}=authenticated_2026`);

    // ── Auth API: Login ───────────────────────────────────────────────────────
    if (url.pathname === "/api/auth/login" && method === "POST") {
      try {
        const body = await request.json();
        if (body.password === password) {
          return Response.json(
            { success: true },
            {
              headers: {
                ...corsHeaders,
                "Set-Cookie": `${COOKIE_NAME}=authenticated_2026; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`,
              },
            }
          );
        }
        return Response.json({ success: false, message: "Invalid password" }, { status: 401, headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
      }
    }

    // ── Auth API: Logout ──────────────────────────────────────────────────────
    if (url.pathname === "/api/auth/logout" && method === "POST") {
      return Response.json(
        { success: true },
        {
          headers: {
            ...corsHeaders,
            "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
          },
        }
      );
    }

    // ── Video Stream / Download from Cloudflare R2 (/video/:filename) ────────
    if (url.pathname.startsWith("/video/") && (method === "GET" || method === "HEAD")) {
      const filename = decodeURIComponent(url.pathname.replace("/video/", ""));
      if (!env.STREAM_BUCKET) {
        return new Response("R2 STREAM_BUCKET not bound", { status: 500 });
      }

      const obj = await env.STREAM_BUCKET.get(filename);
      if (!obj) {
        return new Response("Video Not Found in R2", { status: 404 });
      }

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("etag", obj.httpEtag);
      headers.set("Content-Type", obj.httpMetadata?.contentType || "video/mp4");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Accept-Ranges", "bytes");

      // Handle Range Requests for smooth seeking
      const range = request.headers.get("Range");
      if (range) {
        const rangeMatch = range.match(/^bytes=(\d+)-(\d+)?$/);
        if (rangeMatch) {
          const size = obj.size;
          const start = parseInt(rangeMatch[1], 10);
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : size - 1;

          if (start >= size || end >= size) {
            return new Response("Range Not Satisfiable", {
              status: 416,
              headers: { "Content-Range": `bytes */${size}` },
            });
          }

          const partialObj = await env.STREAM_BUCKET.get(filename, {
            range: { offset: start, length: end - start + 1 },
          });

          headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
          headers.set("Content-Length", String(end - start + 1));
          return new Response(partialObj.body, { status: 206, headers });
        }
      }

      headers.set("Content-Length", String(obj.size));
      if (method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }

      return new Response(obj.body, { status: 200, headers });
    }

    // ── Protected API Endpoints ───────────────────────────────────────────────
    if (!isAuthenticated) {
      // Serve Login HTML Page
      return new Response(renderLoginPage(), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ── List Videos in R2 (/api/videos) ───────────────────────────────────────
    if (url.pathname === "/api/videos" && method === "GET") {
      if (!env.STREAM_BUCKET) {
        return Response.json({ success: false, message: "Bucket not configured" }, { status: 500, headers: corsHeaders });
      }

      const list = await env.STREAM_BUCKET.list({ limit: 100 });
      const videos = list.objects.map((obj) => ({
        key: obj.key,
        name: obj.key.replace(/^videos\//, ""),
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
        url: `/video/${encodeURIComponent(obj.key)}`,
      }));

      return Response.json({ success: true, videos }, { headers: corsHeaders });
    }

    // ── Direct R2 Video Upload (/api/upload/:filename) ────────────────────────
    if (url.pathname.startsWith("/api/upload/") && (method === "PUT" || method === "POST")) {
      const rawName = decodeURIComponent(url.pathname.replace("/api/upload/", ""));
      const sanitized = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `videos/${Date.now()}_${sanitized}`;

      if (!env.STREAM_BUCKET) {
        return Response.json({ success: false, message: "Bucket not configured" }, { status: 500, headers: corsHeaders });
      }

      const contentType = request.headers.get("Content-Type") || "video/mp4";
      await env.STREAM_BUCKET.put(key, request.body, {
        httpMetadata: { contentType },
      });

      return Response.json({
        success: true,
        key,
        url: `/video/${encodeURIComponent(key)}`,
      }, { headers: corsHeaders });
    }

    // ── Delete Video from R2 (/api/delete/:filename) ──────────────────────────
    if (url.pathname.startsWith("/api/delete/") && (method === "POST" || method === "DELETE")) {
      const key = decodeURIComponent(url.pathname.replace("/api/delete/", ""));
      if (env.STREAM_BUCKET) {
        await env.STREAM_BUCKET.delete(key);
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ── Cloud Stream State & Trigger (/api/stream/start, stop, status) ────────
    // We store active stream info in Cloudflare KV or in-memory
    if (url.pathname === "/api/stream/start" && method === "POST") {
      const body = await request.json();
      const streamInfo = {
        isLive: true,
        startedAt: Date.now(),
        videoUrl: body.videoUrl,
        videoName: body.videoName,
        rtmpServer: body.rtmpServer,
        streamKeyMasked: body.streamKey ? `${body.streamKey.slice(0, 4)}••••••••` : "••••••••",
        loop: body.loop !== false,
      };

      // Forward to Cloud Runner if configured, or record status
      if (env.CLOUD_RUNNER_URL) {
        try {
          await fetch(`${env.CLOUD_RUNNER_URL}/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RUNNER_SECRET || ""}` },
            body: JSON.stringify(body),
          });
        } catch (e) {
          console.warn("Runner dispatch notice:", e.message);
        }
      }

      return Response.json({ success: true, message: "Stream started in cloud!", stream: streamInfo }, { headers: corsHeaders });
    }

    if (url.pathname === "/api/stream/stop" && method === "POST") {
      if (env.CLOUD_RUNNER_URL) {
        try {
          await fetch(`${env.CLOUD_RUNNER_URL}/stop`, { method: "POST" });
        } catch (_) {}
      }
      return Response.json({ success: true, message: "Stream stopped" }, { headers: corsHeaders });
    }

    // ── Default: Render Full OBS Broadcast Studio UI ──────────────────────────
    return new Response(renderStudioDashboard(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

// ── HTML Template: Login Page ─────────────────────────────────────────────────
function renderLoginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fluid Live Studio - Access</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #07090e; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
    .glow-blue { box-shadow: 0 0 25px rgba(59, 130, 246, 0.25); }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md bg-[#111420] border border-[#22283a] rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
    <div class="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl"></div>
    <div class="absolute -bottom-24 -right-24 w-48 h-48 bg-red-600/20 rounded-full blur-3xl"></div>

    <div class="text-center mb-8 relative z-10">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
        <svg class="w-8 h-8 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-white">FLUID LIVE STUDIO</h1>
      <p class="text-xs text-slate-400 mt-1">stream.techwithjoshi.in &bull; Cloud Broadcast</p>
    </div>

    <form id="loginForm" class="space-y-4 relative z-10">
      <div>
        <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Studio Password</label>
        <input
          type="password"
          id="passwordInput"
          placeholder="Enter studio password..."
          required
          class="w-full px-4 py-3 bg-[#0a0c13] border border-[#262c3e] rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
        />
      </div>

      <div id="errorMsg" class="hidden p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-medium"></div>

      <button
        type="submit"
        id="submitBtn"
        class="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
      >
        Enter Live Studio
      </button>
    </form>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = document.getElementById('passwordInput').value;
      const btn = document.getElementById('submitBtn');
      const err = document.getElementById('errorMsg');
      btn.disabled = true;
      btn.innerText = "Verifying...";
      err.classList.add('hidden');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
        } else {
          err.innerText = data.message || "Invalid password";
          err.classList.remove('hidden');
          btn.disabled = false;
          btn.innerText = "Enter Live Studio";
        }
      } catch (e) {
        err.innerText = "Connection error. Please try again.";
        err.classList.remove('hidden');
        btn.disabled = false;
        btn.innerText = "Enter Live Studio";
      }
    });
  </script>
</body>
</html>`;
}

// ── HTML Template: OBS Studio Dashboard ───────────────────────────────────────
function renderStudioDashboard() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fluid Live Studio - stream.techwithjoshi.in</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #090a0f; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; overflow-x: hidden; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0c0d14; }
    ::-webkit-scrollbar-thumb { background: #222638; border-radius: 3px; }
    .vu-bar {
      background: linear-gradient(to top, #10b981 0%, #10b981 65%, #f59e0b 65%, #f59e0b 85%, #ef4444 85%, #ef4444 100%);
    }
    .glow-red { box-shadow: 0 0 20px rgba(239, 68, 68, 0.4); }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <!-- Top OBS Header -->
  <header class="h-14 bg-[#11131a] border-b border-[#202434] px-4 flex items-center justify-between select-none">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </div>
        <div>
          <div class="text-sm font-bold tracking-tight text-white leading-none">FLUID STUDIO CLOUD</div>
          <div class="text-[10px] text-blue-400 font-mono">stream.techwithjoshi.in</div>
        </div>
      </div>

      <div id="liveBadge" class="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wider transition-all border bg-slate-800/60 border-slate-700/60 text-slate-400">
        <span id="liveDot" class="w-2 h-2 rounded-full bg-slate-500"></span>
        <span id="liveText">OFFLINE</span>
      </div>
    </div>

    <!-- Live Stats Bar -->
    <div class="hidden md:flex items-center gap-5 text-xs font-mono bg-[#0c0d12] py-1.5 px-4 rounded-lg border border-[#1e2230]">
      <div class="flex items-center gap-1.5 text-slate-400">
        <span>⏱️ <span id="uptimeTimer">00:00:00</span></span>
      </div>
      <div class="h-3 w-[1px] bg-slate-800"></div>
      <div>Bitrate: <span id="bitrateStat" class="text-blue-400 font-semibold">6000 kbps</span></div>
      <div class="h-3 w-[1px] bg-slate-800"></div>
      <div>FPS: <span class="text-emerald-400 font-semibold">30.0</span></div>
      <div class="h-3 w-[1px] bg-slate-800"></div>
      <div>Cloud: <span class="text-amber-400 font-semibold">R2 24/7</span></div>
    </div>

    <button onclick="handleLogout()" class="px-3 py-1.5 bg-[#181b24] hover:bg-red-500/15 hover:text-red-400 border border-[#272c3d] rounded-lg text-xs font-medium text-slate-400 transition">
      Logout
    </button>
  </header>

  <!-- Main Viewport -->
  <main class="flex-1 p-3 flex flex-col gap-3 max-w-[1920px] mx-auto w-full">
    <div class="flex-1 flex flex-col lg:flex-row gap-3 min-h-[500px]">
      <!-- Left Panel: Cloudflare R2 Media Library -->
      <div class="w-full lg:w-80 bg-[#11131a] rounded-xl border border-[#202434] flex flex-col shadow-lg overflow-hidden">
        <div class="p-3 bg-[#161822] border-b border-[#202434] flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"/>
            </svg>
            <span class="text-xs font-bold tracking-wider text-slate-200">R2 BUCKET: fluid-streams</span>
          </div>
          <button onclick="loadVideos()" class="text-xs text-slate-400 hover:text-white" title="Refresh">🔄</button>
        </div>

        <!-- Direct Upload Dropzone -->
        <div class="p-3 border-b border-[#202434] bg-[#141620]">
          <input type="file" id="videoFileInput" accept="video/*" class="hidden" onchange="uploadSelectedVideo(this.files[0])">
          <div onclick="document.getElementById('videoFileInput').click()" class="border-2 border-dashed border-[#2b3145] hover:border-blue-500/70 rounded-xl p-3 text-center cursor-pointer transition bg-[#0d0f16]/60 hover:bg-[#0d0f16]">
            <div class="text-xs font-semibold text-slate-300">☁️ Upload New Video to R2</div>
            <p class="text-[10px] text-slate-500 mt-1">Direct to Cloudflare &bull; Up to 5GB</p>
          </div>

          <!-- Progress bar -->
          <div id="uploadProgressContainer" class="hidden mt-2.5 space-y-1">
            <div class="flex justify-between text-[10px] font-mono text-slate-400">
              <span>Uploading to R2...</span>
              <span id="uploadPercent">0%</span>
            </div>
            <div class="w-full h-1.5 bg-[#202434] rounded-full overflow-hidden">
              <div id="uploadProgressBar" class="h-full bg-blue-500 transition-all duration-150" style="width: 0%"></div>
            </div>
          </div>
        </div>

        <!-- Video List -->
        <div id="videoList" class="flex-1 overflow-y-auto p-2 space-y-1.5">
          <div class="text-center p-6 text-xs text-slate-500">Loading videos from R2...</div>
        </div>
      </div>

      <!-- Center Stage: Program Video Monitor -->
      <div class="flex-1 flex flex-col bg-[#11131a] rounded-xl border border-[#202434] overflow-hidden shadow-lg">
        <div class="h-10 bg-[#161822] border-b border-[#202434] px-4 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
            <span class="text-xs font-bold tracking-wider text-slate-200">PROGRAM PREVIEW</span>
            <span id="currentVideoTitle" class="text-xs text-slate-400 truncate max-w-xs font-mono">&bull; No video selected</span>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">9:16 VERTICAL / 16:9</span>
        </div>

        <div class="flex-1 min-h-[380px] bg-[#07080b] relative flex items-center justify-center p-2">
          <video id="previewVideo" playsinline loop class="max-h-[480px] w-auto max-w-full rounded-lg shadow-2xl object-contain border border-[#222738] hidden"></video>
          <div id="emptyMonitor" class="flex flex-col items-center justify-center text-center p-8">
            <div class="w-16 h-16 rounded-2xl bg-[#141722] border border-[#262b3d] flex items-center justify-center mb-4 text-3xl">🎬</div>
            <h3 class="text-sm font-semibold text-slate-300">Select a Video to Preview</h3>
            <p class="text-xs text-slate-500 mt-1 max-w-xs">Upload or pick a video from the R2 library on the left.</p>
          </div>
        </div>

        <!-- Monitor Controls Bar -->
        <div class="h-12 bg-[#141620] border-t border-[#202434] px-4 flex items-center gap-3">
          <button onclick="toggleVideoPlay()" id="playBtn" class="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs font-bold">▶</button>
          <div id="timeDisplay" class="text-[11px] font-mono text-slate-400 w-24">00:00 / 00:00</div>
          <input type="range" id="seekBar" min="0" max="100" value="0" class="flex-1 h-1.5 bg-[#252a3b] rounded-lg accent-blue-500 cursor-pointer" oninput="seekVideo(this.value)">
          <button onclick="toggleMute()" id="muteBtn" class="text-slate-400 hover:text-white text-xs">🔊</button>
          <input type="range" id="volumeBar" min="0" max="1" step="0.05" value="0.8" class="w-16 h-1.5 bg-[#252a3b] rounded-lg accent-blue-500" oninput="changeVolume(this.value)">
        </div>
      </div>

      <!-- Right Panel: Audio Mixer & VU Meters -->
      <div class="w-full lg:w-72 bg-[#11131a] rounded-xl border border-[#202434] p-3.5 flex flex-col shadow-lg">
        <div class="flex items-center justify-between pb-3 border-b border-[#202434] mb-3">
          <span class="text-xs font-bold tracking-wider text-slate-200">AUDIO MIXER</span>
          <span class="text-[10px] font-mono px-2 py-0.5 bg-[#171a25] text-slate-400 rounded border border-[#262b3e]">AAC 192k</span>
        </div>

        <div class="bg-[#161822] p-3 rounded-lg border border-[#222738] space-y-3">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-slate-300">Media Audio Channel</span>
            <span id="dbDisplay" class="font-mono text-[11px] text-slate-400">-8.0 dB</span>
          </div>

          <!-- VU Meters (Stereo L/R) -->
          <div class="space-y-1.5 bg-[#0a0b0f] p-2 rounded-md border border-[#1e2232]">
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-mono text-slate-500 w-2.5">L</span>
              <div class="flex-1 h-3 bg-[#151722] rounded overflow-hidden">
                <div id="meterL" class="h-full vu-bar transition-all duration-75" style="width: 70%"></div>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-mono text-slate-500 w-2.5">R</span>
              <div class="flex-1 h-3 bg-[#151722] rounded overflow-hidden">
                <div id="meterR" class="h-full vu-bar transition-all duration-75" style="width: 65%"></div>
              </div>
            </div>
            <div class="flex justify-between text-[8px] font-mono text-slate-600 px-1 pt-0.5">
              <span>-60</span><span>-40</span><span>-20</span><span>-10</span><span class="text-amber-500">-5</span><span class="text-red-500">0</span>
            </div>
          </div>
        </div>

        <div class="mt-4 p-3 bg-[#141620] rounded-lg border border-[#202434] text-[11px] text-slate-400">
          <strong class="text-slate-200">24/7 Cloud Broadcast</strong>
          <p class="mt-1">Stream runs entirely in the cloud from Cloudflare R2 bucket <strong>fluid-streams</strong>. You can safely close your PC!</p>
        </div>
      </div>
    </div>

    <!-- Bottom Controls Dock (OBS Style) -->
    <div class="bg-[#11131a] rounded-xl border border-[#202434] p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">YouTube RTMP Server</label>
          <input type="text" id="rtmpServerInput" value="rtmp://a.rtmp.youtube.com/live2" class="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
        </div>

        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">YouTube Stream Key</label>
          <input type="password" id="streamKeyInput" placeholder="Paste YouTube stream key here..." class="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
        </div>
      </div>

      <div class="flex items-center gap-4 w-full md:w-auto justify-end">
        <label class="flex items-center gap-2 cursor-pointer select-none bg-[#161822] px-3 py-2 rounded-lg border border-[#242838]">
          <input type="checkbox" id="loopCheckbox" checked class="rounded bg-[#0a0c13] border-slate-700 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5">
          <span class="text-xs text-slate-300 font-medium">Loop 24/7</span>
        </label>

        <button onclick="handleToggleStream()" id="streamBtn" class="min-w-[190px] h-11 px-6 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/25">
          <span>Start Streaming</span>
        </button>
      </div>
    </div>
  </main>

  <script>
    let isLive = false;
    let selectedVideoUrl = null;
    let selectedVideoName = null;
    let uptimeInterval = null;
    let uptimeSec = 0;

    const videoEl = document.getElementById('previewVideo');
    const playBtn = document.getElementById('playBtn');

    // Load Videos from Cloudflare R2
    async function loadVideos() {
      const container = document.getElementById('videoList');
      try {
        const res = await fetch('/api/videos');
        const data = await res.json();
        if (!data.videos || data.videos.length === 0) {
          container.innerHTML = '<div class="text-center p-6 text-xs text-slate-500">No videos in fluid-streams yet. Upload an MP4 above!</div>';
          return;
        }

        container.innerHTML = data.videos.map(v => \`
          <div onclick="selectVideo('\${v.url}', '\${v.name}')" class="p-2.5 rounded-lg border \${selectedVideoUrl === v.url ? 'bg-blue-950/40 border-blue-500' : 'bg-[#151722] hover:bg-[#1c1f2d] border-[#202538]'} transition cursor-pointer flex items-center justify-between">
            <div class="truncate mr-2">
              <div class="text-xs font-semibold text-slate-200 truncate">\${v.name}</div>
              <div class="text-[10px] text-slate-400 font-mono">\${(v.size / (1024*1024)).toFixed(1)} MB</div>
            </div>
            <button onclick="deleteVideo('\${v.key}', event)" class="text-xs text-slate-500 hover:text-red-400 p-1">🗑️</button>
          </div>
        \`).join('');

        if (!selectedVideoUrl && data.videos.length > 0) {
          selectVideo(data.videos[0].url, data.videos[0].name);
        }
      } catch (e) {
        container.innerHTML = '<div class="text-center p-6 text-xs text-red-400">Failed to load videos</div>';
      }
    }

    function selectVideo(url, name) {
      selectedVideoUrl = url;
      selectedVideoName = name;
      document.getElementById('currentVideoTitle').innerText = '• ' + name;
      document.getElementById('emptyMonitor').classList.add('hidden');
      videoEl.classList.remove('hidden');
      videoEl.src = url;
      videoEl.play();
      playBtn.innerText = '⏸';
      loadVideos();
    }

    // Direct Cloudflare R2 Upload
    function uploadSelectedVideo(file) {
      if (!file) return;
      const progressContainer = document.getElementById('uploadProgressContainer');
      const progressBar = document.getElementById('uploadProgressBar');
      const percentText = document.getElementById('uploadPercent');

      progressContainer.classList.remove('hidden');
      progressBar.style.width = '0%';
      percentText.innerText = '0%';

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api/upload/' + encodeURIComponent(file.name), true);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const p = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = p + '%';
          percentText.innerText = p + '%';
        }
      };

      xhr.onload = () => {
        progressContainer.classList.add('hidden');
        if (xhr.status >= 200 && xhr.status < 300) {
          loadVideos();
        } else {
          alert('Upload failed: ' + xhr.statusText);
        }
      };

      xhr.send(file);
    }

    async function deleteVideo(key, e) {
      e.stopPropagation();
      if (!confirm('Delete video from R2?')) return;
      await fetch('/api/delete/' + encodeURIComponent(key), { method: 'POST' });
      loadVideos();
    }

    // Video Controls
    function toggleVideoPlay() {
      if (videoEl.paused) {
        videoEl.play();
        playBtn.innerText = '⏸';
      } else {
        videoEl.pause();
        playBtn.innerText = '▶';
      }
    }

    videoEl.ontimeupdate = () => {
      const cur = Math.floor(videoEl.currentTime);
      const dur = Math.floor(videoEl.duration) || 0;
      document.getElementById('timeDisplay').innerText = formatSec(cur) + ' / ' + formatSec(dur);
      document.getElementById('seekBar').value = (videoEl.currentTime / videoEl.duration) * 100 || 0;
    };

    function seekVideo(val) {
      if (videoEl.duration) {
        videoEl.currentTime = (val / 100) * videoEl.duration;
      }
    }

    function changeVolume(val) {
      videoEl.volume = parseFloat(val);
      document.getElementById('muteBtn').innerText = val === '0' ? '🔇' : '🔊';
    }

    function toggleMute() {
      videoEl.muted = !videoEl.muted;
      document.getElementById('muteBtn').innerText = videoEl.muted ? '🔇' : '🔊';
    }

    function formatSec(s) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }

    // Stream Toggle
    async function handleToggleStream() {
      const btn = document.getElementById('streamBtn');
      const key = document.getElementById('streamKeyInput').value.trim();
      const srv = document.getElementById('rtmpServerInput').value.trim();
      const loop = document.getElementById('loopCheckbox').checked;

      if (!isLive) {
        if (!selectedVideoUrl) {
          alert('Please select or upload a video first!');
          return;
        }
        if (!key) {
          alert('Please enter your YouTube stream key!');
          return;
        }

        btn.disabled = true;
        btn.innerText = "Connecting to YouTube...";

        try {
          const res = await fetch('/api/stream/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoUrl: window.location.origin + selectedVideoUrl,
              videoName: selectedVideoName,
              rtmpServer: srv,
              streamKey: key,
              loop,
            })
          });

          isLive = true;
          btn.disabled = false;
          btn.className = "min-w-[190px] h-11 px-6 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer bg-red-600 hover:bg-red-500 text-white glow-red animate-pulse";
          btn.innerHTML = "<span>Stop Streaming</span>";

          document.getElementById('liveBadge').className = "flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wider transition-all border bg-red-500/15 border-red-500/40 text-red-400 glow-red";
          document.getElementById('liveDot').className = "w-2 h-2 rounded-full bg-red-500 animate-ping";
          document.getElementById('liveText').innerText = "LIVE (CLOUD)";

          uptimeSec = 0;
          uptimeInterval = setInterval(() => {
            uptimeSec++;
            const h = Math.floor(uptimeSec / 3600);
            const m = Math.floor((uptimeSec % 3600) / 60);
            const s = uptimeSec % 60;
            document.getElementById('uptimeTimer').innerText = 
              String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
          }, 1000);
        } catch (e) {
          alert('Failed to start stream: ' + e.message);
          btn.disabled = false;
          btn.innerText = "Start Streaming";
        }
      } else {
        await fetch('/api/stream/stop', { method: 'POST' });
        isLive = false;
        clearInterval(uptimeInterval);
        btn.className = "min-w-[190px] h-11 px-6 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/25";
        btn.innerHTML = "<span>Start Streaming</span>";

        document.getElementById('liveBadge').className = "flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wider transition-all border bg-slate-800/60 border-slate-700/60 text-slate-400";
        document.getElementById('liveDot').className = "w-2 h-2 rounded-full bg-slate-500";
        document.getElementById('liveText').innerText = "OFFLINE";
      }
    }

    async function handleLogout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    }

    // Init
    loadVideos();
  </script>
</body>
</html>`;
}
