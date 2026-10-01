export type FSMKind = 'Moore' | 'Mealy';
export type FSMEncoding = 'Binary' | 'Gray' | 'One-Hot';
export type FlipFlopKind = 'D' | 'T' | 'JK' | 'SR';
export type FSMValue = '0' | '1' | 'X';

export interface FSMState { id: string; name: string; output: FSMValue; x: number; y: number; }
export interface FSMTransition { id: string; from: string; to: string; input: FSMValue; output?: FSMValue; }
export interface FSMDefinition { kind: FSMKind; inputName: string; outputName: string; states: FSMState[]; transitions: FSMTransition[]; }
export interface StateAssignment { stateId: string; name: string; code: string; }
export interface StateTableRow { presentState: string; presentCode: string; input: FSMValue; nextState: string; nextCode: string; output: FSMValue; unused: boolean; }
export interface ExcitationRow extends StateTableRow { signals: Record<string, FSMValue>; }
export interface FSMEquation { signal: string; latex: string; minterms: number[]; dontCares: number[]; }


export const createDefaultFSM = (): FSMDefinition => ({
  kind: 'Moore', inputName: 'A', outputName: 'Y',
  states: [
    { id: 'S0', name: 'S0', output: '0', x: 118, y: 136 },
    { id: 'S1', name: 'S1', output: '0', x: 310, y: 90 },
    { id: 'S2', name: 'S2', output: '1', x: 310, y: 230 },
  ],
  transitions: [
    { id: 't0', from: 'S0', to: 'S0', input: '0' }, { id: 't1', from: 'S0', to: 'S1', input: '1' },
    { id: 't2', from: 'S1', to: 'S2', input: '0' }, { id: 't3', from: 'S1', to: 'S0', input: '1' },
    { id: 't4', from: 'S2', to: 'S0', input: '0' }, { id: 't5', from: 'S2', to: 'S2', input: '1' },
  ],
});

