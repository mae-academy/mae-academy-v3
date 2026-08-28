/** Digital Logic Design gate contract: ideal Boolean terminals with selectable 2–4 inputs. */
import type { CircuitComponent } from './circuitTypes';
import type { ComponentDef } from './componentDefs';
import { LOGIC_COMPONENT_TYPES, logicPinsFor } from './desLogicCore';
import { dynamicGateGeometryFor, gateInputIdsFor, inputCountForGate, logicBlockLayoutFor } from './dynamicLogicGeometry';

export const MULTI_INPUT_GATE_TYPES = new Set(['gate-and', 'gate-or', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor']);

export const normalizedInputCount = (value: unknown) => inputCountForGate('gate-and', value);
export const inputTerminalsFor = (component: CircuitComponent) => component.type === 'gate-not' ? ['a'] : MULTI_INPUT_GATE_TYPES.has(component.type) ? gateInputIdsFor(component.type, component.props.inputCount) : component.type === 'digital-output' ? ['in'] : [];
export const getLogicComponentBounds = (component: CircuitComponent, definition: ComponentDef) => {
  if (MULTI_INPUT_GATE_TYPES.has(component.type)) return dynamicGateGeometryFor(component.type, component.props.inputCount);
  if (component.type.startsWith('logic-')) {
    const pins = logicPinsFor(component);
    const layout = logicBlockLayoutFor(component.type, pins.inputs, pins.outputs);
    return { width: layout.width, height: layout.height };
  }
  return { width: definition.width, height: definition.height };
};

export const getLogicComponentTerminals = (component: CircuitComponent, definition: ComponentDef): ComponentDef['terminals'] => {
  if (component.type === 'digital-input' || component.type === 'digital-output') return definition.terminals;
  if (LOGIC_COMPONENT_TYPES.has(component.type) && !MULTI_INPUT_GATE_TYPES.has(component.type)) {
    const pins = logicPinsFor(component);
    if (pins.inputs.length || pins.outputs.length) {
      return logicBlockLayoutFor(component.type, pins.inputs, pins.outputs).pins.map(pin => ({ id: pin.id, name: pin.id.toUpperCase(), x: pin.x, y: pin.y, type: pin.type }));
    }
  }
  if (!MULTI_INPUT_GATE_TYPES.has(component.type)) return definition.terminals;
  const geometry = dynamicGateGeometryFor(component.type, component.props.inputCount);
  const output = definition.terminals.find(terminal => terminal.id === 'y');
  return [
    ...gateInputIdsFor(component.type, component.props.inputCount).map((id, index) => ({ id, name: id.toUpperCase(), x: geometry.inputX, y: geometry.inputY[index], type: 'input' as const })),
    ...(output ? [{ ...output, x: geometry.outputX }] : []),
  ];
};
