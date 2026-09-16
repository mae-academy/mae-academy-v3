import React, { useState } from 'react';
import { Share2, Copy, Check, X, Link2, CircuitBoard } from 'lucide-react';
import { toast } from 'sonner';

export interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  componentCount: number;
  wireCount: number;
  previewUrl?: string | null;
}

export function ShareProjectModal({
  isOpen,
  onClose,
  shareUrl,
  componentCount,
  wireCount,
  previewUrl,
}: ShareProjectModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Project link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const hasNativeShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: 'MAE Academy Circuit', url: shareUrl }).catch(() => {});
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm bg-black/60 overflow-hidden overscroll-none select-none animate-in fade-in duration-200"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Share Project"
    >
      <div
        className="relative bg-white dark:bg-[#0d0f12] border border-slate-200 dark:border-[#1b2028] rounded-2xl shadow-2xl p-6 w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 select-auto"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#1a1f26]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <Share2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Share Project
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Interactive simulation deep-link with live schematic state
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a1f26] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col">
          {/* Circuit Preview */}
          <div className="mt-4 relative rounded-xl border border-slate-200 dark:border-[#1b2028] bg-slate-50/70 dark:bg-[#13161c] overflow-hidden flex items-center justify-center h-44 w-full">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Circuit Preview"
                className="max-h-full max-w-full object-contain p-3 pointer-events-none select-none"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                <CircuitBoard size={32} className="opacity-60" />
                <span className="text-xs font-medium">MAE Academy Schematic</span>
              </div>
            )}
            <div className="absolute bottom-2 right-2 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-[#0d0f12]/80 backdrop-blur-xs border border-slate-200/80 dark:border-[#1b2028] text-[11px] text-slate-600 dark:text-slate-400 font-mono">
              <span>{componentCount} parts</span>
              <span>•</span>
              <span>{wireCount} wires</span>
            </div>
          </div>

          {/* Deep Link URL */}
          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Link2 size={13} className="text-slate-400" />
              Shareable Deep Link URL
            </label>
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="bg-slate-50 dark:bg-[#161a22] border border-slate-200 dark:border-[#222834] text-slate-500 dark:text-slate-400 p-3 rounded-lg w-full text-xs font-mono select-all outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Anyone opening this URL can view, interact with, and simulate this exact circuit state in real-time.
            </p>
          </div>

          {/* Action Buttons (Flex Row) */}
          <div className="mt-5 flex items-center gap-3 w-full">
            {/* Button 1: Copy Link */}
            <button
              type="button"
              onClick={handleCopy}
              className="bg-gradient-to-r from-blue-600 via-purple-600 to-rose-500 text-white font-semibold hover:opacity-95 shadow-sm h-10 px-5 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 flex-1 cursor-pointer"
            >
              {copied ? <Check size={16} className="text-emerald-200" /> : <Copy size={16} />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>

            {/* Button 2: Share via Apps */}
            {hasNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="h-10 px-5 rounded-xl border border-slate-200 dark:border-[#222834] bg-white dark:bg-[#13161c] hover:bg-slate-50 dark:hover:bg-[#1a1f28] text-slate-700 dark:text-slate-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <Share2 size={16} className="text-blue-500" />
                <span>Share via Apps</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
