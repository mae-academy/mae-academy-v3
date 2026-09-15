import React, { useState } from 'react';
import { Share2, Copy, Check, X, ExternalLink, Link2, CircuitBoard } from 'lucide-react';
import { toast } from 'sonner';

export interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  componentCount: number;
  wireCount: number;
  onNativeShare?: () => void;
}

export function ShareProjectModal({
  isOpen,
  onClose,
  shareUrl,
  componentCount,
  wireCount,
  onNativeShare,
}: ShareProjectModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Project link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const hasNativeShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Share Project Link"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0d0f12] border border-slate-200 dark:border-[#1b2028] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#1a1f26]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/40">
              <Share2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Share Project
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Instant interactive simulation deep-link
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a1f26] transition-colors"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4">
          {/* Circuit Stats Summary */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#13171f] border border-slate-200/70 dark:border-[#1f2530] text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium">
              <CircuitBoard size={15} className="text-blue-500" />
              <span>MAE Academy Schematic</span>
            </div>
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
              <span>{componentCount} components</span>
              <span>•</span>
              <span>{wireCount} wires</span>
            </div>
          </div>

          {/* URL Box with Copy Button */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Link2 size={13} className="text-slate-400" />
              Project Share URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 text-xs font-mono px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#161a22] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#222834] select-all outline-none truncate"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors shrink-0"
              >
                {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Anyone with this link will be able to view, interact with, and simulate this exact circuit state in real-time.
            </p>
          </div>

          {/* Native Share Option */}
          {hasNativeShare && (
            <button
              onClick={() => {
                if (onNativeShare) onNativeShare();
                else if (navigator.share) {
                  navigator.share({
                    title: 'MAE Academy - Circuit Simulation',
                    text: 'Check out this circuit design!',
                    url: shareUrl,
                  }).catch(() => {});
                }
              }}
              className="mt-1 flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#222834] bg-white dark:bg-[#13161c] hover:bg-slate-50 dark:hover:bg-[#1a1f28] text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors shadow-2xs"
            >
              <ExternalLink size={14} className="text-blue-500" />
              Open Device Share Sheet (WhatsApp, AirDrop, Socials)
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 bg-slate-50/60 dark:bg-[#101318] border-t border-slate-100 dark:border-[#1a1f26]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-[#1b2028] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
