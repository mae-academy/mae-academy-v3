import { createEmptyNetwork, placeNode } from './src/features/plc-simulator/ui/canvas/network-edit';
import { planPlacement } from './src/features/plc-simulator/ui/canvas/placement-rules';
import { validateNetworkLayout } from './src/features/plc-simulator/domain/ast';

function mockContext() { return {} as any; }
function limits() { return { maxNetworks: 10, maxNodesPerNetwork: 64, maxGridRows: 8, maxGridCols: 8, maxTimers: 64, maxCounters: 64 }; }

let n0 = createEmptyNetwork('n', 8);
let r0 = placeNode(n0, { id: 'c1', type: 'contact', fn: 'NO', layout: { row: 0, col: 0, rowSpan: 1, colSpan: 1, branchId: null }, inputs: { EN: {} } as any, operand: { kind: 'bit', address: 'I0.0' } } as any, limits());
let n1 = (r0 as any).network;

let r1 = planPlacement(n1, { itemId: 'contact-no', nodeId: 'c2', row: 1, col: 0 }, mockContext(), limits(), 'br');
let n2 = (r1 as any).network;

console.log('N2 Branches:', n2.branches);
console.log('N2 Nodes:', n2.nodes.map((n: any) => ({ id: n.id, layout: n.layout })));

let r2 = planPlacement(n2, { itemId: 'contact-nc', nodeId: 'c3', row: 1, col: 0 }, mockContext(), limits(), 'br2');
let n3 = (r2 as any).network;

console.log('N3 Branches:', n3.branches);
console.log('N3 Nodes:', n3.nodes.map((n: any) => ({ id: n.id, layout: n.layout })));

console.log('Validation:', validateNetworkLayout(n3));
