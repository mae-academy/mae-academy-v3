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
  format?: 'png' | 'svg';
  onItemDownloaded?: (item: ExportItem) => void;
  onAllDownloaded?: (items: ExportItem[]) => void;
}

export const TARGET_4K_WIDTH = 3840;

export async function svgToPngBlob(
  svgString: string,
  explicitWidth?: number,
  explicitHeight?: number,
  requestedScale?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      let width = explicitWidth;
      let height = explicitHeight;
      let rasterSvgString = svgString;

      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          const viewBox = svgEl.getAttribute('viewBox');
          if (viewBox) {
            const parts = viewBox.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              if (!width) width = parts[2];
              if (!height) height = parts[3];
            }
          }
          if (!width) width = parseFloat(svgEl.getAttribute('width') || '800') || 800;
          if (!height) height = parseFloat(svgEl.getAttribute('height') || '600') || 600;

          const scale = requestedScale ?? Math.max(4, TARGET_4K_WIDTH / width);
          const targetWidth = Math.round(width * scale);
          const targetHeight = Math.round(height * scale);

          svgEl.setAttribute('width', String(targetWidth));
          svgEl.setAttribute('height', String(targetHeight));
          rasterSvgString = new XMLSerializer().serializeToString(svgEl);

          const img = new Image();
          const svgBlob = new Blob([rasterSvgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas 2D context not available'));
              return;
            }
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Failed to convert canvas to blob'));
            }, 'image/png');
          };
          img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
          };
          img.src = url;
          return;
        }
      }

      const finalWidth = width || 800;
      const finalHeight = height || 600;
      const scale = requestedScale ?? Math.max(4, TARGET_4K_WIDTH / finalWidth);
      const targetWidth = Math.round(finalWidth * scale);
      const targetHeight = Math.round(finalHeight * scale);

      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert canvas to blob'));
        }, 'image/png');
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

