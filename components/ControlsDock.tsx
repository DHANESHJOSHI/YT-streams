'use client';

import { useState } from 'react';
import {
  Radio,
  Square,
  Repeat,
  Key,
  Globe,
  Terminal,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff
} from 'lucide-react';
import { StreamStats } from '@/lib/streamer';
import { VideoMediaItem } from './MediaLibrary';

interface ControlsDockProps {
  stats: StreamStats;
  selectedVideo: VideoMediaItem | null;
  onStartStream: (rtmpServer: string, streamKey: string, loop: boolean) => Promise<void>;
  onStopStream: () => Promise<void>;
  initialStreamKey?: string;
}

export default function ControlsDock({
  stats,
  selectedVideo,
  onStartStream,
  onStopStream,
  initialStreamKey = '',
}: ControlsDockProps) {
  const [rtmpServer, setRtmpServer] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState(initialStreamKey);
  const [showKey, setShowKey] = useState(false);
  const [loopStream, setLoopStream] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleToggleStream = async () => {
    setErrorMessage(null);

    if (stats.isLive || stats.status === 'connecting') {
      setSubmitting(true);
      try {
        await onStopStream();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!selectedVideo) {
        setErrorMessage('Please select a video file to stream.');
        return;
      }
      if (!streamKey.trim()) {
        setErrorMessage('YouTube Stream Key is required.');
        return;
      }

      setSubmitting(true);
      try {
        await onStartStream(rtmpServer.trim(), streamKey.trim(), loopStream);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="bg-[#11131a] rounded-xl border border-[#202434] shadow-xl flex flex-col overflow-hidden">
      {/* Controls Bar */}
      <div className="p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Left: RTMP Settings Inputs */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {/* RTMP Server URL */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              YouTube RTMP Server
            </label>
            <input
              type="text"
              value={rtmpServer}
              onChange={(e) => setRtmpServer(e.target.value)}
              placeholder="rtmp://a.rtmp.youtube.com/live2"
              disabled={stats.isLive}
              className="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* YouTube Stream Key */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                Stream Key
              </span>
              <span className="text-[10px] text-slate-500 lowercase">from YouTube Studio</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                placeholder="Paste YouTube Stream Key (e.g. sk_...)"
                disabled={stats.isLive}
                className="w-full pl-3 pr-10 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Loop, Status, & Start/Stop Streaming Button */}
        <div className="flex items-center gap-4 w-full lg:w-auto justify-end">
          {/* Loop 24/7 Option */}
          <label className="flex items-center gap-2 cursor-pointer select-none bg-[#161822] px-3 py-2 rounded-lg border border-[#242838]">
            <input
              type="checkbox"
              checked={loopStream}
              onChange={(e) => setLoopStream(e.target.checked)}
              disabled={stats.isLive}
              className="rounded bg-[#0a0c13] border-slate-700 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
            <Repeat className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-slate-300 font-medium">Loop 24/7</span>
          </label>

          {/* Toggle Stream Button (OBS Style) */}
          <button
            onClick={handleToggleStream}
            disabled={submitting}
            className={`min-w-[190px] h-11 px-6 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 ${
              stats.isLive
                ? 'bg-red-600 hover:bg-red-500 text-white glow-red border border-red-500/50 animate-pulse'
                : stats.status === 'connecting'
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/25 border border-blue-500/30'
            }`}
          >
            {submitting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : stats.isLive ? (
              <>
                <Square className="w-4 h-4 fill-white" />
                <span>Stop Streaming</span>
              </>
            ) : stats.status === 'connecting' ? (
              <>
                <span className="w-3 h-3 rounded-full bg-white animate-ping" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                <span>Start Streaming</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-4 mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Live Stream Console Drawer Header */}
      <div className="bg-[#0b0c11] border-t border-[#1e2230] px-4 py-2 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-400">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-300">Live Stream Diagnostics</span>
          {stats.videoName && (
            <span className="text-slate-500 hidden sm:inline">&bull; Source: {stats.videoName}</span>
          )}
        </div>

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
        >
          <span>{showLogs ? 'Hide Console' : 'View Stream Logs'}</span>
          {showLogs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Collapsible Diagnostics Terminal */}
      {showLogs && (
        <div className="bg-[#07080b] p-3 text-[11px] font-mono text-slate-300 border-t border-[#191c28] max-h-48 overflow-y-auto space-y-1">
          {stats.logTail && stats.logTail.length > 0 ? (
            stats.logTail.map((log, idx) => (
              <div key={idx} className="text-slate-400 whitespace-pre-wrap leading-tight">
                {log}
              </div>
            ))
          ) : (
            <div className="text-slate-600">No active stream process logs yet. Hit Start Streaming to connect.</div>
          )}
        </div>
      )}
    </div>
  );
}
