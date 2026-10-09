import React from 'react';
import type { SchematicComponent } from '@/components/common/schematic/schematicTypes';
import { StudioSlider } from '@/components/common/templates';
import { InspectorHeader, InspectorSection, PropertyRow } from '@/simulators/shared/workspace/workspaceChrome';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { OPERATOR_IDLE_ROLLER, isMechanicalOperator } from '@shared/fluid/engine/componentSolvers';
import { useFluidT, optionLabel, parameterLabel, partDescription, partName, type FluidTranslate } from '../i18n/fluidText';
import { INITIAL_STATE_TWINS, VALVE_SPECS, clampParameter, editableParameters, type FluidCatalogEntry, type FluidLibraryItem, type FluidParameter } from '../models/fluidCatalog';
import { ReplaceComponentControl } from './ReplaceComponentControl';
import { EXTEND_TAG_PROP, OPERATOR_TAG_PROP, RETRACT_TAG_PROP, isCylinder, linkableSides, linkedSensor, sensorTagsOf, setLinkedSensor, setValveProperty, type SensorOption } from '../models/sensorCoupling';

export const inputStyle = (colors: Palette): React.CSSProperties => ({
  width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, background: colors.input, color: colors.text,
  border: `1px solid ${colors.line}`, borderRadius: 12, padding: '4px 12px', fontSize: 13, fontFamily: 'inherit', fontWeight: 500, outline: 'none',
});

const OPERATOR_SIDES = ['left', 'right'] as const;
const operatorKey = (side: (typeof OPERATOR_SIDES)[number]) => (side === 'left' ? 'actuationLeft' : 'actuationRight');

export interface ActiveElementPropertiesProps {
  component: SchematicComponent;
  definition: FluidCatalogEntry;
  colors: Palette;
  /** Every limit switch on the canvas, for the valve coupling dropdowns. */
  sensorOptions: SensorOption[];
  /** ISO tags the limit switches of a cylinder take until renamed. */
  autoSensorTags?: [string, string];
  /** Tag currently drawn beside each driven end of a valve (the edited one, else the automatic ISO tag). */
  operatorTags?: Partial<Record<'left' | 'right', string>>;
  /** Library parts the selected one can be swapped for, grouped by library category; omit to hide the Replace control. */
  replaceGroups?: Record<string, FluidLibraryItem[]>;
  onReplace?: (type: string) => void;
  /** Swaps a consolidated 2/2 or 3/2 valve for its normally-open / normally-closed twin, keeping label, operators and pipes. */
  onInitialStateChange?: (type: string) => void;
  onLabelChange: (label: string) => void;
  onPropsChange: (props: SchematicComponent['props']) => void;
}

/** One editable operating parameter: a select, a slider with a number box (bounded fields) or a plain number box. */
function ParameterField({ parameter, value, colors, tr, hydraulic = false, onChange }: { parameter: FluidParameter; value: unknown; colors: Palette; tr: FluidTranslate; /** The part works on oil: its pilot operator reads "Hydraulic Pilot". */ hydraulic?: boolean; onChange: (value: string | number) => void }) {
  const label = parameterLabel(tr, parameter.label);
  if (parameter.kind === 'select') {
    return (
      <select aria-label={label} value={String(value ?? parameter.defaultValue)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)}>
        {parameter.options?.map(option => <option key={option} value={option}>{hydraulic && option === 'Pneumatic Pilot' ? tr('options.hydraulicPilot') : optionLabel(tr, option)}</option>)}
      </select>
    );
  }
  const raw = Number(value ?? parameter.defaultValue);
  const current = clampParameter(parameter, raw);
  const number = (
    <input
      type="number"
      aria-label={parameter.slider ? `${label} (${tr('inspector.numberSuffix')})` : label}
      min={parameter.min}
      max={parameter.max}
      value={Number.isFinite(raw) ? raw : current}
      onChange={event => event.target.value !== '' && onChange(Number(event.target.value))}
      onBlur={event => { const bounded = clampParameter(parameter, Number(event.target.value)); if (bounded !== raw) onChange(bounded); }}
      style={parameter.slider ? { ...inputStyle(colors), width: 72, flexShrink: 0 } : inputStyle(colors)}
    />
  );
  if (!parameter.slider || parameter.min === undefined || parameter.max === undefined) return number;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <StudioSlider aria-label={label} min={parameter.min} max={parameter.max} step={1} value={current} onChange={next => onChange(clampParameter(parameter, next))} hideHeader className="flex-1 min-w-0" />
      {number}
    </div>
  );
}

