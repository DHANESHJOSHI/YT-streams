'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Film, RefreshCw, Radio } from 'lucide-react';

interface ProgramMonitorProps {
  videoUrl: string | null;
  videoTitle: string | null;
  isLive: boolean;
  onAudioLevelChange?: (level: number) => void;
}

export default function ProgramMonitor({
  videoUrl,
  videoTitle,
  isLive,
  onAudioLevelChange,
}: ProgramMonitorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Set up Web Audio API analyser to drive live audio VU meters
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const setupAudioAnalyser = () => {
      try {
        if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
        }

        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        if (!analyserRef.current) {
          analyserRef.current = ctx.createAnalyser();
          analyserRef.current.fftSize = 64;
        }

        if (!sourceNodeRef.current) {
          sourceNodeRef.current = ctx.createMediaElementSource(video);
          sourceNodeRef.current.connect(analyserRef.current);
          analyserRef.current.connect(ctx.destination);
        }

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

        const updateMeter = () => {
          if (analyserRef.current && onAudioLevelChange) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((average / 255) * 100));
            onAudioLevelChange(normalized);
          }
          animationFrameRef.current = requestAnimationFrame(updateMeter);
        };

        updateMeter();
      } catch (e) {
        console.warn('AudioContext setup fallback:', e);
      }
    };

    video.addEventListener('play', setupAudioAnalyser);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      video.removeEventListener('play', setupAudioAnalyser);
    };
  }, [onAudioLevelChange]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#11131a] rounded-xl border border-[#202434] overflow-hidden shadow-lg">
      {/* Top Header Bar of Program Monitor */}
      <div className="h-10 bg-[#161822] border-b border-[#202434] px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-xs font-bold tracking-wider text-slate-200">PROGRAM PREVIEW</span>
          {videoTitle && (
            <span className="text-xs text-slate-400 truncate max-w-xs font-mono">
              &bull; {videoTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLive && (
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 rounded text-[10px] font-bold tracking-wider animate-pulse flex items-center gap-1">
              <Radio className="w-3 h-3" /> ON AIR
            </span>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
            9:16 VERTICAL / 16:9
          </span>
        </div>
      </div>

      {/* Main Video Display Area (OBS Studio Stage) */}
      <div className="flex-1 min-h-[380px] bg-[#07080b] relative flex items-center justify-center p-2 group">
        {videoUrl ? (
          <div className="relative max-h-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              loop
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
              }}
              onLoadedMetadata={() => {
                if (videoRef.current) setDuration(videoRef.current.duration);
              }}
              className="max-h-[480px] w-auto max-w-full rounded-lg shadow-2xl object-contain border border-[#222738]"
            />

            {/* Program Guide / Safe Area Markers (OBS style) */}
            <div className="absolute inset-0 pointer-events-none border border-red-500/20 rounded-lg">
              <div className="absolute top-2 left-2 text-[10px] font-mono text-red-400/70 bg-black/60 px-1.5 py-0.5 rounded">
                SAFE AREA
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-[#141722] border border-[#262b3d] flex items-center justify-center mb-4 text-slate-500">
              <Film className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">No Video Loaded</h3>
            <p className="text-xs text-slate-500 mt-1">
              Select a video from Cloudflare R2 or Local Media panel on the left to preview and stream to YouTube Live.
            </p>
          </div>
        )}
      </div>

      {/* Program Monitor Controls Bar */}
      <div className="h-12 bg-[#141620] border-t border-[#202434] px-4 flex items-center gap-3 select-none">
        <button
          onClick={togglePlay}
          disabled={!videoUrl}
          className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center transition shadow-sm cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        {/* Time code */}
        <div className="text-[11px] font-mono text-slate-400 w-24">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Seeker */}
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          disabled={!videoUrl}
          className="flex-1 h-1.5 bg-[#252a3b] rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-40"
        />

        {/* Audio Volume Controls */}
        <div className="flex items-center gap-2 pl-2">
          <button
            onClick={toggleMute}
            disabled={!videoUrl}
            className="text-slate-400 hover:text-slate-200 transition"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            disabled={!videoUrl}
            className="w-16 h-1.5 bg-[#252a3b] rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-40"
          />
        </div>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          disabled={!videoUrl}
          className="text-slate-400 hover:text-slate-200 p-1.5 transition ml-1"
          title="Fullscreen Preview"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
