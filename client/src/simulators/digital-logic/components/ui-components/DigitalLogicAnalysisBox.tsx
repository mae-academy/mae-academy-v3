import React, { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownToLine, Cpu } from 'lucide-react';
import { FormulaBox, GradientButton, SegmentedControl, StatusBadge, StudioButton, StudioCard, type SegmentedOption } from '@/components/common/templates';
import { KatexMath } from '@/components/ui/KatexMath';
import { LogicAnalyzer } from '@/simulators/digital-logic/components/pages/LogicAnalyzer';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';
import { StateMachineExplorer } from '@/simulators/digital-logic/components/pages/StateMachineExplorer';
import { MAX_LOGIC_ANALYZER_VARIABLES, parseBooleanExpression } from '@/simulators/digital-logic/engine/logicEngine';
import { astToOverlineLatex, sanitizeBooleanInput } from '@/simulators/digital-logic/engine/logicEngine/ast';
import {
  extractCircuitExpression,
  generateCircuitFromExpression,
  listCircuitOutputs,
  type CircuitPlacementMode,
  type StateEquation,
} from '@/simulators/digital-logic/engine/circuitExpressionExtractor';
import { CircuitPlacementMenu } from '@/simulators/digital-logic/components/ui-components/CircuitPlacementMenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type {
  CircuitComponent,
  CircuitWire,
  SimulationSnapshot,
} from '@/simulators/digital-logic/models/circuitTypes';

export type DigitalLogicAnalysisMethod = 'truth-table' | 'kmap' | 'synthesis' | 'timing' | 'fsm';

const ANALYSIS_TABS: SegmentedOption<DigitalLogicAnalysisMethod>[] = [
  { value: 'truth-table', label: 'Boolean & Truth Table' },
  { value: 'kmap', label: 'K-Map Minimizer' },
  { value: 'synthesis', label: 'Universal Synthesis' },
  { value: 'timing', label: 'Timing Waveforms' },
  { value: 'fsm', label: 'State Machine Explorer' },
];

export interface DigitalLogicAnalysisBoxProps {
  colors: {
    panel: string;
    panelAlt: string;
    line: string;
    text: string;
    muted: string;
    primary: string;
    danger: string;
  };
  standalone?: boolean;
  initialExpression?: string;
  components?: CircuitComponent[];
  wires?: CircuitWire[];
  snapshot?: SimulationSnapshot;
  onGenerateCircuit?: (components: CircuitComponent[], wires: CircuitWire[], mode: CircuitPlacementMode) => void;
}

