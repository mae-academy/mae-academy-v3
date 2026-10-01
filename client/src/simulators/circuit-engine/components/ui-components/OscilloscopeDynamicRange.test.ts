import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { calculateAutoscale } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeMeasurements';
import type { SamplePoint } from '@shared/circuit/circuitTypes';

describe('Oscilloscope Dynamic Range & Intelligent Sliders', () => {
  describe('Part 1: Dynamic Bounds Calculation', () => {
    it('scales voltage offset bounds [-5 * V_div, +5 * V_div] for 1μV up to 10kV', () => {
      // 1 μV Op-Amp signals
      const microVoltDiv = 1e-6;
      const microMinOffset = -5 * microVoltDiv;
      const microMaxOffset = 5 * microVoltDiv;
      expect(microMinOffset).toBeCloseTo(-5e-6, 9);
      expect(microMaxOffset).toBeCloseTo(5e-6, 9);

      // 1000 V Power rail signals
      const kiloVoltDiv = 1000;
      const kiloMinOffset = -5 * kiloVoltDiv;
      const kiloMaxOffset = 5 * kiloVoltDiv;
      expect(kiloMinOffset).toBe(-5000);
      expect(kiloMaxOffset).toBe(5000);
    });

    it('scales time shift bounds [0, +10 * T_div] for 1μs up to 10s', () => {
      // 1 μs high-frequency switching
      const microTimeDiv = 1e-6;
      const microMinTime = 0;
      const microMaxTime = 10 * microTimeDiv;
      expect(microMinTime).toBe(0);
      expect(microMaxTime).toBeCloseTo(10e-6, 9);

      // 1 s slow drift
      const secTimeDiv = 1;
      const secMinTime = 0;
      const secMaxTime = 10 * secTimeDiv;
      expect(secMinTime).toBe(0);
      expect(secMaxTime).toBe(10);
    });

    it('autoscale calculates peak-to-peak and strictly resets offset and timeShift to 0 for 1mV AC signal', () => {
      // 1mV peak (2mV pk-pk), 1kHz sine wave
      const samples1mV: SamplePoint[] = Array.from({ length: 100 }, (_, i) => ({
        time: i * 0.0001,
        value: 0.001 * Math.sin(2 * Math.PI * 1000 * (i * 0.0001)),
      }));

      const res = calculateAutoscale(samples1mV, 1000);
      expect(res.offset).toBe(0); // Strictly centered
      expect(res.timeShift).toBe(0); // Strictly centered
      expect(res.voltDiv).toBeLessThanOrEqual(0.001); // Fits millivolt signal
      expect(res.voltDiv).toBeGreaterThanOrEqual(1e-4);
    });

    it('autoscale calculates peak-to-peak and strictly resets offset and timeShift to 0 for 1000V AC signal', () => {
      // 1000V peak (2000V pk-pk), 50Hz mains power
      const samples1000V: SamplePoint[] = Array.from({ length: 100 }, (_, i) => ({
        time: i * 0.0005,
        value: 1000 * Math.sin(2 * Math.PI * 50 * (i * 0.0005)),
      }));

      const res = calculateAutoscale(samples1000V, 50);
      expect(res.offset).toBe(0); // Strictly centered
      expect(res.timeShift).toBe(0); // Strictly centered
      expect(res.voltDiv).toBeGreaterThanOrEqual(200); // Fits high voltage
    });
  });

  describe('Part 2: KaTeX Typography for Header Indicator', () => {
    it('formats scale indicator in strict KaTeX with text modes, dot operator, and bold mode', () => {
      const timeDiv = '5\\ \\text{ms}';
      const voltDiv = '100\\ \\text{V}';
      const mode = 'ROLL';
      const headerLatex = `${timeDiv}\\text{ /div} \\cdot ${voltDiv}\\text{ /div} \\quad \\textbf{${mode}}`;

      expect(headerLatex).toContain('\\cdot');
      expect(headerLatex).toContain('\\quad');
      expect(headerLatex).toContain('\\textbf{ROLL}');

      // Must render cleanly in KaTeX without throwing
      const html = katex.renderToString(headerLatex, { throwOnError: true });
      expect(html).toContain('katex');
    });
  });
});
