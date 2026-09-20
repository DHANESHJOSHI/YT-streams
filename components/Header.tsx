'use client';

import { Radio, Settings, LogOut, Clock, Activity, Cpu, ShieldCheck } from 'lucide-react';
import { StreamStats } from '@/lib/streamer';

interface HeaderProps {
  stats: StreamStats;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export default function Header({ stats, onOpenSettings, onLogout }: HeaderProps) {
  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="h-14 bg-[#11131a] border-b border-[#202434] px-4 flex items-center justify-between select-none">
      {/* Brand & Live Pill */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white leading-none">
              FLUID STUDIO
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Broadcast Control</div>
          </div>
        </div>

        {/* OBS-style Live Badge */}
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wider transition-all border ${
            stats.isLive
              ? 'bg-red-500/15 border-red-500/40 text-red-400 glow-red'
              : stats.status === 'connecting'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 animate-pulse'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              stats.isLive
                ? 'bg-red-500 animate-ping'
                : stats.status === 'connecting'
                ? 'bg-amber-400'
                : 'bg-slate-500'
            }`}
          />
          <span>{stats.isLive ? 'LIVE' : stats.status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* OBS Status Bar (FPS, Bitrate, Timer, Dropped Frames) */}
      <div className="hidden md:flex items-center gap-5 text-xs font-mono bg-[#0c0d12] py-1.5 px-4 rounded-lg border border-[#1e2230]">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{formatUptime(stats.uptimeSeconds)}</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-800" />

        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">Bitrate:</span>
          <span className="text-blue-300 font-semibold">{stats.bitrate || '0 kbps'}</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-800" />

        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">FPS:</span>
          <span className="text-emerald-400 font-semibold">{stats.fps > 0 ? stats.fps.toFixed(1) : '30.0'}</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-800" />

        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Drop:</span>
          <span className="text-emerald-400 font-semibold">0.0%</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-800" />

        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-400">Encoder:</span>
          <span className="text-slate-300">Fast RTMP</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181b24] hover:bg-[#202432] border border-[#272c3d] rounded-lg text-xs font-medium text-slate-300 hover:text-white transition"
          title="Configure Cloudflare R2 and Stream Settings"
        >
          <Settings className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">R2 Settings</span>
        </button>

        <button
          onClick={onLogout}
          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
