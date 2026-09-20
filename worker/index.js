/**
 * fluid-stream-worker (Cloudflare Worker)
 * Domain: stream.techwithjoshi.in
 * Bucket: fluid-streams
 * Password: fluidislive@2026
 * 24/7 Cloud Streaming via GitHub Actions (Zero PC required)
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
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GitHub-Token, X-GitHub-Repo",
        },
      });
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GitHub-Token, X-GitHub-Repo",
    };

    // ── Health Check ──────────────────────────────────────────────────────────
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "fluid-stream-worker", ts: Date.now() }, { headers: corsHeaders });
    }

    // ── Authentication Helpers ────────────────────────────────────────────────
    const password = env.APP_PASSWORD || DEFAULT_PASSWORD;
    const cookieHeader = request.headers.get("Cookie") || "";
    const authHeader = request.headers.get("Authorization") || "";
    const isAuthenticated =
      cookieHeader.includes(`${COOKIE_NAME}=authenticated_2026`) ||
      authHeader === `Bearer ${password}` ||
      authHeader === password;

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

      // Handle Range Requests for smooth seeking and audio playback
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
    if (url.pathname.startsWith("/api/upload/") && !url.pathname.startsWith("/api/upload/multipart/") && (method === "PUT" || method === "POST")) {
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

    // ── Multipart Upload for Large Files (>50MB up to 5TB) ────────────────────
    // 1. Start Multipart Upload
    if (url.pathname === "/api/upload/multipart/create" && method === "POST") {
      try {
        const body = await request.json();
        const rawName = body.filename || "video.mp4";
        const sanitized = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = body.customKey || `videos/${Date.now()}_${sanitized}`;
        const contentType = body.contentType || "video/mp4";

        if (!env.STREAM_BUCKET) {
          return Response.json({ success: false, message: "Bucket not configured" }, { status: 500, headers: corsHeaders });
        }

        const upload = await env.STREAM_BUCKET.createMultipartUpload(key, {
          httpMetadata: { contentType },
        });

        return Response.json({
          success: true,
          uploadId: upload.uploadId,
          key: upload.key,
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 2. Upload Part
    if (url.pathname === "/api/upload/multipart/part" && method === "PUT") {
      try {
        const uploadId = url.searchParams.get("uploadId");
        const key = url.searchParams.get("key");
        const partNumber = parseInt(url.searchParams.get("partNumber"), 10);

        if (!uploadId || !key || isNaN(partNumber)) {
          return Response.json({ success: false, message: "Missing uploadId, key, or partNumber" }, { status: 400, headers: corsHeaders });
        }

        const upload = env.STREAM_BUCKET.resumeMultipartUpload(key, uploadId);
        const part = await upload.uploadPart(partNumber, request.body);

        return Response.json({
          success: true,
          partNumber: part.partNumber,
          etag: part.etag,
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 3. Complete Multipart Upload
    if (url.pathname === "/api/upload/multipart/complete" && method === "POST") {
      try {
        const body = await request.json();
        const { uploadId, key, parts } = body;

        if (!uploadId || !key || !parts || !Array.isArray(parts)) {
          return Response.json({ success: false, message: "Missing uploadId, key, or parts array" }, { status: 400, headers: corsHeaders });
        }

        const upload = env.STREAM_BUCKET.resumeMultipartUpload(key, uploadId);
        const obj = await upload.complete(parts);

        return Response.json({
          success: true,
          key: obj.key,
          url: `/video/${encodeURIComponent(obj.key)}`,
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 4. Abort Multipart Upload
    if (url.pathname === "/api/upload/multipart/abort" && method === "POST") {
      try {
        const body = await request.json();
        const { uploadId, key } = body;
        const upload = env.STREAM_BUCKET.resumeMultipartUpload(key, uploadId);
        await upload.abort();
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ── Delete Video from R2 (/api/delete/:filename) ──────────────────────────
    if (url.pathname.startsWith("/api/delete/") && (method === "POST" || method === "DELETE")) {
      const key = decodeURIComponent(url.pathname.replace("/api/delete/", ""));
      if (env.STREAM_BUCKET) {
        await env.STREAM_BUCKET.delete(key);
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ── GITHUB ACTIONS 24/7 CLOUD STREAM CONTROLLER ──────────────────────────
    // 1. Check Status of GitHub Actions Streamer
    if (url.pathname === "/api/github/status" && method === "POST") {
      try {
        const body = await request.json();
        const repo = (body.repo || env.GITHUB_REPO || "DHANESHJOSHI/YT-streams").trim();
        const token = (body.token || env.GITHUB_TOKEN || "").trim();

        if (!token) {
          return Response.json({
            isLive: false,
            needsConfig: true,
            message: "GitHub Token required to control 24/7 cloud streamer",
          }, { headers: corsHeaders });
        }

        const ghRes = await fetch(
          `https://api.github.com/repos/${repo}/actions/workflows/stream-24-7.yml/runs?per_page=5`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "FluidLiveStudio",
            },
          }
        );

        if (!ghRes.ok) {
          const errText = await ghRes.text();
          return Response.json({ isLive: false, error: errText }, { status: ghRes.status, headers: corsHeaders });
        }

        const data = await ghRes.json();
        const runs = data.workflow_runs || [];
        const activeRun = runs.find((r) => r.status === "in_progress" || r.status === "queued");

        if (activeRun) {
          const startTime = new Date(activeRun.created_at).getTime();
          const durationSeconds = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
          return Response.json({
            isLive: true,
            status: activeRun.status,
            runId: activeRun.id,
            runNumber: activeRun.run_number,
            htmlUrl: activeRun.html_url,
            startedAt: activeRun.created_at,
            durationSeconds,
          }, { headers: corsHeaders });
        }

        return Response.json({ isLive: false, status: "idle" }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ isLive: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 2. Start GitHub Actions 24/7 Cloud Streamer
    if (url.pathname === "/api/github/start" && method === "POST") {
      try {
        const body = await request.json();
        const repo = (body.repo || env.GITHUB_REPO || "DHANESHJOSHI/YT-streams").trim();
        const token = (body.token || env.GITHUB_TOKEN || "").trim();
        const branch = (body.branch || "main").trim();
        const videoUrl = body.videoUrl;
        const rtmpServer = body.rtmpServer || "rtmp://a.rtmp.youtube.com/live2";
        const streamKey = body.streamKey;

        if (!token) {
          return Response.json({ success: false, message: "GitHub Token is required" }, { status: 400, headers: corsHeaders });
        }
        if (!videoUrl || !streamKey) {
          return Response.json({ success: false, message: "Video URL and Stream Key are required" }, { status: 400, headers: corsHeaders });
        }

        // Trigger workflow dispatch on GitHub
        const dispatchRes = await fetch(
          `https://api.github.com/repos/${repo}/actions/workflows/stream-24-7.yml/dispatches`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "User-Agent": "FluidLiveStudio",
            },
            body: JSON.stringify({
              ref: branch,
              inputs: {
                video_url: videoUrl,
                rtmp_server: rtmpServer,
                stream_key: streamKey,
                overlay_text: body.overlayText || "",
                overlay_x_pct: String(body.overlayXPct ?? "50"),
                overlay_y_pct: String(body.overlayYPct ?? "12"),
                overlay_color: body.overlayColor || "yellow",
                overlay_fontsize: String(body.overlayFontSize || "48"),
                overlay_transform: body.overlayTransform || "none",
                overlay_box: body.overlayBox || "true",
              },
            }),
          }
        );

        if (!dispatchRes.ok) {
          // If master fails, try main branch fallback
          if (branch === "master") {
            const fallbackRes = await fetch(
              `https://api.github.com/repos/${repo}/actions/workflows/stream-24-7.yml/dispatches`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/vnd.github+json",
                  "Content-Type": "application/json",
                  "User-Agent": "FluidLiveStudio",
                },
                body: JSON.stringify({
                  ref: "main",
                  inputs: {
                    video_url: videoUrl,
                    rtmp_server: rtmpServer,
                    stream_key: streamKey,
                    overlay_text: body.overlayText || "",
                    overlay_x_pct: String(body.overlayXPct ?? "50"),
                    overlay_y_pct: String(body.overlayYPct ?? "12"),
                    overlay_color: body.overlayColor || "yellow",
                    overlay_fontsize: String(body.overlayFontSize || "48"),
                    overlay_transform: body.overlayTransform || "none",
                    overlay_box: body.overlayBox || "true",
                  },
                }),
              }
            );
            if (!fallbackRes.ok) {
              const err = await fallbackRes.text();
              return Response.json({ success: false, message: `GitHub Dispatch failed: ${err}` }, { status: fallbackRes.status, headers: corsHeaders });
            }
          } else {
            const err = await dispatchRes.text();
            return Response.json({ success: false, message: `GitHub Dispatch failed: ${err}` }, { status: dispatchRes.status, headers: corsHeaders });
          }
        }

        return Response.json({
          success: true,
          message: "24/7 Cloud Live Stream started on GitHub Actions! You can now safely close your PC.",
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 3. Stop / Cancel GitHub Actions Cloud Streamer
    if (url.pathname === "/api/github/stop" && method === "POST") {
      try {
        const body = await request.json();
        const repo = (body.repo || env.GITHUB_REPO || "DHANESHJOSHI/YT-streams").trim();
        const token = (body.token || env.GITHUB_TOKEN || "").trim();
        let runId = body.runId;

        if (!token) {
          return Response.json({ success: false, message: "GitHub Token required" }, { status: 400, headers: corsHeaders });
        }

        // If runId not provided, discover the running one
        if (!runId) {
          const ghRes = await fetch(
            `https://api.github.com/repos/${repo}/actions/workflows/stream-24-7.yml/runs?per_page=5`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "FluidLiveStudio",
              },
            }
          );
          if (ghRes.ok) {
            const data = await ghRes.json();
            const active = data.workflow_runs?.find((r) => r.status === "in_progress" || r.status === "queued");
            if (active) runId = active.id;
          }
        }

        if (!runId) {
          return Response.json({ success: true, message: "No active cloud stream running" }, { headers: corsHeaders });
        }

        const cancelRes = await fetch(
          `https://api.github.com/repos/${repo}/actions/runs/${runId}/cancel`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "FluidLiveStudio",
            },
          }
        );

        return Response.json({ success: true, message: "Cloud stream stopped" }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ── Default: Render Studio Dashboard UI ───────────────────────────────────
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
      <p class="text-xs text-blue-400 mt-1 font-mono">stream.techwithjoshi.in &bull; 24/7 Cloud</p>
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
    .glow-red { box-shadow: 0 0 25px rgba(239, 68, 68, 0.45); }
    .glow-blue { box-shadow: 0 0 20px rgba(59, 130, 246, 0.3); }
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

      <!-- Live Broadcast Badge -->
      <div id="liveBadge" class="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wider transition-all border bg-slate-800/60 border-slate-700/60 text-slate-400">
        <span id="liveDot" class="w-2 h-2 rounded-full bg-slate-500"></span>
        <span id="liveText">OFFLINE</span>
      </div>
    </div>

    <!-- Live Status Bar -->
    <div class="hidden md:flex items-center gap-5 text-xs font-mono bg-[#0c0d12] py-1.5 px-4 rounded-lg border border-[#1e2230]">
      <div class="flex items-center gap-1.5 text-slate-400">
        <span>⏱️ <span id="uptimeTimer">00:00:00</span></span>
      </div>
      <div class="h-3 w-[1px] bg-slate-800"></div>
      <div>Engine: <span class="text-indigo-400 font-semibold">GitHub Cloud 24/7</span></div>
      <div class="h-3 w-[1px] bg-slate-800"></div>
      <div>FPS: <span class="text-emerald-400 font-semibold">30.0</span></div>
      <div class="h-3 w-[1px] bg-slate-800"></div>
      <div>Storage: <span class="text-amber-400 font-semibold">R2 fluid-streams</span></div>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-2">
      <button onclick="openConfigModal()" class="flex items-center gap-1.5 px-3 py-1.5 bg-[#181b24] hover:bg-[#202534] border border-[#272c3d] rounded-lg text-xs font-medium text-slate-300 hover:text-white transition">
        ⚙️ <span>Cloud 24/7 Settings</span>
      </button>

      <button onclick="handleLogout()" class="px-3 py-1.5 bg-[#181b24] hover:bg-red-500/15 hover:text-red-400 border border-[#272c3d] rounded-lg text-xs font-medium text-slate-400 transition">
        Logout
      </button>
    </div>
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
            <span class="text-xs font-bold tracking-wider text-slate-200">R2: fluid-streams</span>
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

        <div class="flex-1 min-h-[380px] bg-[#07080b] relative flex items-center justify-center p-2 overflow-hidden">
          <div id="videoScreenContainer" class="relative max-h-[480px] max-w-full flex items-center justify-center select-none">
            <video id="previewVideo" playsinline loop class="max-h-[480px] w-auto max-w-full rounded-lg shadow-2xl object-contain border border-[#222738] hidden"></video>

            <!-- OBS Interactive Draggable & Resizable Transform Box -->
            <div id="obsTransformContainer" class="absolute z-20 hidden select-none" style="left: 50%; top: 12%; transform: translate(-50%, -50%); cursor: move;">
              <div id="obsBoundingBox" class="relative border-2 border-dashed border-red-500 rounded p-1.5 shadow-2xl bg-black/60 transition-colors">
                <span id="overlayTextSpan" class="font-black tracking-wide inline-block whitespace-pre-wrap text-center leading-snug pointer-events-none select-none drop-shadow-md">
                  🎵 Guess The Song! #shorts
                </span>

                <!-- 8 OBS Transform & Resize Handles -->
                <div class="obs-handle handle-tl absolute -top-1.5 -left-1.5 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: nwse-resize;"></div>
                <div class="obs-handle handle-tr absolute -top-1.5 -right-1.5 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: nesw-resize;"></div>
                <div class="obs-handle handle-bl absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: nesw-resize;"></div>
                <div class="obs-handle handle-br absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: nwse-resize;"></div>
                <div class="obs-handle handle-t absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: ns-resize;"></div>
                <div class="obs-handle handle-b absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: ns-resize;"></div>
                <div class="obs-handle handle-l absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: ew-resize;"></div>
                <div class="obs-handle handle-r absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-red-500 border border-white rounded-xs" style="cursor: ew-resize;"></div>
              </div>
            </div>
          </div>
          <div id="emptyMonitor" class="flex flex-col items-center justify-center text-center p-8">
            <div class="w-16 h-16 rounded-2xl bg-[#141722] border border-[#262b3d] flex items-center justify-center mb-4 text-3xl">🎬</div>
            <h3 class="text-sm font-semibold text-slate-300">Select a Video to Preview</h3>
            <p class="text-xs text-slate-500 mt-1 max-w-xs">Upload or click a video from the R2 library on the left.</p>
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
            <span class="font-mono text-[11px] text-slate-400">-8.0 dB</span>
          </div>

          <!-- VU Meters (Stereo L/R) -->
          <div class="space-y-1.5 bg-[#0a0b0f] p-2 rounded-md border border-[#1e2232]">
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-mono text-slate-500 w-2.5">L</span>
              <div class="flex-1 h-3 bg-[#151722] rounded overflow-hidden">
                <div id="meterL" class="h-full vu-bar transition-all duration-75" style="width: 72%"></div>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-mono text-slate-500 w-2.5">R</span>
              <div class="flex-1 h-3 bg-[#151722] rounded overflow-hidden">
                <div id="meterR" class="h-full vu-bar transition-all duration-75" style="width: 68%"></div>
              </div>
            </div>
            <div class="flex justify-between text-[8px] font-mono text-slate-600 px-1 pt-0.5">
              <span>-60</span><span>-40</span><span>-20</span><span>-10</span><span class="text-amber-500">-5</span><span class="text-red-500">0</span>
            </div>
          </div>
        </div>

        <div class="mt-4 p-3 bg-[#141620] rounded-lg border border-[#202434] text-[11px] text-slate-400 space-y-1">
          <div class="flex items-center justify-between">
            <strong class="text-slate-200">24/7 Cloud Broadcast</strong>
            <span id="cloudRunnerStatusPill" class="text-[9px] font-mono px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">CLOUD READY</span>
          </div>
          <p class="text-[10px] text-slate-500">
            Stream runs 100% in the cloud via GitHub Actions from Cloudflare R2 bucket <strong>fluid-streams</strong>. You can safely turn off your PC!
          </p>
        </div>
      </div>
    </div>

    <!-- OBS Text Transformation & Mouse Positioning Controls -->
    <div class="bg-[#11131a] rounded-xl border border-[#202434] p-4 shadow-xl mb-4">
      <div class="flex items-center justify-between pb-3 border-b border-[#202434] mb-3">
        <div class="flex items-center gap-2">
          <span class="text-sm">🔤</span>
          <span class="text-xs font-bold uppercase tracking-wider text-slate-200">OBS Text Transformation & Mouse Positioning</span>
          <span class="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">🖱️ DRAG & RESIZE WITH MOUSE</span>
        </div>
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" id="overlayEnableToggle" checked onchange="updateTextOverlay()" class="rounded bg-[#0a0c13] border-slate-700 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5">
          <span class="text-xs text-slate-300 font-semibold">Enable Text on Video</span>
        </label>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
        <!-- Text Input with Live Transformation Buttons -->
        <div class="md:col-span-8">
          <label class="block text-[11px] font-semibold text-slate-400 mb-1">Text Message (burns into YouTube Live stream)</label>
          <div class="flex gap-2">
            <input
              type="text"
              id="overlayTextInput"
              placeholder="e.g. 🎵 Guess The Song! Comment Below 👇"
              value="🎵 Guess The Song! #shorts"
              oninput="updateTextOverlay()"
              class="flex-1 px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-semibold text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
            <!-- Transformation buttons: UPPERCASE, lowercase, Capitalize, Normal -->
            <div class="flex rounded-lg border border-[#262b3d] overflow-hidden bg-[#0a0c13]">
              <button type="button" onclick="setTextTransform('uppercase')" id="btnUpper" class="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition" title="UPPERCASE">AA</button>
              <button type="button" onclick="setTextTransform('lowercase')" id="btnLower" class="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition border-l border-[#262b3d]" title="lowercase">aa</button>
              <button type="button" onclick="setTextTransform('capitalize')" id="btnCap" class="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition border-l border-[#262b3d]" title="Capitalize">Aa</button>
              <button type="button" onclick="setTextTransform('none')" id="btnNone" class="px-2.5 py-1 text-[11px] font-bold text-blue-400 bg-blue-950/60 border-l border-[#262b3d]" title="Normal">Normal</button>
            </div>
          </div>
        </div>

        <!-- Color Swatches -->
        <div class="md:col-span-4">
          <label class="block text-[11px] font-semibold text-slate-400 mb-1">Text Color</label>
          <div class="flex items-center gap-1.5 pt-0.5">
            <button type="button" onclick="setTextColor('yellow')" id="colBtn_yellow" class="w-7 h-7 rounded-lg border-2 border-yellow-400 bg-yellow-400 hover:scale-110 transition shadow cursor-pointer" title="Yellow"></button>
            <button type="button" onclick="setTextColor('white')" id="colBtn_white" class="w-7 h-7 rounded-lg border border-slate-600 bg-white hover:scale-110 transition shadow cursor-pointer" title="White"></button>
            <button type="button" onclick="setTextColor('cyan')" id="colBtn_cyan" class="w-7 h-7 rounded-lg border border-slate-600 bg-cyan-400 hover:scale-110 transition shadow cursor-pointer" title="Cyan"></button>
            <button type="button" onclick="setTextColor('green')" id="colBtn_green" class="w-7 h-7 rounded-lg border border-slate-600 bg-green-500 hover:scale-110 transition shadow cursor-pointer" title="Neon Green"></button>
            <button type="button" onclick="setTextColor('red')" id="colBtn_red" class="w-7 h-7 rounded-lg border border-slate-600 bg-red-500 hover:scale-110 transition shadow cursor-pointer" title="Red"></button>
            <button type="button" onclick="setTextColor('magenta')" id="colBtn_magenta" class="w-7 h-7 rounded-lg border border-slate-600 bg-fuchsia-500 hover:scale-110 transition shadow cursor-pointer" title="Magenta"></button>
            <button type="button" onclick="setTextColor('orange')" id="colBtn_orange" class="w-7 h-7 rounded-lg border border-slate-600 bg-orange-500 hover:scale-110 transition shadow cursor-pointer" title="Orange"></button>
          </div>
        </div>

        <!-- Position Sliders & Size -->
        <div class="md:col-span-4 flex flex-col justify-end">
          <div class="flex justify-between text-[11px] font-medium text-slate-400 mb-1">
            <span>Position X (Horizontal)</span>
            <span id="posXLabel" class="font-mono text-blue-400 font-bold">50%</span>
          </div>
          <input type="range" id="posXSlider" min="5" max="95" value="50" oninput="setPosX(this.value)" class="w-full h-1.5 bg-[#252a3b] rounded-lg accent-blue-500 cursor-pointer">
        </div>

        <div class="md:col-span-4 flex flex-col justify-end">
          <div class="flex justify-between text-[11px] font-medium text-slate-400 mb-1">
            <span>Position Y (Vertical)</span>
            <span id="posYLabel" class="font-mono text-blue-400 font-bold">12%</span>
          </div>
          <input type="range" id="posYSlider" min="5" max="95" value="12" oninput="setPosY(this.value)" class="w-full h-1.5 bg-[#252a3b] rounded-lg accent-blue-500 cursor-pointer">
        </div>

        <div class="md:col-span-4 flex flex-col justify-end">
          <div class="flex justify-between text-[11px] font-medium text-slate-400 mb-1">
            <span>Font Size (Scale)</span>
            <span id="fontSizeLabel" class="font-mono text-blue-400 font-bold">48px</span>
          </div>
          <input type="range" id="fontSizeSlider" min="18" max="96" value="48" oninput="setFontSize(this.value)" class="w-full h-1.5 bg-[#252a3b] rounded-lg accent-blue-500 cursor-pointer">
        </div>

        <!-- Quick Alignments & Background Box Toggle -->
        <div class="md:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1e2233]">
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-slate-400 font-semibold">Quick Align:</span>
            <button type="button" onclick="quickAlign('top')" class="px-2.5 py-1 bg-[#161822] hover:bg-[#1f2333] border border-[#262b3d] rounded text-[11px] text-slate-300 font-medium transition cursor-pointer">⬆️ Top</button>
            <button type="button" onclick="quickAlign('center')" class="px-2.5 py-1 bg-[#161822] hover:bg-[#1f2333] border border-[#262b3d] rounded text-[11px] text-slate-300 font-medium transition cursor-pointer">🎯 Center</button>
            <button type="button" onclick="quickAlign('bottom')" class="px-2.5 py-1 bg-[#161822] hover:bg-[#1f2333] border border-[#262b3d] rounded text-[11px] text-slate-300 font-medium transition cursor-pointer">⬇️ Bottom</button>
            <button type="button" onclick="quickAlign('centerX')" class="px-2.5 py-1 bg-[#161822] hover:bg-[#1f2333] border border-[#262b3d] rounded text-[11px] text-slate-300 font-medium transition cursor-pointer">↔️ Center X</button>
          </div>

          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
              <input type="checkbox" id="boxBgToggle" checked onchange="updateTextOverlay()" class="rounded bg-[#0a0c13] border-slate-700 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5">
              <span>Dark Background Box</span>
            </label>
            <span class="text-[10px] font-mono text-slate-500">💡 Video par mouse se text ko drag karein ya red handles se resize karein!</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Controls Dock (OBS Broadcast Controls) -->
    <div class="bg-[#11131a] rounded-xl border border-[#202434] p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">YouTube RTMP Server</label>
          <input type="text" id="rtmpServerInput" value="rtmp://a.rtmp.youtube.com/live2" class="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
        </div>

        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">YouTube Stream Key</label>
          <input type="password" id="streamKeyInput" placeholder="Paste YouTube stream key (e.g. sk_...)" class="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
        </div>
      </div>

      <div class="flex items-center gap-4 w-full md:w-auto justify-end">
        <label class="flex items-center gap-2 cursor-pointer select-none bg-[#161822] px-3 py-2 rounded-lg border border-[#242838]">
          <input type="checkbox" id="loopCheckbox" checked class="rounded bg-[#0a0c13] border-slate-700 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5">
          <span class="text-xs text-slate-300 font-medium">Loop 24/7</span>
        </label>

        <button onclick="handleToggleStream()" id="streamBtn" class="min-w-[210px] h-11 px-6 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/25">
          <span>Start Cloud Stream</span>
        </button>
      </div>
    </div>
  </main>

  <!-- GitHub Cloud 24/7 Settings Modal -->
  <div id="configModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
    <div class="w-full max-w-md bg-[#12141d] border border-[#262b3d] rounded-2xl p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-[#222738]">
        <div class="flex items-center gap-2">
          <span class="text-lg">⚙️</span>
          <h2 class="text-sm font-bold text-white">GitHub 24/7 Cloud Stream Settings</h2>
        </div>
        <button onclick="closeConfigModal()" class="text-slate-400 hover:text-white">&times;</button>
      </div>

      <p class="text-xs text-slate-400">
        Web dashboard se seedha GitHub Actions runner control karne ke liye apna GitHub token enter karein. Ek baar save hone ke baad aap bina PC ke stream start/stop kar sakenge.
      </p>

      <div>
        <label class="block text-xs font-medium text-slate-300 mb-1">GitHub Repository (Owner/Repo)</label>
        <input type="text" id="ghRepoInput" placeholder="DHANESHJOSHI/YT-streams" class="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200">
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-300 mb-1">GitHub Personal Access Token (PAT)</label>
        <input type="password" id="ghTokenInput" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" class="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200">
        <p class="text-[10px] text-slate-500 mt-1">
          Generate at <a href="https://github.com/settings/tokens/new" target="_blank" class="text-blue-400 underline">github.com/settings/tokens</a> with <strong>repo</strong> & <strong>workflow</strong> scope.
        </p>
      </div>

      <div class="pt-3 border-t border-[#222738] flex justify-end gap-2">
        <button onclick="closeConfigModal()" class="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white">Cancel</button>
        <button onclick="saveGitHubConfig()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold">Save Settings</button>
      </div>
    </div>
  </div>

  <script>
    let isLive = false;
    let selectedVideoUrl = null;
    let selectedVideoName = null;
    let currentRunId = null;
    let pollInterval = null;

    const videoEl = document.getElementById('previewVideo');
    const playBtn = document.getElementById('playBtn');

    // Load Saved GitHub Config from LocalStorage
    function getGHConfig() {
      return {
        repo: localStorage.getItem('fluid_gh_repo') || 'DHANESHJOSHI/YT-streams',
        token: localStorage.getItem('fluid_gh_token') || '',
        branch: localStorage.getItem('fluid_gh_branch') || 'main',
      };
    }

    function openConfigModal() {
      const cfg = getGHConfig();
      document.getElementById('ghRepoInput').value = cfg.repo;
      document.getElementById('ghTokenInput').value = cfg.token;
      document.getElementById('configModal').classList.remove('hidden');
    }

    function closeConfigModal() {
      document.getElementById('configModal').classList.add('hidden');
    }

    function saveGitHubConfig() {
      const repo = document.getElementById('ghRepoInput').value.trim();
      const token = document.getElementById('ghTokenInput').value.trim();
      if (!token) {
        alert('Please enter your GitHub Token!');
        return;
      }
      localStorage.setItem('fluid_gh_repo', repo);
      localStorage.setItem('fluid_gh_token', token);
      closeConfigModal();
      checkCloudStreamStatus();
    }

    // Check Cloud Stream Status from GitHub
    async function checkCloudStreamStatus() {
      const cfg = getGHConfig();
      if (!cfg.token) return;

      try {
        const res = await fetch('/api/github/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        const data = await res.json();

        if (data.isLive) {
          isLive = true;
          currentRunId = data.runId;
          updateLiveUI(true, data.durationSeconds || 0, data.htmlUrl);
        } else {
          if (isLive) {
            isLive = false;
            updateLiveUI(false);
          }
        }
      } catch (e) {
        console.warn('Status poll warning:', e);
      }
    }

    function updateLiveUI(live, duration = 0, htmlUrl = null) {
      const btn = document.getElementById('streamBtn');
      const badge = document.getElementById('liveBadge');
      const dot = document.getElementById('liveDot');
      const text = document.getElementById('liveText');
      const timer = document.getElementById('uptimeTimer');

      if (live) {
        btn.disabled = false;
        btn.className = "min-w-[210px] h-11 px-6 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer bg-red-600 hover:bg-red-500 text-white glow-red animate-pulse";
        btn.innerHTML = "<span>Stop Cloud Stream</span>";

        badge.className = "flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wider transition-all border bg-red-500/15 border-red-500/40 text-red-400 glow-red";
        dot.className = "w-2 h-2 rounded-full bg-red-500 animate-ping";
        text.innerText = "LIVE (CLOUD 24/7)";

        const h = Math.floor(duration / 3600);
        const m = Math.floor((duration % 3600) / 60);
        const s = duration % 60;
        timer.innerText = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
      } else {
        btn.disabled = false;
        btn.className = "min-w-[210px] h-11 px-6 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/25";
        btn.innerHTML = "<span>Start Cloud Stream</span>";

        badge.className = "flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wider transition-all border bg-slate-800/60 border-slate-700/60 text-slate-400";
        dot.className = "w-2 h-2 rounded-full bg-slate-500";
        text.innerText = "OFFLINE";
      }
    }

    // Toggle Stream Action directly from Web UI
    async function handleToggleStream() {
      const btn = document.getElementById('streamBtn');
      const cfg = getGHConfig();

      if (!cfg.token) {
        openConfigModal();
        return;
      }

      if (!isLive) {
        const key = document.getElementById('streamKeyInput').value.trim();
        const srv = document.getElementById('rtmpServerInput').value.trim();

        if (!selectedVideoUrl) {
          alert('Please select or upload a video first!');
          return;
        }
        if (!key) {
          alert('Please enter your YouTube stream key!');
          return;
        }

        const overlayEnabled = document.getElementById('overlayEnableToggle').checked;
        const overlayText = overlayEnabled ? document.getElementById('overlayTextInput').value.trim() : '';

        btn.disabled = true;
        btn.innerText = "Dispatching Cloud Runner...";

        try {
          const res = await fetch('/api/github/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repo: cfg.repo,
              token: cfg.token,
              branch: cfg.branch,
              videoUrl: window.location.origin + selectedVideoUrl,
              rtmpServer: srv,
              streamKey: key,
              overlayText,
              overlayXPct: currentOverlayXPct,
              overlayYPct: currentOverlayYPct,
              overlayFontSize: currentFontSize,
              overlayColor: currentTextColor,
              overlayTransform: currentTransform,
              overlayBox: document.getElementById('boxBgToggle').checked ? "true" : "false",
            }),
          });

          const data = await res.json();
          if (!data.success) {
            alert(data.message || 'Failed to trigger cloud stream');
            btn.disabled = false;
            btn.innerText = "Start Cloud Stream";
            return;
          }

          alert('🚀 24/7 Cloud Live Stream has been dispatched on GitHub Actions! You can now turn off your PC.');
          setTimeout(checkCloudStreamStatus, 3000);
        } catch (e) {
          alert('Error starting cloud stream: ' + e.message);
          btn.disabled = false;
          btn.innerText = "Start Cloud Stream";
        }
      } else {
        if (!confirm('Stop 24/7 live stream on YouTube?')) return;
        btn.disabled = true;
        btn.innerText = "Stopping Cloud Runner...";

        try {
          await fetch('/api/github/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repo: cfg.repo,
              token: cfg.token,
              runId: currentRunId,
            }),
          });
          setTimeout(checkCloudStreamStatus, 2000);
        } catch (e) {
          alert('Error stopping cloud stream: ' + e.message);
        }
      }
    }

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
      updateTextOverlay();
      loadVideos();
    }

    let currentOverlayXPct = 50;
    let currentOverlayYPct = 12;
    let currentFontSize = 48;
    let currentTextColor = 'yellow';
    let currentTransform = 'none';

    let isDraggingText = false;
    let isResizingText = false;
    let activeHandle = null;
    let startMouseX = 0;
    let startMouseY = 0;
    let startXPct = 50;
    let startYPct = 12;
    let startFontSize = 48;

    function setTextTransform(t) {
      currentTransform = t;
      ['btnUpper', 'btnLower', 'btnCap', 'btnNone'].forEach(id => {
        const b = document.getElementById(id);
        if (b) {
          b.className = b.className.replace('text-blue-400 bg-blue-950/60', 'text-slate-400');
        }
      });
      const activeMap = { uppercase: 'btnUpper', lowercase: 'btnLower', capitalize: 'btnCap', none: 'btnNone' };
      const activeBtn = document.getElementById(activeMap[t]);
      if (activeBtn) {
        activeBtn.className = activeBtn.className.replace('text-slate-400', 'text-blue-400 bg-blue-950/60');
      }
      updateTextOverlay();
    }

    function setTextColor(c) {
      currentTextColor = c;
      const colors = ['yellow', 'white', 'cyan', 'green', 'red', 'magenta', 'orange'];
      colors.forEach(col => {
        const btn = document.getElementById('colBtn_' + col);
        if (btn) {
          if (col === c) {
            btn.classList.add('border-2', 'ring-2', 'ring-blue-400', 'scale-110');
          } else {
            btn.classList.remove('border-2', 'ring-2', 'ring-blue-400', 'scale-110');
            btn.classList.add('border', 'border-slate-600');
          }
        }
      });
      updateTextOverlay();
    }

    function setPosX(val, updateSlider = true) {
      currentOverlayXPct = parseInt(val, 10);
      document.getElementById('posXLabel').innerText = currentOverlayXPct + '%';
      if (updateSlider) document.getElementById('posXSlider').value = currentOverlayXPct;
      applyTransformBoxPosition();
    }

    function setPosY(val, updateSlider = true) {
      currentOverlayYPct = parseInt(val, 10);
      document.getElementById('posYLabel').innerText = currentOverlayYPct + '%';
      if (updateSlider) document.getElementById('posYSlider').value = currentOverlayYPct;
      applyTransformBoxPosition();
    }

    function setFontSize(val) {
      currentFontSize = parseInt(val, 10);
      document.getElementById('fontSizeLabel').innerText = currentFontSize + 'px';
      document.getElementById('fontSizeSlider').value = currentFontSize;
      updateTextOverlay();
    }

    function quickAlign(type) {
      if (type === 'top') {
        setPosY(10);
        setPosX(50);
      } else if (type === 'center') {
        setPosY(50);
        setPosX(50);
      } else if (type === 'bottom') {
        setPosY(88);
        setPosX(50);
      } else if (type === 'centerX') {
        setPosX(50);
      }
    }

    function applyTransformBoxPosition() {
      const box = document.getElementById('obsTransformContainer');
      if (box) {
        box.style.left = currentOverlayXPct + '%';
        box.style.top = currentOverlayYPct + '%';
      }
    }

    function updateTextOverlay() {
      const enabled = document.getElementById('overlayEnableToggle').checked;
      const rawText = document.getElementById('overlayTextInput').value;
      const box = document.getElementById('obsTransformContainer');
      const span = document.getElementById('overlayTextSpan');
      const bounding = document.getElementById('obsBoundingBox');
      const hasBox = document.getElementById('boxBgToggle').checked;

      if (!enabled || !rawText.trim() || !selectedVideoUrl) {
        if (box) box.classList.add('hidden');
        return;
      }

      if (box) box.classList.remove('hidden');

      let displayText = rawText;
      if (currentTransform === 'uppercase') {
        displayText = rawText.toUpperCase();
      } else if (currentTransform === 'lowercase') {
        displayText = rawText.toLowerCase();
      } else if (currentTransform === 'capitalize') {
        displayText = rawText.replace(/\\b\\w/g, c => c.toUpperCase());
      }
      span.innerText = displayText;

      const colorMap = {
        yellow: '#facc15',
        white: '#ffffff',
        cyan: '#06b6d4',
        green: '#22c55e',
        red: '#ef4444',
        magenta: '#d946ef',
        orange: '#f97316',
      };
      span.style.color = colorMap[currentTextColor] || '#facc15';

      // Scale preview font size based on video height
      const videoH = videoEl.clientHeight || 450;
      const scaledSize = Math.max(12, Math.round((currentFontSize / 720) * videoH * 0.9));
      span.style.fontSize = scaledSize + 'px';

      if (hasBox) {
        bounding.style.backgroundColor = 'rgba(0, 0, 0, 0.70)';
        bounding.style.padding = '6px 14px';
        bounding.style.borderRadius = '8px';
      } else {
        bounding.style.backgroundColor = 'transparent';
        bounding.style.padding = '4px 6px';
      }

      applyTransformBoxPosition();
    }

    function initTextOverlayDragAndResize() {
      const box = document.getElementById('obsTransformContainer');
      if (!box) return;

      // Mouse drag start
      box.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('obs-handle')) return;
        e.preventDefault();
        isDraggingText = true;
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startXPct = currentOverlayXPct;
        startYPct = currentOverlayYPct;
        document.body.style.cursor = 'grabbing';
      });

      // Resize handles
      box.querySelectorAll('.obs-handle').forEach(h => {
        h.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          isResizingText = true;
          activeHandle = h;
          startMouseX = e.clientX;
          startMouseY = e.clientY;
          startFontSize = currentFontSize;
        });
      });

      window.addEventListener('mousemove', (e) => {
        if (isDraggingText) {
          const rect = videoEl.getBoundingClientRect();
          if (!rect.width || !rect.height) return;

          const deltaX = e.clientX - startMouseX;
          const deltaY = e.clientY - startMouseY;

          const newXPct = Math.max(5, Math.min(95, Math.round(startXPct + (deltaX / rect.width) * 100)));
          const newYPct = Math.max(5, Math.min(95, Math.round(startYPct + (deltaY / rect.height) * 100)));

          setPosX(newXPct, true);
          setPosY(newYPct, true);
        } else if (isResizingText && activeHandle) {
          const deltaY = e.clientY - startMouseY;
          let factor = 1;
          if (activeHandle.classList.contains('handle-tl') || activeHandle.classList.contains('handle-t')) {
            factor = -1;
          }
          const newSize = Math.max(18, Math.min(96, Math.round(startFontSize + deltaY * factor * 0.4)));
          setFontSize(newSize);
        }
      });

      window.addEventListener('mouseup', () => {
        if (isDraggingText || isResizingText) {
          isDraggingText = false;
          isResizingText = false;
          activeHandle = null;
          document.body.style.cursor = 'default';
        }
      });
    }

    async function uploadSelectedVideo(file) {
      if (!file) return;
      const progressContainer = document.getElementById('uploadProgressContainer');
      const progressBar = document.getElementById('uploadProgressBar');
      const percentText = document.getElementById('uploadPercent');

      progressContainer.classList.remove('hidden');
      progressBar.style.width = '0%';
      percentText.innerText = '0%';

      // Large file multipart upload (> 40MB)
      if (file.size > 40 * 1024 * 1024) {
        try {
          const createRes = await fetch('/api/upload/multipart/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentType: file.type || 'video/mp4' })
          });
          const createData = await createRes.json();
          if (!createData.success) throw new Error(createData.error || 'Init failed');

          const { uploadId, key } = createData;
          const chunkSize = 20 * 1024 * 1024; // 20 MB chunks
          const totalChunks = Math.ceil(file.size / chunkSize);
          const parts = [];

          for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(file.size, start + chunkSize);
            const chunk = file.slice(start, end);
            const partNum = i + 1;

            const pct = Math.round((start / file.size) * 100);
            progressBar.style.width = pct + '%';
            percentText.innerText = pct + '% (' + partNum + '/' + totalChunks + ')';

            const partRes = await fetch('/api/upload/multipart/part?uploadId=' + encodeURIComponent(uploadId) + '&key=' + encodeURIComponent(key) + '&partNumber=' + partNum, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: chunk
            });
            const partData = await partRes.json();
            if (!partData.success) throw new Error('Part ' + partNum + ' error: ' + partData.error);
            parts.push({ partNumber: partData.partNumber, etag: partData.etag });
          }

          percentText.innerText = 'Finalizing...';
          progressBar.style.width = '100%';

          const compRes = await fetch('/api/upload/multipart/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId, key, parts })
          });
          const compData = await compRes.json();
          if (!compData.success) throw new Error(compData.error || 'Completion failed');

          progressContainer.classList.add('hidden');
          await loadVideos();
          selectVideo(compData.url, file.name);
          return;
        } catch (e) {
          progressContainer.classList.add('hidden');
          alert('Upload failed: ' + e.message);
          return;
        }
      }

      // Small file upload
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

    async function handleLogout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    }

    // Sync video wrapper dimensions on video load/resize
    videoEl.addEventListener('loadedmetadata', () => {
      updateTextOverlay();
    });
    window.addEventListener('resize', () => {
      updateTextOverlay();
    });

    // Initial Load & Status Poll
    loadVideos();
    initTextOverlayDragAndResize();
    checkCloudStreamStatus();
    pollInterval = setInterval(checkCloudStreamStatus, 4000);
  </script>
</body>
</html>`;
}
