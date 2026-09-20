'use client';

import { useState, useEffect } from 'react';
import { X, Cloud, Key, Check, Info, Shield, ExternalLink } from 'lucide-react';
import { R2Config } from '@/lib/r2';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  r2Config: R2Config | null;
  onSaveConfig: (config: R2Config) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  r2Config,
  onSaveConfig,
}: SettingsModalProps) {
  const [accountId, setAccountId] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [bucketName, setBucketName] = useState('youtube-streams');
  const [publicDomain, setPublicDomain] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (r2Config) {
      setAccountId(r2Config.accountId || '');
      setAccessKeyId(r2Config.accessKeyId || '');
      setSecretAccessKey(r2Config.secretAccessKey || '');
      setBucketName(r2Config.bucketName || 'youtube-streams');
      setPublicDomain(r2Config.publicDomain || '');
    }
  }, [r2Config, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const config: R2Config = {
      accountId: accountId.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      bucketName: bucketName.trim(),
      publicDomain: publicDomain.trim(),
    };
    onSaveConfig(config);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-[#12141d] border border-[#262b3d] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-[#161824] border-b border-[#24293a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Cloudflare R2 Configuration</h2>
              <p className="text-[11px] text-slate-400">Manage S3 bucket credentials for direct video uploads</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#202536] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              Get your API credentials from <strong>Cloudflare Dashboard &rarr; R2 &rarr; Manage R2 API Tokens</strong>. Videos will be uploaded directly to R2 and streamed to YouTube.
            </div>
          </div>

          {/* Account ID */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Cloudflare Account ID
            </label>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="e.g. 9a8b7c6d5e4f3a2b1c..."
              className="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Bucket Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              R2 Bucket Name
            </label>
            <input
              type="text"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              placeholder="e.g. youtube-streams"
              className="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Access Key ID */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              R2 Access Key ID
            </label>
            <input
              type="text"
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              placeholder="e.g. 7f8a9b..."
              className="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Secret Access Key */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              R2 Secret Access Key
            </label>
            <input
              type="password"
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
              placeholder="Enter Secret Access Key..."
              className="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Public Domain / R2.dev */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
              <span>Public Domain / R2 Dev URL (Optional)</span>
              <span className="text-[10px] text-slate-500">for video preview</span>
            </label>
            <input
              type="text"
              value={publicDomain}
              onChange={(e) => setPublicDomain(e.target.value)}
              placeholder="e.g. pub-xxxx.r2.dev or cdn.yourdomain.com"
              className="w-full px-3 py-2 bg-[#0a0c13] border border-[#262b3d] rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-[#202536] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/20 transition flex items-center gap-1.5"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save R2 Settings</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
