import React, { useState, useEffect } from 'react';
import { X, Download, Copy, Check, FileImage, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export interface ExportItem {
  id: string;
  title: string;
  filename: string;
  format: 'png' | 'svg';
  dataUrl: string;
  blob?: Blob;
  svgString?: string;
  type?: 'circuit' | 'oscilloscope' | 'multimeter';
  width?: number;
  height?: number;
}

export interface ExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ExportItem[];
  format: 'png' | 'svg';
  onItemDownloaded?: (item: ExportItem) => void;
  onAllDownloaded?: (items: ExportItem[]) => void;
}

export function ExportPreviewModal({
  isOpen,
  onClose,
  items,
  format,
  onItemDownloaded,
  onAllDownloaded,
}: ExportPreviewModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCopiedId(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async (item: ExportItem) => {
    try {
      if (item.format === 'png') {
        let blob = item.blob;
        if (!blob) {
          const res = await fetch(item.dataUrl);
          blob = await res.blob();
        }
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopiedId(item.id);
        toast.success(`Copied ${item.filename} to clipboard`);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        // SVG raw text copy
        const text = item.svgString || (await (await fetch(item.dataUrl)).text());
        await navigator.clipboard.writeText(text);
        setCopiedId(item.id);
        toast.success('Copied Code!');
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSave = (item: ExportItem) => {
    try {
      const link = document.createElement('a');
      link.href = item.dataUrl;
      link.download = item.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Downloaded ${item.filename}`);
      onItemDownloaded?.(item);
    } catch (err) {
      toast.error(`Failed to download ${item.filename}`);
    }
  };

  const handleDownloadAll = () => {
    if (items.length === 0) return;
    items.forEach((item, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = item.dataUrl;
        link.download = item.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 250);
    });
    toast.success(`Exporting all ${items.length} files...`);
    if (onAllDownloaded) {
      onAllDownloaded(items);
    } else if (onItemDownloaded) {
      items.forEach(it => onItemDownloaded(it));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm bg-black/50 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-[#0d0f12] border border-slate-200 dark:border-[#1b2028] rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1b2028]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <FileImage size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Export Preview ({format.toUpperCase()})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Review and download your generated schematic and instrument captures
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1b2028] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto py-5 pr-1 -mr-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <ImageIcon size={36} className="mb-2 opacity-40" />
              <p className="text-sm">No exportable elements found</p>
            </div>
          ) : (
            <div className={`grid gap-5 ${items.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
              {items.map((item) => {
                const isCopied = copiedId === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col bg-slate-50/60 dark:bg-[#13161c] border border-slate-200 dark:border-[#1f2530] rounded-xl p-4 transition-all duration-150 hover:border-slate-300 dark:hover:border-[#2a3240]"
                  >
                    {/* Item Header & Filename */}
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {item.title}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200/70 dark:bg-[#1b2028] text-slate-600 dark:text-slate-300 border border-slate-300/60 dark:border-[#262c36] select-all shrink-0">
                        {item.filename}
                      </span>
                    </div>

                    {/* Preview Box */}
                    <div className="flex-1 min-h-[160px] max-h-[260px] flex items-center justify-center p-3 rounded-lg bg-slate-100 dark:bg-[#08090b] border border-slate-200/80 dark:border-[#171a21] overflow-hidden">
                      <img
                        src={item.dataUrl}
                        alt={item.title}
                        className="max-h-[230px] w-auto max-w-full object-contain rounded shadow-xs"
                      />
                    </div>

                    {/* Item Action Buttons */}
                    <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-slate-200/60 dark:border-[#1b2028]">
                      <button
                        type="button"
                        onClick={() => handleCopy(item)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border-slate-200 dark:bg-[#13161c] dark:hover:bg-[#1b2028] dark:text-slate-200 dark:border-[#262c36]"
                        title={item.format === 'svg' ? 'Copy raw SVG code to clipboard' : 'Copy image to clipboard'}
                      >
                        {isCopied ? (
                          <>
                            <Check size={13} className="text-emerald-500" />
                            <span>{item.format === 'svg' ? 'Copied Code!' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>{item.format === 'svg' ? 'Copy' : 'Copy'}</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(item)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border-slate-200 dark:bg-[#13161c] dark:hover:bg-[#1b2028] dark:text-slate-200 dark:border-[#262c36]"
                      >
                        <Download size={13} />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer / Global Actions */}
        <div className="pt-4 border-t border-slate-200 dark:border-[#1b2028] flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {items.length} {items.length === 1 ? 'file' : 'files'} ready for export
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1b2028] transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={items.length === 0}
              className="bg-gradient-to-r from-blue-600 via-purple-600 to-rose-500 text-white rounded-xl px-5 py-2 text-xs font-semibold shadow-md hover:opacity-95 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              <span>Download All</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