export function ExportPreviewModal({
  isOpen,
  onClose,
  items,
  format: initialFormat = 'png',
  onItemDownloaded,
  onAllDownloaded,
}: ExportPreviewModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [itemFormats, setItemFormats] = useState<Record<string, 'png' | 'svg'>>({});
  const [globalFormat, setGlobalFormat] = useState<'png' | 'svg'>(initialFormat);
  const [cachedPngUrls, setCachedPngUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setGlobalFormat(initialFormat);
  }, [initialFormat]);

  const getItemFormat = (item: ExportItem): 'png' | 'svg' => {
    return itemFormats[item.id] ?? globalFormat;
  };

  const getBaseName = (filename: string, itemFormat: string) => {
    const ext = `.${itemFormat}`;
    if (filename.endsWith('.png')) return filename.slice(0, -4);
    if (filename.endsWith('.svg')) return filename.slice(0, -4);
    return filename.endsWith(ext) ? filename.slice(0, -ext.length) : filename;
  };

  const getEffectiveFilename = (item: ExportItem, activeFormat: 'png' | 'svg') => {
    const base = getBaseName(item.filename, item.format);
    const custom = customNames[item.id];
    const rawName = (custom !== undefined && custom.trim().length > 0) ? custom.trim() : base;
    const cleanBase = rawName.endsWith('.png') ? rawName.slice(0, -4) : rawName.endsWith('.svg') ? rawName.slice(0, -4) : rawName;
    return `${cleanBase}.${activeFormat}`;
  };

  // Convert SVG to PNG on-demand if user toggles to PNG
  useEffect(() => {
    if (!isOpen) return;
    items.forEach(async (item) => {
      const activeFormat = getItemFormat(item);
      if (activeFormat === 'png' && item.format === 'svg' && item.svgString && !cachedPngUrls[item.id]) {
        try {
          const blob = await svgToPngBlob(item.svgString, item.width, item.height);
          const url = URL.createObjectURL(blob);
          setCachedPngUrls(prev => ({ ...prev, [item.id]: url }));
        } catch {
          // ignore
        }
      }
    });
  }, [isOpen, items, itemFormats, globalFormat, cachedPngUrls]);

  useEffect(() => {
    if (!isOpen) {
      setCopiedId(null);
      setCustomNames({});
      setItemFormats({});
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

  const handleToggleGlobalFormat = (newFormat: 'png' | 'svg') => {
    setGlobalFormat(newFormat);
    const updated: Record<string, 'png' | 'svg'> = {};
    items.forEach(it => {
      updated[it.id] = newFormat;
    });
    setItemFormats(updated);
  };

  const handleToggleItemFormat = (itemId: string, newFormat: 'png' | 'svg') => {
    setItemFormats(prev => ({ ...prev, [itemId]: newFormat }));
  };

  const handleCopy = async (item: ExportItem) => {
    const activeFormat = getItemFormat(item);
    const effectiveFilename = getEffectiveFilename(item, activeFormat);
    try {
      if (activeFormat === 'png') {
        let blob = item.blob;
        if (item.format === 'svg' && item.svgString) {
          blob = await svgToPngBlob(item.svgString, item.width, item.height);
        } else if (!blob && (cachedPngUrls[item.id] || item.dataUrl)) {
          const res = await fetch(cachedPngUrls[item.id] || item.dataUrl);
          blob = await res.blob();
        }
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopiedId(item.id);
          toast.success(`Copied ${effectiveFilename} image to clipboard`);
          setTimeout(() => setCopiedId(null), 2000);
          return;
        }
      }

      // Vector SVG Copying with MS Word / PowerPoint text/html compatibility wrapper
      const cleanSvgString = item.svgString || (await (await fetch(item.dataUrl)).text());
      const base64Svg = btoa(unescape(encodeURIComponent(cleanSvgString)));
      const htmlWrapper = `<img src="data:image/svg+xml;base64,${base64Svg}" />`;
      const svgBlob = new Blob([cleanSvgString], { type: 'image/svg+xml' });

      let writeSuccess = false;

      // Try rich clipboard write: text/html (Word/PowerPoint), image/svg+xml (vector apps), text/plain
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlWrapper], { type: 'text/html' }),
            'image/svg+xml': svgBlob,
            'text/plain': new Blob([cleanSvgString], { type: 'text/plain' }),
          }),
        ]);
        writeSuccess = true;
      } catch {
        // Fallback without image/svg+xml representation
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([htmlWrapper], { type: 'text/html' }),
              'text/plain': new Blob([cleanSvgString], { type: 'text/plain' }),
            }),
          ]);
          writeSuccess = true;
        } catch {
          // Fallback to plain text copy
          try {
            await navigator.clipboard.writeText(cleanSvgString);
            writeSuccess = true;
          } catch {
            // Failed
          }
        }
      }

      if (writeSuccess) {
        setCopiedId(item.id);
        toast.success(`Copied ${effectiveFilename} vector to clipboard`);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        toast.error('Failed to copy vector to clipboard');
      }
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSave = async (item: ExportItem) => {
    const activeFormat = getItemFormat(item);
    const effectiveFilename = getEffectiveFilename(item, activeFormat);
    try {
      let downloadUrl = item.dataUrl;

      if (activeFormat === 'png' && item.format === 'svg') {
        if (cachedPngUrls[item.id]) {
          downloadUrl = cachedPngUrls[item.id];
        } else if (item.svgString) {
          const blob = await svgToPngBlob(item.svgString, item.width, item.height);
          downloadUrl = URL.createObjectURL(blob);
        }
      } else if (activeFormat === 'svg' && item.format === 'png' && item.svgString) {
        const svgBlob = new Blob([item.svgString], { type: 'image/svg+xml;charset=utf-8' });
        downloadUrl = URL.createObjectURL(svgBlob);
      }

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = effectiveFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Downloaded ${effectiveFilename}`);
      onItemDownloaded?.({ ...item, filename: effectiveFilename, format: activeFormat });
    } catch (err) {
      toast.error(`Failed to download ${effectiveFilename}`);
    }
  };

  const handleDownloadAll = () => {
    if (items.length === 0) return;
    items.forEach((item, index) => {
      const activeFormat = getItemFormat(item);
      const effectiveFilename = getEffectiveFilename(item, activeFormat);
      setTimeout(() => {
        handleSave(item);
      }, index * 250);
    });
    toast.success(`Exporting all ${items.length} files...`);
    const updatedItems = items.map(it => {
      const activeFormat = getItemFormat(it);
      return { ...it, filename: getEffectiveFilename(it, activeFormat), format: activeFormat };
    });
    if (onAllDownloaded) {
      onAllDownloaded(updatedItems);
    } else if (onItemDownloaded) {
      updatedItems.forEach(it => onItemDownloaded(it));
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
                Export Preview ({globalFormat.toUpperCase()})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Review, choose format, rename, and download your high-fidelity captures
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Format Selector */}
            <div className="flex items-center bg-slate-100 dark:bg-[#161a22] p-1 rounded-xl border border-slate-200 dark:border-[#222834]">
              <button
                type="button"
                onClick={() => handleToggleGlobalFormat('png')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  globalFormat === 'png'
                    ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => handleToggleGlobalFormat('svg')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  globalFormat === 'svg'
                    ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                SVG
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1b2028] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
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
                const activeFormat = getItemFormat(item);
                const baseName = getBaseName(item.filename, item.format);
                const currentName = customNames[item.id] ?? baseName;
                const previewSrc = (activeFormat === 'png' && cachedPngUrls[item.id]) ? cachedPngUrls[item.id] : item.dataUrl;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col bg-slate-50/60 dark:bg-[#13161c] border border-slate-200 dark:border-[#1f2530] rounded-xl p-4 transition-all duration-150 hover:border-slate-300 dark:hover:border-[#2a3240]"
                  >
                    {/* Item Header & Editable Filename */}
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {item.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Per-Item Format Selector */}
                        <div className="flex items-center bg-slate-200/80 dark:bg-[#1b2028] p-0.5 rounded-md border border-slate-300/50 dark:border-[#262c36]">
                          <button
                            type="button"
                            onClick={() => handleToggleItemFormat(item.id, 'png')}
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded transition-colors ${
                              activeFormat === 'png'
                                ? 'bg-white dark:bg-blue-600 text-slate-800 dark:text-white shadow-2xs'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            PNG
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleItemFormat(item.id, 'svg')}
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded transition-colors ${
                              activeFormat === 'svg'
                                ? 'bg-white dark:bg-blue-600 text-slate-800 dark:text-white shadow-2xs'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            SVG
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={currentName}
                            onChange={(e) => setCustomNames(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200/70 dark:bg-[#1b2028] text-slate-700 dark:text-slate-200 border border-slate-300/60 dark:border-[#262c36] focus:border-blue-500 focus:bg-white dark:focus:bg-[#0d0f12] outline-none transition-colors w-24 sm:w-32"
                            placeholder={baseName}
                            title="Click to rename file"
                          />
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 select-none">
                            .{activeFormat}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Preview Box */}
                    <div className="flex-1 min-h-[160px] max-h-[260px] flex items-center justify-center p-3 rounded-lg bg-slate-100 dark:bg-[#08090b] border border-slate-200/80 dark:border-[#171a21] overflow-hidden">
                      <img
                        src={previewSrc}
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
                        title={activeFormat === 'svg' ? 'Copy SVG with HTML vector wrapper for Word/PowerPoint' : 'Copy PNG image to clipboard'}
                      >
                        {isCopied ? (
                          <>
                            <Check size={13} className="text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copy</span>
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
            {items.length} {items.length === 1 ? 'file' : 'files'} ready for export ({globalFormat.toUpperCase()})
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
