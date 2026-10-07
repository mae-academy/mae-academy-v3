import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import english from '@/locales/en/simulators.json';

/** Translates a key of the `fluid` block of the `simulators` namespace (`parts.shuttle-valve.name`, `board.title`, ...). */
export type FluidTranslate = (key: string, params?: Record<string, string | number>) => string;

const interpolate = (text: string, params?: Record<string, string | number>) =>
  params ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;

/**
 * English resolver straight from the shipped dictionary. Pure code (the cutaway physics) defaults to it, so it never needs
 * an i18n instance and the engineering text keeps a single source of truth in the locale files.
 */
export const englishFluidT: FluidTranslate = (key, params) => {
  let node: unknown = (english as { fluid: unknown }).fluid;
  for (const part of key.split('.')) node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  return typeof node === 'string' ? interpolate(node, params) : key;
};

/** Translator bound to the active language; falls back to English where no i18n instance is mounted (unit tests). */
export function useFluidT(): FluidTranslate {
  const { t, i18n } = useTranslation('simulators');
  return useCallback<FluidTranslate>(
    (key, params) => (i18n?.isInitialized && i18n.exists(`simulators:fluid.${key}`) ? t(`fluid.${key}`, params) : englishFluidT(key, params)),
    [t, i18n],
  );
}

/** "Fixed - rear" -> "fixedRear", "Logic & Flow Control" -> "logicFlowControl": the dictionary key of an English catalog label. */
export const dictionaryKey = (label: string): string =>
  label.split(/[^A-Za-z0-9]+/).filter(Boolean).map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase())).join('');

/** Joins ids as "4 and 2" in the active language. */
export const joinList = (t: FluidTranslate, items: string[]): string => items.join(` ${t('and')} `);

/** Display text of a stored option value (the stored value itself stays the English engine token). */
export const optionLabel = (t: FluidTranslate, value: string): string => {
  const key = `options.${dictionaryKey(value)}`;
  const text = t(key);
  return text === key ? value : text;
};

/** Display name of a catalog label that has a dictionary entry under `section`, or the label itself. */
const lookup = (t: FluidTranslate, section: 'params' | 'groups', label: string): string => {
  const key = `${section}.${dictionaryKey(label)}`;
  const text = t(key);
  return text === key ? label : text;
};
export const parameterLabel = (t: FluidTranslate, label: string): string => lookup(t, 'params', label);
export const groupLabel = (t: FluidTranslate, title: string): string => lookup(t, 'groups', title);

export const partName = (t: FluidTranslate, type: string, fallback: string): string => {
  const key = `parts.${type}.name`;
  const text = t(key);
  return text === key ? fallback : text;
};
export const partDescription = (t: FluidTranslate, type: string, fallback: string): string => {
  const key = `parts.${type}.description`;
  const text = t(key);
  return text === key ? fallback : text;
};
