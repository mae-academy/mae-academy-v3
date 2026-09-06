/** Keyboard and default-label rules for the isolated Digital Logic Design workspace. */
import type { CircuitComponent } from '@/simulators/digital-logic/models/circuitTypes';

const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
export const isLogicInput = (component: CircuitComponent) => component.type === 'digital-input';
export const logicIoLabel = (type: string, components: CircuitComponent[]) => {
  const prefix = type === 'digital-input' ? 'I' : 'O';
  return `${prefix}${components.filter(component => component.type === type).length + 1}`;
};
export const defaultInputShortcut = (component: CircuitComponent, components: CircuitComponent[]) => {
  const index = components.filter(isLogicInput).findIndex(item => item.id === component.id) + 1;
  return index > 0 && index <= 9 ? String(index) : '';
};
export const inputShortcut = (component: CircuitComponent, components: CircuitComponent[]) => normalized(component.props.shortcut) || defaultInputShortcut(component, components);
export const findInputByShortcut = (components: CircuitComponent[], key: string) => components.find(component => isLogicInput(component) && inputShortcut(component, components) === normalized(key));
export const normalizeDefaultLogicLabel = (component: CircuitComponent) => {
  const match = component.label.match(/^(?:Input|I)\s*(\d+)$/i) ?? component.label.match(/^(?:Output|O)\s*(\d+)$/i);
  if (!match) return component.label;
  return component.type === 'digital-input' ? `I${match[1]}` : component.type === 'digital-output' ? `O${match[1]}` : component.label;
};
