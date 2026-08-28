/**
 * ElectroLab – Digital Multimeter
 * Realistic DMM UI component
 */
import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface DMMProps {
  isOpen: boolean;
  onClose: () => void;
  measurements: {
    dcVoltage: number;
    acVoltage: number;
    dcCurrent: number;
    acCurrent: number;
    resistance: number;
    frequency: number;
    continuity: boolean;
  };
}

type Mode = 'DCV' | 'ACV' | 'DCA' | 'ACA' | 'OHM' | 'HZ' | 'CONT';
type Range = 'auto' | '200m' | '2' | '20' | '200' | '2000';

const MODES: { id: Mode; label: string; color: string }[] = [
  { id: 'DCV', label: 'DC V', color: '#ff4444' },
  { id: 'ACV', label: 'AC V', color: '#ff8800' },
  { id: 'DCA', label: 'DC A', color: '#4488ff' },
  { id: 'ACA', label: 'AC A', color: '#44aaff' },
  { id: 'OHM', label: 'Ω', color: '#44cc44' },
  { id: 'HZ', label: 'Hz', color: '#cc44cc' },
  { id: 'CONT', label: '))))', color: '#ffcc00' },
];

export const DMM: React.FC<DMMProps> = ({ isOpen, onClose, measurements }) => {
  const [mode, setMode] = useState<Mode>('DCV');
  const [range, setRange] = useState<Range>('auto');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getValue = (): { value: number; unit: string } => {
    switch (mode) {
      case 'DCV': return { value: measurements.dcVoltage, unit: 'V' };
      case 'ACV': return { value: measurements.acVoltage, unit: 'V' };
      case 'DCA': return { value: measurements.dcCurrent, unit: 'A' };
      case 'ACA': return { value: measurements.acCurrent, unit: 'A' };
      case 'OHM': return { value: measurements.resistance, unit: 'Ω' };
      case 'HZ': return { value: measurements.frequency, unit: 'Hz' };
      case 'CONT': return { value: measurements.resistance, unit: 'Ω' };
      default: return { value: 0, unit: '' };
    }
  };

  const formatDisplay = (v: number, unit: string): string => {
    if (!isFinite(v)) return 'OL';
    const abs = Math.abs(v);
    if (unit === 'V' || unit === 'A') {
      if (abs < 0.001) return `${(v * 1e6).toFixed(2)} μ${unit}`;
      if (abs < 1) return `${(v * 1000).toFixed(2)} m${unit}`;
      if (abs < 1000) return `${v.toFixed(3)} ${unit}`;
      return `${(v / 1000).toFixed(3)} k${unit}`;
    }
    if (unit === 'Ω') {
      if (abs < 1000) return `${v.toFixed(1)} Ω`;
      if (abs < 1e6) return `${(v / 1000).toFixed(2)} kΩ`;
      return `${(v / 1e6).toFixed(2)} MΩ`;
    }
    if (unit === 'Hz') {
      if (abs < 1000) return `${v.toFixed(2)} Hz`;
      if (abs < 1e6) return `${(v / 1000).toFixed(2)} kHz`;
      return `${(v / 1e6).toFixed(2)} MHz`;
    }
    return `${v.toFixed(3)} ${unit}`;
  };

  // Continuity beep
  useEffect(() => {
    if (mode === 'CONT' && measurements.continuity) {
      const beep = () => {
        try {
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
          const ctx = audioCtxRef.current;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } catch {}
      };
      beep();
      beepIntervalRef.current = setInterval(beep, 400);
    } else {
      if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
    }
    return () => { if (beepIntervalRef.current) clearInterval(beepIntervalRef.current); };
  }, [mode, measurements.continuity]);

  if (!isOpen) return null;

  const { value, unit } = getValue();
  const displayStr = formatDisplay(value, unit);
  const isCont = mode === 'CONT';
  const contActive = isCont && measurements.continuity;

  return (
    <div
      className="fixed z-50 select-none"
      style={{ bottom: 20, right: 20, width: 220 }}
    >
      {/* DMM Body */}
      <div
        style={{
          background: 'linear-gradient(160deg, #2a2a2a 0%, #1a1a1a 100%)',
          borderRadius: 12,
          border: '2px solid #444',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          padding: 12,
          fontFamily: 'monospace',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: '#aaa', fontSize: 10, fontWeight: 'bold', letterSpacing: 2 }}>DIGITAL MULTIMETER</span>
          <button onClick={onClose} style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        {/* LCD Display */}
        <div
          style={{
            background: '#1a2e1a',
            border: '2px solid #333',
            borderRadius: 6,
            padding: '10px 12px',
            marginBottom: 10,
            minHeight: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div style={{ color: '#00ff44', fontSize: 28, fontWeight: 'bold', letterSpacing: 2, textShadow: '0 0 8px #00ff44' }}>
            {isCont ? (contActive ? '●●●' : '---') : displayStr.split(' ')[0]}
          </div>
          <div style={{ color: '#00cc33', fontSize: 11, marginTop: 2 }}>
            {isCont ? (contActive ? 'CONTINUITY' : 'OPEN') : displayStr.split(' ').slice(1).join(' ')}
          </div>
          <div style={{ color: '#006622', fontSize: 9, marginTop: 2 }}>
            {MODES.find(m => m.id === mode)?.label} {range !== 'auto' ? range : 'AUTO'}
          </div>
        </div>

        {/* Mode Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                background: mode === m.id ? m.color : '#333',
                color: mode === m.id ? '#000' : '#aaa',
                border: 'none',
                borderRadius: 4,
                padding: '4px 2px',
                fontSize: 9,
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Range */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {(['auto', '200m', '2', '20', '200', '2000'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                background: range === r ? '#555' : '#2a2a2a',
                color: range === r ? '#fff' : '#666',
                border: `1px solid ${range === r ? '#777' : '#333'}`,
                borderRadius: 3,
                padding: '2px 4px',
                fontSize: 8,
                cursor: 'pointer',
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Probe terminals */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#cc0000', margin: '0 auto 2px' }} />
            <span style={{ color: '#cc0000', fontSize: 8 }}>V/Ω/Hz</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#000', border: '2px solid #666', margin: '0 auto 2px' }} />
            <span style={{ color: '#666', fontSize: 8 }}>COM</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff8800', margin: '0 auto 2px' }} />
            <span style={{ color: '#ff8800', fontSize: 8 }}>10A</span>
          </div>
        </div>
      </div>
    </div>
  );
};
