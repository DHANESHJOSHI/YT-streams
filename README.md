# 🎙️ Fluid Live Studio (OBS Cloud Broadcast Web App)

A professional OBS-style Web Studio built with **Next.js 14**, **Tailwind CSS**, **Cloudflare R2**, and **FFmpeg**.

Stream your video files directly from **Cloudflare R2** or local storage to **YouTube Live** (or Twitch / Custom RTMP) 24/7 with full audio sync, interactive VU meters, and password protection.

---

## 🔐 Authentication
The studio is protected with a password gate:
- **Password**: `fluidislive@2026`
- **Session**: 30-day encrypted secure HttpOnly cookie

---

## 🚀 Quick Start (Run Locally)

The production server is currently built and running at **`http://localhost:3000`**!

1. Open your browser at:
   ```
   http://localhost:3000
   ```
2. Enter the password:
   ```
   fluidislive@2026
   ```
3. Your local videos (`iPhone Dial Pad song guessing challenge...` and `YTDown...720p.mp4`) are already detected in the **Local Media** tab.
4. Paste your **YouTube Stream Key** in the bottom dock.
5. Hit **"START STREAMING"** — FFmpeg will instantly connect to YouTube RTMP and stream with synchronized audio!

---

## ☁️ Cloudflare R2 Storage Setup

To upload new videos directly to Cloudflare R2 and stream them from the cloud:

1. Go to your **[Cloudflare Dashboard](https://dash.cloudflare.com/)** &rarr; **R2**.
2. Click **Create bucket** (e.g. `youtube-streams`).
3. Under **Account Details** on the right, copy your **Account ID**.
4. Click **Manage R2 API Tokens** &rarr; **Create API Token**:
   - Permissions: **Object Read & Write**
   - Copy the **Access Key ID** and **Secret Access Key**.
5. In Fluid Live Studio:
   - Click the **"R2 Settings"** button in the top bar.
   - Enter your `Account ID`, `Access Key ID`, `Secret Access Key`, and `Bucket Name`.
   - Click **Save**.
6. Now you can drag & drop any video (up to 5GB) into the **Upload New Video to R2** dropzone. It uploads directly from your browser to Cloudflare R2 via secure presigned URLs!

---

## ⚡ Deployment Options: Vercel vs Cloudflare vs 24/7 Cloud Runner

### 1. Web Studio Frontend (Vercel or Cloudflare Pages)
The Web UI, R2 Video Uploader, Program Preview, and Media Manager can be deployed to **Vercel** or **Cloudflare Pages** with 1 click:
```bash
# Push your code to GitHub, then import to Vercel or Cloudflare Pages:
# Add Environment Variable in Vercel/Cloudflare Settings:
APP_PASSWORD=fluidislive@2026
AUTH_SECRET=any_random_secure_string_here
```

### 2. 24/7 Background RTMP Live Streaming (FFmpeg)
> ⚠️ **Important Technical Note on Serverless Limits**:
> Vercel and Cloudflare Workers are **serverless** platforms with execution timeouts (10s–60s) and do not include the FFmpeg binary. A YouTube live stream running for 1h28m or 24/7 cannot run inside a serverless function.
> 
> **How to run 24/7 continuous streaming:**
> - **Option A (Local / Home Server)**: Keep `npm run start` running on your PC or home server. It streams directly to YouTube using your local FFmpeg (`/usr/bin/ffmpeg`).
> - **Option B (1-Click Docker Cloud Deploy - 24/7 Free/Cheap)**:
>   Deploy the included `Dockerfile` to **Railway**, **Render**, **Fly.io**, or **Koyeb**. The container includes FFmpeg and will run your live stream 24/7 without your PC needing to be on!

---

## 🛠️ Project Structure
```
dailpad/
├── app/
│   ├── api/
│   │   ├── auth/           # Login / Logout / Check session
│   │   ├── config/         # Initial stream key loader (from key.txt)
│   │   ├── media/          # Local video scanner & HTTP range streaming
│   │   ├── r2/             # Cloudflare R2 presigned upload & list APIs
│   │   └── stream/         # RTMP Start / Stop / Real-time Status polling
│   ├── globals.css         # OBS dark broadcast theme & VU meter styling
│   ├── layout.tsx          # App root layout
│   ├── login/page.tsx      # Password authentication gate
│   └── page.tsx            # Main OBS Broadcast Studio Dashboard
├── components/
│   ├── AudioMixer.tsx      # Stereo VU Peak Meters (-60dB to 0dB) & Fader
│   ├── ControlsDock.tsx    # RTMP Server, Key, Loop toggle, Start/Stop button
│   ├── Header.tsx          # Live status pill, Bitrate, FPS, Duration timer
│   ├── MediaLibrary.tsx    # R2 Cloud & Local video manager with uploader
│   ├── ProgramMonitor.tsx  # Video preview player with audio analyser
│   └── SettingsModal.tsx   # Cloudflare R2 credentials manager
├── lib/
│   ├── auth.ts             # Password verification & session tokens
│   ├── r2.ts               # AWS S3 SDK for Cloudflare R2
│   └── streamer.ts         # Native FFmpeg process runner & live stats parser
├── Dockerfile              # Production Docker image with FFmpeg pre-installed
├── key.txt                 # YouTube RTMP server and stream key
└── package.json            # Next.js 14, Tailwind, S3 SDK
```