export function DigitalLogicAnalysisBox({
  colors,
  standalone = false,
  initialExpression = "(A + B)' . C",
  components = [],
  wires = [],
  onGenerateCircuit,
}: DigitalLogicAnalysisBoxProps) {
  const [method, setMethod] = useState<DigitalLogicAnalysisMethod>('truth-table');
  const [sharedExpression, setSharedExpression] = useState<string>(initialExpression);
  // Next-state equations from the last extraction; cleared as soon as the expression is edited.
  const [stateEquations, setStateEquations] = useState<StateEquation[]>([]);
  const outputs = useMemo(() => listCircuitOutputs(components), [components]);

  // Determine if active tab is expression-driven (tabs 1, 2, 3, 4)
  const isExpressionTab = method !== 'fsm';

  // One compiler pass drives the rendered formula, the variable guard, and the error state;
  // the last valid rendering stays on screen while an edit is mid-way.
  const lastValidLatexRef = useRef('\\overline{A + B} \\cdot C');
  const { parsedExpressionLatex, expressionError, variableCount } = useMemo(() => {
    const trimmed = sharedExpression.trim();
    if (!trimmed) return { parsedExpressionLatex: '0', expressionError: null, variableCount: 0 };
    try {
      const parsed = parseBooleanExpression(trimmed);
      return { parsedExpressionLatex: astToOverlineLatex(parsed.ast), expressionError: null, variableCount: parsed.variables.length };
    } catch (err) {
      return { parsedExpressionLatex: null, expressionError: err instanceof Error ? err.message : 'Invalid syntax', variableCount: 0 };
    }
  }, [sharedExpression]);
  if (parsedExpressionLatex !== null) lastValidLatexRef.current = parsedExpressionLatex;
  const isExceedingVariableLimit = variableCount > MAX_LOGIC_ANALYZER_VARIABLES;

  const extractFromOutput = useCallback((outputId?: string) => {
    if (outputs.length === 0) {
      toast.info('No digital output (e.g. F₁, F₂) found on canvas');
      return;
    }
    try {
      const result = extractCircuitExpression(components, wires, outputId ?? outputs[0].id);
      setSharedExpression(result.expression);
      setStateEquations(result.stateEquations);
      const renamed = Object.entries(result.renamedInputs).map(([from, to]) => `${from} → ${to}`).join(', ');
      toast.success(`Extracted ${result.outputLabel.replace('_', '')} = ${result.expression}`, {
        description: [
          result.stateEquations.length ? `Sequential feedback: ${result.stateEquations.map(eq => `${eq.state}⁺ = ${eq.expression}`).join(' · ')}` : '',
          renamed ? `Inputs renamed: ${renamed}` : '',
        ].filter(Boolean).join('\n') || undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to extract an expression from the canvas.');
    }
  }, [components, outputs, wires]);

  const handleGenerateCircuit = useCallback((mode: CircuitPlacementMode) => {
    const trimmed = sharedExpression.trim();
    if (!trimmed) {
      toast.error('Please enter a Boolean expression first.');
      return;
    }
    try {
      const circuit = generateCircuitFromExpression(trimmed);
      if (!onGenerateCircuit) {
        toast.info('Open the schematic workspace to place the generated circuit.');
        return;
      }
      onGenerateCircuit(circuit.components, circuit.wires, mode);
      toast.success(`${mode === 'replace' ? 'Generated' : 'Appended'} schematic for F = ${trimmed}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate circuit from expression');
    }
  }, [sharedExpression, onGenerateCircuit]);

  const handleExpressionChange = useCallback((val: string) => {
    const sanitized = sanitizeBooleanInput(val);
    setSharedExpression(sanitized);
    setStateEquations([]);
  }, []);

  return (
    <div
      className="w-full flex flex-col p-4 sm:p-5"
      style={{
        borderTop: standalone ? 'none' : `1px solid ${colors.line}`,
      }}
    >
      {/* 1. Centered Segmented Control Header */}
      <div className="flex w-full justify-center mb-5">
        <SegmentedControl<DigitalLogicAnalysisMethod>
          options={ANALYSIS_TABS}
          value={method}
          onChange={setMethod}
          size="md"
          aria-label="Logic Analysis Workspace Tabs"
        />
      </div>

      {/* 2. Universal Boolean Expression — Signals & Systems input standard (ASCII in, KaTeX out). */}
      {isExpressionTab && (
        <StudioCard
          className="mb-5"
          title="Universal Boolean Expression"
          actionSlot={
            <div className="flex items-center gap-2">
              {outputs.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <StudioButton
                      title="Choose which output to recover a Boolean expression from"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Extract from Canvas</span>
                    </StudioButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Extract output</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {outputs.map(output => (
                      <DropdownMenuItem key={output.id} onSelect={() => extractFromOutput(output.id)} className="text-sm">
                        <KatexMath math={output.label.replace(/^F_?(\d+)$/i, 'F_{$1}')} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <StudioButton
                  onClick={() => extractFromOutput()}
                  title="Recover the Boolean expression driving the output on the canvas"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Extract from Canvas</span>
                </StudioButton>
              )}
              <CircuitPlacementMenu onSelect={handleGenerateCircuit}>
                <GradientButton
                  size="sm"
                  title="Synthesize schematic gates from the expression"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Generate Circuit</span>
                </GradientButton>
              </CircuitPlacementMenu>
            </div>
          }
        >
          {/* Single authoritative wide formula container */}
          <div className="w-full flex flex-col gap-2.5">
            <div
              className={`relative flex items-center w-full rounded-2xl border bg-white dark:bg-slate-950 px-4 py-2.5 shadow-xs transition-all ${
                expressionError
                  ? 'border-rose-400 focus-within:ring-2 focus-within:ring-rose-500/20 dark:border-rose-600'
                  : 'border-slate-200 dark:border-slate-800 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20'
              }`}
            >
              <div className="select-none pr-3 text-slate-900 dark:text-white text-2xl sm:text-3xl font-normal">
                <KatexMath math="F =" />
              </div>
              <input
                id="executive-boolean-expression-input"
                data-unstyled
                type="text"
                value={sharedExpression}
                onChange={(e) => handleExpressionChange(e.target.value)}
                placeholder="A + B . C"
                spellCheck={false}
                autoComplete="off"
                aria-label="Universal Boolean Expression Input"
                aria-invalid={Boolean(expressionError)}
                aria-describedby="executive-boolean-expression-help"
                style={{
                  fontFamily: "'KaTeX_Math', 'KaTeX_Main', 'Cambria Math', 'Times New Roman', serif",
                  fontStyle: 'italic',
                  fontWeight: 400,
                }}
                className="w-full min-w-0 bg-transparent px-2 py-1 text-2xl sm:text-3xl font-normal text-slate-900 tracking-wide outline-none dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between px-1 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <p id="executive-boolean-expression-help" className="text-[11px] text-slate-400 dark:text-slate-500">
                  <code>&apos;</code> or <code>!</code> complement · <code>.</code> or adjacency product · <code>+</code> sum · <code>^</code> XOR
                </p>
                {expressionError && (
                  <span role="alert" className="text-xs font-semibold text-rose-500">
                    {expressionError}
                  </span>
                )}
              </div>
              {stateEquations.length > 0 && (
                <div aria-label="Next-state equations" className="flex flex-wrap items-center gap-3 text-slate-700 dark:text-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Next state</span>
                  {stateEquations.map(equation => (
                    <KatexMath
                      key={equation.state}
                      math={`${equation.state}^{+} = ${astToOverlineLatex(parseBooleanExpression(equation.expression).ast)}`}
                    />
                  ))}
                </div>
              )}
              {isExceedingVariableLimit && (
                <StatusBadge variant="warning">
                  Maximum 8 input variables (A–H) supported
                </StatusBadge>
              )}
            </div>
          </div>
        </StudioCard>
      )}

      {/* 3. Active Tab Content Rendering */}
      <div className="w-full">
        {method === 'truth-table' && (
          <div className="overflow-hidden rounded-xl">
            <LogicAnalyzer
              expression={sharedExpression}
              onExpressionChange={setSharedExpression}
            />
          </div>
        )}
        {method === 'kmap' && (
          <div className="overflow-hidden rounded-xl">
            <KMapMinimizer
              expression={sharedExpression}
              onExpressionChange={setSharedExpression}
            />
          </div>
        )}
        {method === 'synthesis' && (
          <div className="overflow-hidden rounded-xl">
            <UniversalSynthesis
              expression={sharedExpression}
              onExpressionChange={setSharedExpression}
              onLoadCircuit={onGenerateCircuit}
            />
          </div>
        )}
        {method === 'timing' && (
          <div className="overflow-hidden rounded-xl">
            <TimingWaveforms
              expression={sharedExpression}
              onExpressionChange={setSharedExpression}
            />
          </div>
        )}
        {method === 'fsm' && (
          <div className="overflow-hidden rounded-xl">
            <StateMachineExplorer />
          </div>
        )}
      </div>
    </div>
  );
}
