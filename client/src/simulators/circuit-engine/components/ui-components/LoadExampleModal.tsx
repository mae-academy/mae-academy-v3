import React, { useMemo, useState } from 'react';
import { BookOpen, Clock, Gauge, Lightbulb, ListChecks, Sigma, Sparkles, X } from 'lucide-react';
import type { ExampleCategory, ExampleDefinition } from '@/simulators/circuit-engine/examples';
import { EXAMPLE_CATEGORIES, EXAMPLE_LIBRARY, getExamplesByCategory } from '@/simulators/circuit-engine/examples';

export interface LoadExampleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (example: ExampleDefinition) => void;
}

const DIFFICULTY_STYLES: Record<ExampleDefinition['difficulty'], string> = {
  Beginner: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
  Intermediate: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50',
  Advanced: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50',
};

function DifficultyBadge({ difficulty }: { difficulty: ExampleDefinition['difficulty'] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${DIFFICULTY_STYLES[difficulty]}`}>
      {difficulty}
    </span>
  );
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(3);
  return Number(value.toPrecision(6)).toString();
}

export function LoadExampleModal({ isOpen, onClose, onLoad }: LoadExampleModalProps) {
  const [activeCategory, setActiveCategory] = useState<ExampleCategory>(EXAMPLE_CATEGORIES[0]);
  const [selectedId, setSelectedId] = useState<string>(EXAMPLE_LIBRARY[0]?.id ?? '');
  const [showNetlist, setShowNetlist] = useState(false);

  const categoryExamples = useMemo(() => getExamplesByCategory(activeCategory), [activeCategory]);
  const selected = useMemo(
    () => EXAMPLE_LIBRARY.find((example) => example.id === selectedId) ?? categoryExamples[0] ?? EXAMPLE_LIBRARY[0],
    [selectedId, categoryExamples]
  );

  if (!isOpen) return null;

  const selectExample = (example: ExampleDefinition) => {
    setSelectedId(example.id);
    setShowNetlist(false);
  };

  const selectCategory = (category: ExampleCategory) => {
    setActiveCategory(category);
    const first = getExamplesByCategory(category)[0];
    if (first) selectExample(first);
  };

  const handleLoad = () => {
    if (!selected) return;
    onLoad(selected);
    onClose();
  };

  const hasExpectedResults = Boolean(
    selected && (
      Object.keys(selected.expectedResults.nodeVoltages ?? {}).length
      || Object.keys(selected.expectedResults.currents ?? {}).length
      || Object.keys(selected.expectedResults.power ?? {}).length
      || (selected.expectedResults.notes ?? []).length
    )
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm bg-black/60 overflow-hidden overscroll-none select-none animate-in fade-in duration-200"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Interactive Examples Library"
    >
      <div
        className="relative bg-white dark:bg-[#0d0f12] border border-slate-200 dark:border-[#1b2028] rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 select-auto"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#1a1f26] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <BookOpen size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Interactive Examples Library</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {EXAMPLE_LIBRARY.length} ready-to-load circuits across {EXAMPLE_CATEGORIES.length} categories
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a1f26] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: category filter + example list */}
          <div className="w-64 shrink-0 border-r border-slate-100 dark:border-[#1a1f26] flex flex-col min-h-0 bg-slate-50/50 dark:bg-[#0a0c0f]">
            <div className="flex flex-wrap gap-1.5 p-3 border-b border-slate-100 dark:border-[#1a1f26]">
              {EXAMPLE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => selectCategory(category)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                    activeCategory === category
                      ? 'bg-brand-gradient text-white shadow-sm'
                      : 'bg-white dark:bg-[#13161c] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#222834] hover:bg-slate-100 dark:hover:bg-[#1a1f28]'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {categoryExamples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => selectExample(example)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-all cursor-pointer border ${
                    selected?.id === example.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50'
                      : 'bg-transparent border-transparent hover:bg-white dark:hover:bg-[#13161c] hover:border-slate-200 dark:hover:border-[#222834]'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug">{example.name}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <DifficultyBadge difficulty={example.difficulty} />
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                      <Clock size={10} /> {example.durationMinutes} min
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: selected example detail */}
          {selected && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{selected.category}</div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{selected.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <DifficultyBadge difficulty={selected.difficulty} />
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock size={12} /> {selected.durationMinutes} min
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#161a22] text-slate-600 dark:text-slate-300 text-[10px] font-mono">
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* Schematic */}
                <div className="mt-5">
                  <SectionHeading icon={<Sparkles size={13} />} label="Schematic" />
                  <pre className="mt-2 rounded-xl border border-slate-200 dark:border-[#1b2028] bg-slate-50 dark:bg-[#0a0c0f] p-4 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-mono overflow-x-auto whitespace-pre">
                    {selected.schematicAscii}
                  </pre>
                </div>

                {/* Concepts taught */}
                <div className="mt-5">
                  <SectionHeading icon={<ListChecks size={13} />} label="Concepts Taught" />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.conceptsTaught.map((concept) => (
                      <span key={concept} className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300 text-[11px] font-medium">
                        {concept}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Educational narrative */}
                <div className="mt-5">
                  <SectionHeading icon={<BookOpen size={13} />} label="Why This Circuit?" />
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{selected.educationalNarrative}</p>
                </div>

                {/* Expected results */}
                {hasExpectedResults && (
                  <div className="mt-5">
                    <SectionHeading icon={<Sigma size={13} />} label="Expected Results" />
                    <div className="mt-2 rounded-xl border border-slate-200 dark:border-[#1b2028] overflow-hidden">
                      {(['nodeVoltages', 'currents', 'power'] as const).map((key) => {
                        const entries = Object.entries(selected.expectedResults[key] ?? {});
                        if (!entries.length) return null;
                        return (
                          <div key={key} className="border-b border-slate-100 dark:border-[#1a1f26] last:border-b-0">
                            {entries.map(([label, value], index) => (
                              <div
                                key={label}
                                className={`flex items-center justify-between px-4 py-2 text-[12px] ${index % 2 === 0 ? 'bg-white dark:bg-[#0d0f12]' : 'bg-slate-50/70 dark:bg-[#0a0c0f]'}`}
                              >
                                <span className="text-slate-600 dark:text-slate-400">{label}</span>
                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                                  {formatNumber(value)}
                                  {key === 'nodeVoltages' ? ' V' : key === 'currents' ? ' A' : ' W'}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    {(selected.expectedResults.notes ?? []).length > 0 && (
                      <ul className="mt-2.5 space-y-1.5">
                        {selected.expectedResults.notes!.map((note) => (
                          <li key={note} className="flex gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                            <span className="text-blue-500 dark:text-blue-400 shrink-0">›</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Suggested modifications */}
                <div className="mt-5">
                  <SectionHeading icon={<Lightbulb size={13} />} label="Suggested Modifications" />
                  <ol className="mt-2 space-y-2">
                    {selected.suggestedModifications.map((modification, index) => (
                      <li key={modification} className="flex gap-2.5 text-[13px] text-slate-700 dark:text-slate-300">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {index + 1}
                        </span>
                        <span className="leading-relaxed">{modification}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Theoretical background */}
                <div className="mt-5">
                  <SectionHeading icon={<Gauge size={13} />} label="Theoretical Background" />
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{selected.theoreticalBackground}</p>
                </div>

                {/* Reference SPICE netlist (collapsible) */}
                <div className="mt-5 mb-2">
                  <button
                    type="button"
                    onClick={() => setShowNetlist((value) => !value)}
                    className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    {showNetlist ? '▾' : '▸'} Reference SPICE Netlist
                  </button>
                  {showNetlist && (
                    <pre className="mt-2 rounded-xl border border-slate-200 dark:border-[#1b2028] bg-slate-900 dark:bg-[#08090b] p-4 text-[11px] leading-relaxed text-emerald-300 font-mono overflow-x-auto whitespace-pre">
                      {selected.spiceNetlist}
                    </pre>
                  )}
                </div>
              </div>

              {/* Action bar */}
              <div className="shrink-0 border-t border-slate-100 dark:border-[#1a1f26] px-6 py-4 flex items-center justify-between gap-3 bg-white/80 dark:bg-[#0d0f12]/80">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selected.schematic.components.length} components · {selected.schematic.wires.length} wires
                </div>
                <button
                  type="button"
                  onClick={handleLoad}
                  className="bg-brand-gradient text-white font-semibold hover:opacity-95 shadow-sm h-10 px-6 rounded-lg text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles size={16} />
                  <span>Load into Simulator</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
      {icon}
      {label}
    </div>
  );
}
