'use client';

import { useState } from 'react';
import { Volume2, VolumeX, Sliders, Music, Radio } from 'lucide-react';

interface AudioMixerProps {
  currentAudioLevel: number; // 0 to 100
  isLive: boolean;
}

export default function AudioMixer({ currentAudioLevel, isLive }: AudioMixerProps) {
  const [faderValue, setFaderValue] = useState(80);
  const [isMuted, setIsMuted] = useState(false);

  // Calculate simulated dB and peak levels
  const effectiveLevel = isMuted ? 0 : Math.round((currentAudioLevel * faderValue) / 100);
  const calculatedDb = isMuted || effectiveLevel === 0 ? -60 : Math.round(-60 + (effectiveLevel * 0.6));

  return (
    <div className="w-80 bg-[#11131a] rounded-xl border border-[#202434] p-3.5 flex flex-col shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#202434] mb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold tracking-wider text-slate-200">AUDIO MIXER</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 bg-[#171a25] text-slate-400 rounded border border-[#262b3e]">
          AAC 192k &bull; 44.1kHz
        </span>
      </div>

      <div className="space-y-4 flex-1 flex flex-col justify-around">
        {/* Track 1: Media Audio (from Video) */}
        <div className="bg-[#161822] p-3 rounded-lg border border-[#222738]">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5 truncate max-w-[140px]">
              <Music className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              Media Source Audio
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {calculatedDb > -1 ? '0.0 dB' : `${calculatedDb}.0 dB`}
            </span>
          </div>

          {/* VU Meter Bars (Stereo Left / Right) */}
          <div className="space-y-1.5 mb-3 bg-[#0a0b0f] p-2 rounded-md border border-[#1e2232]">
            {/* Left Channel */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-slate-500 w-2.5">L</span>
              <div className="flex-1 h-3 bg-[#151722] rounded overflow-hidden relative">
                <div
                  className="h-full vu-meter-bar transition-all duration-75 rounded"
                  style={{ width: `${effectiveLevel}%` }}
                />
                {/* dB tick lines */}
                <div className="absolute inset-0 flex justify-between px-1 pointer-events-none opacity-20">
                  <div className="w-[1px] h-full bg-white" />
                  <div className="w-[1px] h-full bg-white" />
                  <div className="w-[1px] h-full bg-white" />
                </div>
              </div>
            </div>

            {/* Right Channel */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-slate-500 w-2.5">R</span>
              <div className="flex-1 h-3 bg-[#151722] rounded overflow-hidden relative">
                <div
                  className="h-full vu-meter-bar transition-all duration-75 rounded"
                  style={{ width: `${Math.max(0, effectiveLevel - (effectiveLevel > 20 ? 3 : 0))}%` }}
                />
              </div>
            </div>

            {/* dB scale legends */}
            <div className="flex justify-between text-[8px] font-mono text-slate-600 px-3 pt-0.5">
              <span>-60</span>
              <span>-40</span>
              <span>-20</span>
              <span>-10</span>
              <span className="text-amber-500">-5</span>
              <span className="text-red-500">0</span>
            </div>
          </div>

          {/* Volume Fader Slider */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-1.5 rounded transition ${
                isMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-slate-400 hover:text-white bg-[#1e2230]'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : faderValue}
              onChange={(e) => {
                setFaderValue(parseInt(e.target.value, 10));
                if (isMuted) setIsMuted(false);
              }}
              className="flex-1 h-1.5 bg-[#252a3b] rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
              {isMuted ? '0%' : `${faderValue}%`}
            </span>
          </div>
        </div>

        {/* Track 2: Master YouTube Live Stream Output */}
        <div className="bg-[#161822] p-3 rounded-lg border border-[#222738]">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Radio className={`w-3.5 h-3.5 ${isLive ? 'text-red-500 animate-pulse' : 'text-slate-500'}`} />
              Master RTMP Audio
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">
              {isLive ? 'ENCODING OK' : 'READY'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Audio is encoded to AAC 192 kbps 44.1kHz with sync locked to video timestamp clock.
          </div>
        </div>
      </div>
    </div>
  );
}
