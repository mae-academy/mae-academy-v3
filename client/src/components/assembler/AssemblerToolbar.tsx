/**
 * MAE Assembler Studio Toolbar
 * Consolidated single-line ribbon layout matching Circuit Simulator design system:
 * - Rounded pill action buttons (Undo, Redo, Cut, Copy, Paste, Delete, Import, Export)
 * - Clean pill dropdown for Examples & segmented pill Language selector
 * - Primary signature gradient Runner (Run / Pause)
 * - Compact stepper Stepping buttons (Step, Back, Reset)
 * - Pill-rounded Speed badges (0.5x, 1.0x, 2.0x, 5.0x, Instant)
 * - Compact Time-Travel Slider and Monospace Step Badge
 */
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Clipboard,
  Code2,
  Copy,
  Download,
  FastForward,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Scissors,
  StepForward,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import type { SupportedLanguage } from "@/features/execution-engine";
import { SegmentedControl } from "@/components/common/templates";

export type AssemblerTemplateGroup = { label: string; items: string[] };
export type AssemblerLanguageOption = {
  value: SupportedLanguage;
  label: string;
};
export type ExecutionSpeed = 0.5 | 1.0 | 2.0 | 5.0 | "instant";

export type ToolbarProps = {
  groups: AssemblerTemplateGroup[];
  selectedTemplate: string;
  currentStepIndex: number;
  totalSteps: number;
  running: boolean;
  busy?: boolean;
  language: SupportedLanguage;
  languageOptions: AssemblerLanguageOption[];
  onLanguageChange: (value: SupportedLanguage) => void;
  onTemplateChange: (value: string) => void;
  onRun: () => void;
  onStep: () => void;
  onStepBack: () => void;
  onReset: () => void;
  onScrub: (stepIndex: number) => void;
  speed: ExecutionSpeed;
  onSpeedChange: (speed: ExecutionSpeed) => void;
  onImportCode: (code: string, filename: string) => void;
  onExportCode: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onRedo?: () => void;
  canRedo?: boolean;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
};

