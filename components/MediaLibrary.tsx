'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  HardDrive,
  UploadCloud,
  Film,
  CheckCircle2,
  Trash2,
  RefreshCw,
  AlertCircle,
  FileVideo,
  Plus
} from 'lucide-react';
import { R2Config, R2VideoItem } from '@/lib/r2';

export interface VideoMediaItem {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
  sourceType: 'r2' | 'local';
  absolutePath?: string;
}

interface MediaLibraryProps {
  selectedVideo: VideoMediaItem | null;
  onSelectVideo: (video: VideoMediaItem) => void;
  r2Config: R2Config | null;
  onOpenSettings: () => void;
}

export default function MediaLibrary({
  selectedVideo,
  onSelectVideo,
  r2Config,
  onOpenSettings,
}: MediaLibraryProps) {
  const [activeTab, setActiveTab] = useState<'r2' | 'local'>('local');
  const [r2Videos, setR2Videos] = useState<VideoMediaItem[]>([]);
  const [localVideos, setLocalVideos] = useState<VideoMediaItem[]>([]);
  const [loadingR2, setLoadingR2] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [isConfiguredR2, setIsConfiguredR2] = useState(true);

  // Upload states
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchLocalVideos = async () => {
    setLoadingLocal(true);
    try {
      const res = await fetch('/api/media/local');
      const data = await res.json();
      if (data.success) {
        setLocalVideos(data.videos || []);
        // Auto-select first local video if nothing selected
        if (!selectedVideo && data.videos && data.videos.length > 0) {
          onSelectVideo(data.videos[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch local videos:', e);
    } finally {
      setLoadingLocal(false);
    }
  };

  const fetchR2Videos = async () => {
    setLoadingR2(true);
    try {
      const res = await fetch('/api/r2/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2Config }),
      });
      const data = await res.json();
      setIsConfiguredR2(data.isConfigured);
      if (data.success) {
        setR2Videos(data.videos || []);
      }
    } catch (e) {
      console.error('Failed to fetch R2 videos:', e);
    } finally {
      setLoadingR2(false);
    }
  };

  useEffect(() => {
    fetchLocalVideos();
    fetchR2Videos();
  }, [r2Config]);

  // Handle direct file upload to Cloudflare R2 using presigned URL
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      // 1. Request presigned URL from API
      const presignedRes = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'video/mp4',
          r2Config,
        }),
      });

      const presignedData = await presignedRes.json();
      if (!presignedRes.ok || !presignedData.success) {
        setUploadError(presignedData.message || 'Failed to initialize R2 upload. Check settings.');
        setUploading(false);
        return;
      }

      // 2. Upload file directly to Cloudflare R2 bucket with XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      xhr.open(presignedData.httpMethod || 'PUT', presignedData.uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploading(false);
          setUploadProgress(100);
          fetchR2Videos();
          setActiveTab('r2');

          // Auto-select newly uploaded video
          const newVideo: VideoMediaItem = {
            key: presignedData.key,
            name: file.name,
            size: file.size,
            lastModified: new Date().toISOString(),
            url: presignedData.publicUrl,
            sourceType: 'r2',
          };
          onSelectVideo(newVideo);
        } else {
          setUploadError(`Upload failed with HTTP ${xhr.status}`);
          setUploading(false);
        }
      };

      xhr.onerror = () => {
        setUploadError('Network error during upload to Cloudflare R2');
        setUploading(false);
      };

      xhr.send(file);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setUploadError(message);
      setUploading(false);
    }
  };

  const handleDeleteR2 = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this video from Cloudflare R2?')) return;

    try {
      const res = await fetch('/api/r2/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, r2Config }),
      });
      if (res.ok) {
        setR2Videos((prev) => prev.filter((v) => v.key !== key));
        if (selectedVideo?.key === key) {
          onSelectVideo(localVideos[0] || null);
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const currentList = activeTab === 'r2' ? r2Videos : localVideos;
  const isLoading = activeTab === 'r2' ? loadingR2 : loadingLocal;

  return (
    <div className="w-80 bg-[#11131a] rounded-xl border border-[#202434] flex flex-col shadow-lg overflow-hidden">
      {/* Header Tabs */}
      <div className="p-2 bg-[#161822] border-b border-[#202434] flex items-center justify-between">
        <div className="flex bg-[#0d0e15] p-1 rounded-lg border border-[#202536] gap-1">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition ${
              activeTab === 'local'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            Local ({localVideos.length})
          </button>

          <button
            onClick={() => setActiveTab('r2')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition ${
              activeTab === 'r2'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            R2 Cloud ({r2Videos.length})
          </button>
        </div>

        <button
          onClick={activeTab === 'r2' ? fetchR2Videos : fetchLocalVideos}
          className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#202536] transition"
          title="Refresh video list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Upload Zone (Upload directly to Cloudflare R2) */}
      <div className="p-3 border-b border-[#202434] bg-[#141620]">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />

        <div
          onClick={() => {
            if (!isConfiguredR2 && activeTab === 'r2') {
              onOpenSettings();
            } else {
              fileInputRef.current?.click();
            }
          }}
          className="border-2 border-dashed border-[#2b3145] hover:border-blue-500/70 rounded-xl p-3 text-center cursor-pointer transition bg-[#0d0f16]/60 hover:bg-[#0d0f16]"
        >
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-300">
            <UploadCloud className="w-4 h-4 text-blue-400" />
            <span>Upload New Video to R2</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            MP4, MOV, MKV up to 5GB &bull; Fast Direct Cloud Upload
          </p>
        </div>

        {uploading && (
          <div className="mt-2.5 space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                Uploading to Cloudflare R2...
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#202434] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {uploadError && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-[10px] text-red-400 flex items-center justify-between">
            <span className="truncate">{uploadError}</span>
            <button
              onClick={onOpenSettings}
              className="text-blue-400 underline font-semibold shrink-0 ml-2"
            >
              Config
            </button>
          </div>
        )}
      </div>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {activeTab === 'r2' && !isConfiguredR2 && (
          <div className="p-4 text-center bg-[#171a26] border border-[#2b3046] rounded-xl my-2">
            <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
            <div className="text-xs font-semibold text-slate-200">Cloudflare R2 Not Configured</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Add your Cloudflare Account ID & R2 API keys in settings to store and stream cloud videos.
            </p>
            <button
              onClick={onOpenSettings}
              className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition"
            >
              Configure R2 Keys
            </button>
          </div>
        )}

        {currentList.length === 0 && !isLoading && (
          <div className="p-6 text-center text-slate-500 text-xs">
            <Film className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No videos found in this source.
          </div>
        )}

        {currentList.map((video) => {
          const isSelected = selectedVideo?.key === video.key;
          return (
            <div
              key={video.key}
              onClick={() => onSelectVideo(video)}
              className={`p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between group ${
                isSelected
                  ? 'bg-blue-950/40 border-blue-500/70 shadow-sm'
                  : 'bg-[#151722] hover:bg-[#1c1f2d] border-[#202538]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-[#0f1118] text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  <FileVideo className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-white">
                    {video.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                    <span>{formatFileSize(video.size)}</span>
                    <span>&bull;</span>
                    <span className="capitalize">{video.sourceType}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                {isSelected ? (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[9px] font-bold">
                    ACTIVE
                  </span>
                ) : (
                  <span className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-[#202538] transition">
                    Select
                  </span>
                )}

                {video.sourceType === 'r2' && (
                  <button
                    onClick={(e) => handleDeleteR2(video.key, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                    title="Delete from R2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
