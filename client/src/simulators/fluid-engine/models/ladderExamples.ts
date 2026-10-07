import { makeElement, newPath, type LadderCircuit } from './relayLadder';

export interface StartStopOptions {
  /** Limit switch that ends the cycle (normally the cylinder's extended position, 1B2). */
  stop?: string;
  solenoid?: string;
}

/**
 * Self-holding start circuit, the textbook first electro-pneumatic exercise:
 * path 1: S5 (START) or the holding contact K1, in series with the break contact of 1B2, energises relay K1;
 * path 2: the make contact K1 energises the solenoid 1Y1, so the cylinder extends until 1B2 releases K1 again.
 */
export function startStopExample({ stop = '1B2', solenoid = '1Y1' }: StartStopOptions = {}): LadderCircuit {
  return {
    paths: [
      {
        ...newPath(),
        conditions: [
          [makeElement('pushbutton', 'S5', { caption: 'START', form: 'NO' }), makeElement('relayContact', 'K1', { form: 'NO' })],
          [makeElement('sensor', stop, { form: 'NC' })],
        ],
        load: makeElement('relayCoil', 'K1'),
      },
      { ...newPath(), conditions: [[makeElement('relayContact', 'K1', { form: 'NO' })]], load: makeElement('solenoid', solenoid) },
    ],
  };
}
