/**
 * ElectroLab – 4-Channel Oscilloscope
 * Realistic oscilloscope UI
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { StudioSlider } from '@/components/common/templates';

interface OscilloscopeProps {
  isOpen: boolean;
  onClose: () => void;
  channels: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    ch4: number[];
  };
}

const CH_COLORS = ['#ffff00', '#00ffff', '#00ff44', '#ff8800'];
const CH_NAMES = ['CH1', 'CH2', 'CH3', 'CH4'];

const W = 480, H = 300;
const GRID_X = 10, GRID_Y = 8;
const CW = W / GRID_X, CH_H = H / GRID_Y;

export const Oscilloscope: React.FC<OscilloscopeProps> = ({ isOpen, onClose, channels }) => {
  const [enabled, setEnabled] = useState([true, true, false, false]);
  const [timeScale, setTimeScale] = useState(20); // ms/div
  const [vScale, setVScale] = useState([2, 2, 2, 2]); // V/div per channel
  const [vOffset, setVOffset] = useState([0, 0, 0, 0]); // vertical offset in divisions
  const [triggerLevel, setTriggerLevel] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const allChannels = [channels.ch1, channels.ch2, channels.ch3, channels.ch4];

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#1a3a1a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_X; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CW, 0);
      ctx.lineTo(i * CW, H);
      ctx.stroke();
    }
    for (let j = 0; j <= GRID_Y; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * CH_H);
      ctx.lineTo(W, j * CH_H);
      ctx.stroke();
    }
    // Center lines brighter
    ctx.strokeStyle = '#2a5a2a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

    // Trigger line
    const trigY = H / 2 - (triggerLevel / vScale[0]) * CH_H;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, trigY); ctx.lineTo(W, trigY); ctx.stroke();
    ctx.setLineDash([]);

    // Draw channels
    allChannels.forEach((data, ci) => {
      if (!enabled[ci] || data.length === 0) return;
      ctx.strokeStyle = CH_COLORS[ci];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const centerY = H / 2 + vOffset[ci] * CH_H;
      const scaleY = CH_H / vScale[ci];
      for (let i = 0; i < W; i++) {
        const idx = Math.floor((i / W) * data.length);
        const v = data[idx] || 0;
        const y = centerY - v * scaleY;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
    });
  }, [isOpen, channels, enabled, timeScale, vScale, vOffset, triggerLevel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 select-none top-20 right-2 sm:top-5 sm:right-5 max-h-[calc(100svh-6rem)] overflow-y-auto overscroll-contain"
      style={{ width: `min(${W + 160}px, calc(100vw - 16px))`, background: '#111', borderRadius: 12, border: '2px solid #333', boxShadow: '0 8px 40px rgba(0,0,0,0.8)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #333' }}>
        <span style={{ color: '#888', fontSize: 11, fontWeight: 'bold', letterSpacing: 2 }}>OSCILLOSCOPE</span>
        <button onClick={onClose} aria-label="Close oscilloscope" className="touch-target" style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row">
        {/* Screen */}
        <div className="min-w-0 flex-1" style={{ padding: 8 }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${W} / ${H}`, borderRadius: 4, border: '1px solid #333' }} />
          {/* Time scale */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span style={{ color: '#666', fontSize: 10 }}>TIME/DIV</span>
            <button onClick={() => setTimeScale(t => Math.max(1, t / 2))} aria-label="Decrease time per division" className="touch-target" style={{ color: '#888', background: '#222', border: '1px solid #444', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontSize: 10 }}><Minus size={10} /></button>
            <span style={{ color: '#aaa', fontSize: 10, minWidth: 40, textAlign: 'center' }}>{timeScale}ms</span>
            <button onClick={() => setTimeScale(t => Math.min(500, t * 2))} aria-label="Increase time per division" className="touch-target" style={{ color: '#888', background: '#222', border: '1px solid #444', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontSize: 10 }}><Plus size={10} /></button>
            <span style={{ color: '#666', fontSize: 9, marginLeft: 8 }}>TRIG</span>
            <StudioSlider
              min={-5}
              max={5}
              step={0.1}
              value={triggerLevel}
              onChange={val => setTriggerLevel(val)}
              aria-label="Trigger level"
              hideHeader
              className="w-[60px]"
            />
            <span style={{ color: '#ff4444', fontSize: 9 }}>{triggerLevel.toFixed(1)}V</span>
          </div>
        </div>

        {/* Channel Controls */}
        <div className="w-full shrink-0 border-t border-[#333] sm:w-[150px] sm:border-t-0 sm:border-l" style={{ padding: 8 }}>
          {CH_NAMES.map((name, ci) => (
            <div key={ci} style={{ marginBottom: 12, borderBottom: '1px solid #222', paddingBottom: 8 }}>
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => setEnabled(e => e.map((v, i) => i === ci ? !v : v))}
                  className="touch-target"
                  style={{
                    background: enabled[ci] ? CH_COLORS[ci] : '#333',
                    color: enabled[ci] ? '#000' : '#666',
                    border: 'none', borderRadius: 3, padding: '2px 6px', fontSize: 9, fontWeight: 'bold', cursor: 'pointer',
                  }}
                >
                  {name}
                </button>
                <span style={{ color: CH_COLORS[ci], fontSize: 9 }}>{vScale[ci]}V/div</span>
              </div>
              {enabled[ci] && (
                <>
                  <div className="flex items-center gap-1 mb-1">
                    <span style={{ color: '#555', fontSize: 8 }}>V/div</span>
                    <button onClick={() => setVScale(s => s.map((v, i) => i === ci ? Math.max(0.1, v / 2) : v))} aria-label={`${name} decrease volts per division`} className="touch-target" style={{ color: '#888', background: '#222', border: '1px solid #333', borderRadius: 2, padding: '0 3px', cursor: 'pointer', fontSize: 9 }}>−</button>
                    <button onClick={() => setVScale(s => s.map((v, i) => i === ci ? Math.min(50, v * 2) : v))} aria-label={`${name} increase volts per division`} className="touch-target" style={{ color: '#888', background: '#222', border: '1px solid #333', borderRadius: 2, padding: '0 3px', cursor: 'pointer', fontSize: 9 }}>+</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span style={{ color: '#555', fontSize: 8 }}>Pos</span>
                    <StudioSlider
                      min={-4}
                      max={4}
                      step={0.1}
                      value={vOffset[ci]}
                      onChange={val => setVOffset(o => o.map((v, i) => i === ci ? val : v))}
                      aria-label={`${name} position offset`}
                      hideHeader
                      className="w-[60px]"
                    />
                  </div>
                  {/* Measurements */}
                  {allChannels[ci].length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ color: CH_COLORS[ci], fontSize: 8 }}>
                        Vpp: {(Math.max(...allChannels[ci]) - Math.min(...allChannels[ci])).toFixed(2)}V
                      </div>
                      <div style={{ color: CH_COLORS[ci], fontSize: 8 }}>
                        Vrms: {Math.sqrt(allChannels[ci].reduce((s, v) => s + v * v, 0) / allChannels[ci].length).toFixed(2)}V
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
