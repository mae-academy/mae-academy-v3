import type { ReactNode } from 'react';
import { Eraser, PanelRightOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CircuitPlacementMode } from '@/simulators/digital-logic/engine/circuitExpressionExtractor';

export interface CircuitPlacementMenuProps {
  /** The trigger button (rendered as-is). */
  children: ReactNode;
  onSelect: (mode: CircuitPlacementMode) => void;
  disabled?: boolean;
}

/** Shared Replace / Append prompt for every "put this circuit on the canvas" action. */
export function CircuitPlacementMenu({ children, onSelect, disabled }: CircuitPlacementMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Place circuit</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSelect('replace')} className="flex items-start gap-2.5 py-2">
          <Eraser className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <span className="flex flex-col">
            <span className="text-xs font-semibold">Replace Canvas</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Clear the schematic and centre the new circuit (one undo step)</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('append')} className="flex items-start gap-2.5 py-2">
          <PanelRightOpen className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <span className="flex flex-col">
            <span className="text-xs font-semibold">Append to Workspace</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Keep existing work and place it to the right</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