/** Compact on/off switch for the Show Label / Show Value rows. */
function ToggleSwitch({ label, checked, colors, onChange }: { label: string; checked: boolean; colors: Palette; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={checked ? 'btn-active-brand' : ''}
      style={{ justifySelf: 'end', position: 'relative', width: 38, height: 22, borderRadius: 9999, border: checked ? 'none' : `1px solid ${colors.line}`, background: checked ? undefined : colors.panelAlt, cursor: 'pointer', padding: 0, transition: 'all 0.2s ease-in-out' }}
    >
      <span style={{ position: 'absolute', top: checked ? 3 : 2, insetInlineStart: checked ? 19 : 2, width: 16, height: 16, borderRadius: 9999, background: checked ? '#fff' : colors.subtle, transition: 'all 0.2s ease-in-out' }} />
    </button>
  );
}

/**
 * Right-hand properties of the selected part, reduced to what a student should drive: its reference tag, then only
 * the operating parameters of its kind (cylinder limit switches and cushioning, throttle opening, pressure settings,
 * valve operators). Internal geometry such as bore, stroke or volume keeps its default and is never shown.
 */
export function ActiveElementProperties({ component, definition, colors, sensorOptions, autoSensorTags, operatorTags, replaceGroups, onReplace, onInitialStateChange, onLabelChange, onPropsChange }: ActiveElementPropertiesProps) {
  const tr = useFluidT();
  const setProp = (key: string, value: unknown) => {
    // Changing a valve's operator may invalidate the limit switch coupled to that end.
    onPropsChange(VALVE_SPECS[component.type] ? setValveProperty(component.props, key, value) : { ...component.props, [key]: value });
  };
  // The service unit is always drawn complete, with its lubricator: the toggle is not offered.
  const parameters = editableParameters(definition.parameters).filter(parameter => parameter.key !== 'lubricator');
  const sides = linkableSides(component.props);
  /** Ends driven by a person or a cam (pushbutton, lever, roller, solenoid…) carry a tag the student can rename. */
  const taggedSides = OPERATOR_SIDES.filter(side => VALVE_SPECS[component.type] && isMechanicalOperator(component.props[operatorKey(side)]));
  const idleRoller = OPERATOR_SIDES.some(side => component.props[operatorKey(side)] === OPERATOR_IDLE_ROLLER);
  const cylinder = isCylinder(component);
  const twin = onInitialStateChange ? INITIAL_STATE_TWINS[definition.type] : undefined;
  const normallyOpen = definition.type.endsWith('-no');

  return (
    <div style={{ overflowY: 'auto', minHeight: 0 }} data-testid="active-element-properties">
      <InspectorHeader colors={colors} title={partName(tr, definition.type, definition.name)} subtitle={partDescription(tr, definition.type, definition.description)} />
      <InspectorSection colors={colors} label={tr('inspector.instanceLabel')}>
        <PropertyRow colors={colors} label={tr('inspector.reference')}>
          <input aria-label={tr('inspector.reference')} value={component.label} onChange={event => onLabelChange(event.target.value)} style={inputStyle(colors)} />
        </PropertyRow>
        {replaceGroups && onReplace && (
          <PropertyRow colors={colors} label={tr('inspector.component')}>
            <ReplaceComponentControl colors={colors} currentType={definition.type} groups={replaceGroups} onReplace={onReplace} />
          </PropertyRow>
        )}
        <PropertyRow colors={colors} label={tr('inspector.showLabel')}>
          <ToggleSwitch label={tr('inspector.showLabel')} checked={!component.props._hideLabel} colors={colors} onChange={show => setProp('_hideLabel', !show)} />
        </PropertyRow>
        <PropertyRow colors={colors} label={tr('inspector.showValue')}>
          <ToggleSwitch label={tr('inspector.showValue')} checked={!component.props._hideValue} colors={colors} onChange={show => setProp('_hideValue', !show)} />
        </PropertyRow>
      </InspectorSection>
      {(twin || parameters.length > 0 || sides.length > 0 || taggedSides.length > 0 || idleRoller) && (
        <InspectorSection colors={colors} label={tr('inspector.operatingParameters')}>
          {twin && (
            <PropertyRow colors={colors} label={tr('inspector.initialState')}>
              <select aria-label={tr('inspector.initialState')} value={normallyOpen ? 'NO' : 'NC'} onChange={event => (event.target.value === 'NO') !== normallyOpen && onInitialStateChange!(twin)} style={inputStyle(colors)}>
                <option value="NC">{tr('inspector.initialStateNC')}</option>
                <option value="NO">{tr('inspector.initialStateNO')}</option>
              </select>
            </PropertyRow>
          )}
          {parameters.map(parameter => (
            <PropertyRow key={parameter.key} colors={colors} label={parameterLabel(tr, parameter.label)} unit={parameter.slider ? undefined : parameter.unit}>
              <ParameterField parameter={parameter} value={component.props[parameter.key]} colors={colors} tr={tr} hydraulic={definition.media.length === 1 && definition.media[0] === 'HYDRAULIC'} onChange={value => setProp(parameter.key, value)} />
            </PropertyRow>
          ))}
          {taggedSides.map(side => {
            const key = OPERATOR_TAG_PROP[side];
            const label = tr(side === 'left' ? 'inspector.leftTag' : 'inspector.rightTag');
            return (
              <PropertyRow key={`tag-${side}`} colors={colors} label={label}>
                <input
                  aria-label={label}
                  title={tr('inspector.tagHint')}
                  value={typeof component.props[key] === 'string' ? String(component.props[key]) : operatorTags?.[side] ?? ''}
                  placeholder={operatorTags?.[side]}
                  onChange={event => setProp(key, event.target.value)}
                  style={inputStyle(colors)}
                />
              </PropertyRow>
            );
          })}
          {sides.map(side => (
            <PropertyRow key={side} colors={colors} label={sides.length > 1 ? tr('inspector.linkedSensorSide', { side: tr(`inspector.${side}`) }) : tr('inspector.linkedSensor')}>
              <select
                aria-label={`${tr('inspector.linkedSensor')} ${side}`}
                value={sensorOptions.some(option => option.value === linkedSensor(component.props, side)) ? linkedSensor(component.props, side) : ''}
                onChange={event => onPropsChange(setLinkedSensor(component.props, side, event.target.value))}
                style={inputStyle(colors)}
              >
                <option value="">{tr('inspector.none')}</option>
                {sensorOptions.map(option => <option key={option.value} value={option.value}>{`${option.tag} · ${option.cylinderLabel} ${tr(`inspector.${option.end}`)}`}</option>)}
              </select>
            </PropertyRow>
          ))}
          {idleRoller && (
            <PropertyRow colors={colors} label={tr('inspector.triggerDirection')}>
              <select
                aria-label={tr('inspector.triggerDirection')}
                value={component.props.triggerDirection === 'RETRACT_ONLY' ? 'RETRACT_ONLY' : 'EXTEND_ONLY'}
                onChange={event => setProp('triggerDirection', event.target.value)}
                style={inputStyle(colors)}
              >
                <option value="EXTEND_ONLY">{tr('inspector.extendOnly')}</option>
                <option value="RETRACT_ONLY">{tr('inspector.retractOnly')}</option>
              </select>
            </PropertyRow>
          )}
        </InspectorSection>
      )}
      {cylinder && (
        <InspectorSection colors={colors} label={tr('inspector.limitSwitches')}>
          {([[RETRACT_TAG_PROP, tr('inspector.retractSensor'), tr('inspector.hintRetract'), 0], [EXTEND_TAG_PROP, tr('inspector.extendSensor'), tr('inspector.hintExtend'), 1]] as const).map(([key, label, hint, end]) => (
            <PropertyRow key={key} colors={colors} label={label}>
              <input
                aria-label={label}
                title={hint}
                value={typeof component.props[key] === 'string' ? String(component.props[key]) : sensorTagsOf(component, autoSensorTags)[end]}
                placeholder={sensorTagsOf({ label: component.label, props: {} }, autoSensorTags)[end]}
                onChange={event => setProp(key, event.target.value)}
                style={{ ...inputStyle(colors), fontFamily: 'inherit' }}
              />
            </PropertyRow>
          ))}
        </InspectorSection>
      )}
    </div>
  );
}