export function ToolbarPillButton({
  icon,
  label,
  title,
  onClick,
  active,
  disabled,
  className = "",
}: {
  icon?: React.ReactNode;
  label?: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const isActive = Boolean(active) && !disabled;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-9 inline-flex items-center justify-center gap-1.5 ${label ? "px-2.5" : "w-9 px-0"} text-xs font-medium transition active:scale-[.98] whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
        isActive
          ? "brand-pill-active font-semibold"
          : "rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-300 dark:hover:bg-[#13161c]"
      } ${className}`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

export function ToolbarDivider() {
  return (
    <span className="w-px h-5 bg-slate-200 dark:bg-[#1a1d24] mx-1 shrink-0 self-center" />
  );
}

export function AssemblerToolbar({
  groups,
  selectedTemplate,
  currentStepIndex,
  totalSteps,
  running,
  busy = false,
  language,
  languageOptions,
  onLanguageChange,
  onTemplateChange,
  onRun,
  onStep,
  onStepBack,
  onReset,
  onScrub,
  speed,
  onSpeedChange,
  onImportCode,
  onExportCode,
  onUndo,
  canUndo = false,
  onRedo,
  canRedo = false,
  onCut,
  onCopy,
  onPaste,
  onDelete,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [inputStep, setInputStep] = useState<string>("");
  const hasStartedRef = useRef(false);

  const displayStep =
    totalSteps > 0 && currentStepIndex >= 0
      ? currentStepIndex + 1
      : totalSteps > 0
        ? 1
        : 0;

  const handleStepJump = (valStr: string) => {
    const parsed = parseInt(valStr, 10);
    if (!isNaN(parsed) && totalSteps > 0) {
      const clamped = Math.max(1, Math.min(totalSteps, parsed));
      onScrub(clamped - 1);
    }
  };

  if (running) {
    hasStartedRef.current = true;
  }

  const handleCopyClick = () => {
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImportCode(reader.result, file.name);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <section className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12] shrink-0">
      <header className="w-full p-1.5 flex flex-nowrap items-center justify-between gap-1.5 text-xs overflow-x-auto scrollbar-none">
        {/* ================================================================= */}
        {/* Left Section: Language + Examples + Standard Edit Tools + File Ops*/}
        {/* ================================================================= */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Language Selector */}
          <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-200/60 p-0.5 ps-2 dark:border-[#1a1d24] dark:bg-[#13161c] shrink-0">
            <Code2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
            <SegmentedControl
              options={languageOptions.map(opt => ({
                label: opt.label,
                value: opt.value,
              }))}
              value={language}
              onChange={onLanguageChange}
              size="sm"
              className="border-0 bg-transparent p-0"
              aria-label="Language selector"
            />
          </div>

          <ToolbarDivider />

          {/* Simplified Examples Selector Pill */}
          <div
            className="relative h-9 inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 text-xs font-medium text-slate-700 hover:bg-slate-300/50 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1a1d24] cursor-pointer transition shrink-0"
            title={`Active: ${selectedTemplate} (Click to switch example)`}
          >
            <BookOpen className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0 pointer-events-none" />
            <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 pointer-events-none">
              Examples
            </span>
            <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
            <select
              aria-label="Examples library"
              value={selectedTemplate}
              onChange={e => onTemplateChange(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
            >
              {groups.map(group => (
                <optgroup key={group.label} label={group.label} className="bg-white dark:bg-[#13161c] text-slate-800 dark:text-slate-200 font-sans">
                  {group.items.map(item => (
                    <option key={item} value={item} className="bg-white dark:bg-[#13161c] text-slate-800 dark:text-slate-200 font-sans">
                      {item}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <ToolbarDivider />

          {/* Execution Controls (Left-Aligned Directly Adjacent to Examples) */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Primary Gradient Runner Button */}
            <button
              type="button"
              onClick={onRun}
              disabled={busy}
              title={running ? "Pause execution" : "Run execution"}
              className={`h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 ${
                !running && hasStartedRef.current
                  ? "brand-pill-active-rev"
                  : "brand-pill-active"
              }`}
            >
              {running ? (
                <Pause className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              <span>{running ? "Pause" : "Run"}</span>
            </button>

            {/* Stepper Controls */}
            <ToolbarPillButton
              icon={<StepForward className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
              label="Step"
              title="Step forward"
              onClick={onStep}
              disabled={busy}
            />
            <ToolbarPillButton
              icon={<ChevronLeft className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
              title="Step back"
              onClick={onStepBack}
              disabled={busy || currentStepIndex <= 0}
            />
            <ToolbarPillButton
              icon={<RotateCcw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />}
              title="Reset execution state"
              onClick={onReset}
              disabled={busy}
            />
          </div>

          <ToolbarDivider />

          {/* Standard Edit Controls (Clean Icons with no text label on Copy) */}
          <div className="flex items-center gap-1 shrink-0">
            <ToolbarPillButton
              icon={<Undo2 size={13} />}
              title="Undo (Ctrl/Cmd+Z)"
              onClick={() => onUndo?.()}
              disabled={!canUndo}
            />
            <ToolbarPillButton
              icon={<Redo2 size={13} />}
              title="Redo (Ctrl/Cmd+Shift+Z)"
              onClick={() => onRedo?.()}
              disabled={!canRedo}
            />
            <ToolbarPillButton
              icon={<Scissors size={13} />}
              title="Cut Selection / All"
              onClick={() => onCut?.()}
            />
            {/* Clean Icon-only Copy Button */}
            <ToolbarPillButton
              icon={
                copied ? (
                  <Check size={13} className="text-violet-600 dark:text-violet-400" />
                ) : (
                  <Copy size={13} />
                )
              }
              title={copied ? "Copied!" : "Copy code"}
              onClick={handleCopyClick}
            />
            <ToolbarPillButton
              icon={<Clipboard size={13} />}
              title="Paste from clipboard"
              onClick={() => onPaste?.()}
            />
            <ToolbarPillButton
              icon={<Trash2 size={13} />}
              title="Delete / Clear editor content"
              onClick={() => onDelete?.()}
            />

            <ToolbarDivider />

            {/* File Ops (Import, Export) - Clean Visible Icon Buttons */}
            <ToolbarPillButton
              icon={<Upload size={13} />}
              title="Import file (.asm, .py, .cpp, .c)"
              onClick={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".asm,.s,.py,.cpp,.cc,.c,.txt"
              onChange={handleFileImport}
              className="hidden"
            />
            <ToolbarPillButton
              icon={<Download size={13} />}
              title="Export / Download file"
              onClick={onExportCode}
            />
          </div>
        </div>

        {/* ================================================================= */}
        {/* Right Section: Speed Pills + Stepper Input                        */}
        {/* ================================================================= */}
        <div className="flex items-center gap-1.5 ms-2 shrink-0">
          {/* Speed Selector */}
          <SegmentedControl
            options={[
              { label: "0.5x", value: 0.5 },
              { label: "1.0x", value: 1.0 },
              { label: "2.0x", value: 2.0 },
              { label: "Instant", value: "instant" },
            ]}
            value={speed}
            onChange={onSpeedChange}
            size="sm"
            aria-label="Execution speed"
            className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
          />

          <ToolbarDivider />

          {/* Custom Stepper Input: Step [ X ] / [ Total ] */}
          <div className="h-9 inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-200/60 px-2.5 text-[11px] font-mono font-medium text-slate-700 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 shrink-0">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Step
            </span>
            <input
              type="number"
              min={1}
              max={Math.max(1, totalSteps)}
              value={inputStep !== "" ? inputStep : displayStep}
              onFocus={() => setInputStep(String(displayStep))}
              onChange={e => setInputStep(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  handleStepJump(inputStep);
                  setInputStep("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={() => {
                if (inputStep !== "") {
                  handleStepJump(inputStep);
                  setInputStep("");
                }
              }}
              disabled={totalSteps <= 0}
              title="Type step number directly to jump"
              className="w-10 h-6 rounded-md bg-white dark:bg-[#090a0d] border border-slate-300 dark:border-[#222733] text-center font-mono font-normal text-[11px] text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0"
            />
            <span className="text-slate-400 dark:text-slate-500">/</span>
            <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 min-w-[1.25rem] text-center">
              {totalSteps}
            </span>
          </div>
        </div>
      </header>
    </section>
  );
}

export default AssemblerToolbar;
