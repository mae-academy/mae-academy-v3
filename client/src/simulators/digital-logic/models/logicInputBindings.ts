import type { CircuitComponent } from '@shared/logic/circuitTypes';
import { nextComponentLabel } from '@shared/logic/circuitTypes';

const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
export const isLogicInput = (component: CircuitComponent) => component.type === 'digital-input';
export const logicIoLabel = (type: string, components: CircuitComponent[]) => {
  return nextComponentLabel(type, components);
};
export const defaultInputShortcut = (component: CircuitComponent, components: CircuitComponent[]) => {
  const trimmed = component.label.trim();
  if (/^[A-Za-z]$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const index = components.filter(isLogicInput).findIndex(item => item.id === component.id) + 1;
  return index > 0 && index <= 9 ? String(index) : '';
};
export const inputShortcut = (component: CircuitComponent, components: CircuitComponent[]) => normalized(component.props.shortcut) || defaultInputShortcut(component, components);
export const findInputByShortcut = (components: CircuitComponent[], key: string) => {
  const normKey = normalized(key);
  return components.find(component => {
    if (!isLogicInput(component)) return false;
    const label = normalized(component.label);
    if (label === normKey) return true;
    return inputShortcut(component, components) === normKey;
  });
};
export const normalizeDefaultLogicLabel = (component: CircuitComponent) => {
  const match = component.label.match(/^(?:Input|I)\s*(\d+)$/i) ?? component.label.match(/^(?:Output|O)\s*(\d+)$/i);
  if (!match) return component.label;
  return component.type === 'digital-input' ? `I${match[1]}` : component.type === 'digital-output' ? `O${match[1]}` : component.label;
};
