'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import ProgramMonitor from '@/components/ProgramMonitor';
import MediaLibrary, { VideoMediaItem } from '@/components/MediaLibrary';
import AudioMixer from '@/components/AudioMixer';
import ControlsDock from '@/components/ControlsDock';
import SettingsModal from '@/components/SettingsModal';
import { StreamStats } from '@/lib/streamer';
import { R2Config } from '@/lib/r2';

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

export default function StudioDashboard() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [stats, setStats] = useState<StreamStats>(defaultStats);
  const [selectedVideo, setSelectedVideo] = useState<VideoMediaItem | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [r2Config, setR2Config] = useState<R2Config | null>(null);
  const [initialStreamKey, setInitialStreamKey] = useState('');

  // 1. Check Authentication on Mount
  useEffect(() => {
    async function verifySession() {
      try {
        const res = await fetch('/api/auth/check');
        const data = await res.json();
        if (!data.authenticated) {
          router.replace('/login');
          return;
        }

        // Fetch initial config (stream key from key.txt, etc.)
        const confRes = await fetch('/api/config/initial');
        if (confRes.ok) {
          const conf = await confRes.json();
          if (conf.defaultKey) {
            setInitialStreamKey(conf.defaultKey);
          }
        }

        // Load R2 config from localStorage if present
        const savedR2 = localStorage.getItem('fluid_r2_config');
        if (savedR2) {
          try {
            setR2Config(JSON.parse(savedR2));
          } catch (e) {
            console.error(e);
          }
        }

        setLoadingAuth(false);
      } catch {
        router.replace('/login');
      }
    }
    verifySession();
  }, [router]);

  // 2. Poll Stream Stats every 1.5 seconds
  const fetchStreamStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stream/status');
      if (res.ok) {
        const data: StreamStats = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.warn('Status poll error:', e);
    }
  }, []);

  useEffect(() => {
    if (loadingAuth) return;
    fetchStreamStats();
    const interval = setInterval(fetchStreamStats, 1500);
    return () => clearInterval(interval);
  }, [loadingAuth, fetchStreamStats]);

  // 3. Actions
  const handleStartStream = async (rtmpServer: string, streamKey: string, loop: boolean) => {
    if (!selectedVideo) {
      throw new Error('No video selected for streaming');
    }

    const videoSource =
      selectedVideo.sourceType === 'local' && selectedVideo.absolutePath
        ? selectedVideo.absolutePath
        : selectedVideo.url;

    const res = await fetch('/api/stream/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoSource,
        videoName: selectedVideo.name,
        rtmpServer,
        streamKey,
        loop,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to start stream');
    }

    await fetchStreamStats();
  };

  const handleStopStream = async () => {
    const res = await fetch('/api/stream/stop', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to stop stream');
    }
    await fetchStreamStats();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleSaveR2Config = (newConfig: R2Config) => {
    setR2Config(newConfig);
    localStorage.setItem('fluid_r2_config', JSON.stringify(newConfig));
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#090a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-mono">Loading Fluid Studio...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col">
      {/* Top OBS-style Header */}
      <Header
        stats={stats}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Studio Viewport */}
      <main className="flex-1 p-3 flex flex-col gap-3 max-w-[1920px] mx-auto w-full">
        {/* Top Section: Media Library (Left) + Program Monitor (Center) + Audio Mixer (Right) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-[500px]">
          {/* Left Panel: Media Sources (R2 & Local) */}
          <MediaLibrary
            selectedVideo={selectedVideo}
            onSelectVideo={setSelectedVideo}
            r2Config={r2Config}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {/* Center Stage: Program Monitor (Video Preview) */}
          <ProgramMonitor
            videoUrl={selectedVideo ? selectedVideo.url : null}
            videoTitle={selectedVideo ? selectedVideo.name : null}
            isLive={stats.isLive}
            onAudioLevelChange={setAudioLevel}
          />

          {/* Right Panel: Audio Mixer with live VU Meters */}
          <AudioMixer
            currentAudioLevel={audioLevel}
            isLive={stats.isLive}
          />
        </div>

        {/* Bottom OBS Control Dock: RTMP server, Key, Start/Stop Broadcast */}
        <ControlsDock
          stats={stats}
          selectedVideo={selectedVideo}
          onStartStream={handleStartStream}
          onStopStream={handleStopStream}
          initialStreamKey={initialStreamKey}
        />
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        r2Config={r2Config}
        onSaveConfig={handleSaveR2Config}
      />
    </div>
  );
}
