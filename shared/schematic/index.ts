// Deterministic schematic engine: parse -> validate (10 gates) -> netlist -> render. Pure TypeScript, Node + browser.
export * from './types';
export * from './symbols';
export { parseValue, formatValue, type ParsedValue, type Dim } from './values';
export { parseSchematicSpec, normalizeSchematicSpec, extractJsonText, type ParseResult, type NormalizeResult } from './parse';
export { analyze, deriveNetlist, netlistToMarkdown, type Netlist, type NetInfo, type NetlistPart, type Analysis } from './netlist';
export { validateSchematic, validateSpec, SCHEMATIC_GATES_SUMMARY, type ValidationResult, type ValidationStats } from './validate';
export { renderSchematicSvg, renderSpec, escapeXml, type RenderOptions, type RenderResult } from './render';
export { layoutSchematic, type Layout } from './layout';
export { SCHEMATIC_SPEC_DOC, SCHEMATIC_FENCE, SCHEMATIC_EXAMPLE } from './specDoc';
export * from './archetypes/types';
export { ARCHETYPES, DUPLICATE_ARCHETYPE_IDS, buildArchetype, findArchetype, isArchetypeRequest, expandArchetypeRequest, type BuildResult } from './archetypes/registry';
export { resolveParams } from './archetypes/params';
export { ARCHETYPE_DOC, buildArchetypeDoc, archetypeLine } from './archetypes/archetypeDoc';
export { parseMath, autoMathSource, mathMetrics, mathTspans, texText } from './mathText';
