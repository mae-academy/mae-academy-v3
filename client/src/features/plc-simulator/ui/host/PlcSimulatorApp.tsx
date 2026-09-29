import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/common/templates';
import type { Network } from '../../domain/ast';
import { getProfile, LOGO_0BA8, S7_200_CPU224 } from '../../domain/hardware';
import type { SymbolMap } from '../../transpiler';
import type { ScenarioId } from '../../logo/scenarios';
import { LogoWorkspace } from './LogoWorkspace';
import { S7Workspace } from './S7Workspace';
import type { PlcHostOptions } from './usePlcHost';

export type PlcPlatform = 's7' | 'logo';

export interface PlcSimulatorAppProps {
  /** A LOGO! profile id opens the LOGO! tab; any S7-200 id selects that CPU. */
  initialProfileId?: string;
  /** Starting ladder program of the S7-200 tab. */
  initialNetworks?: readonly Network[];
  /** Application preloaded into the LOGO! bench; defaults to Tutorial A: seal-in circuit. */
  initialLogoScenario?: ScenarioId;
  symbols?: SymbolMap;
  /** Runtime overrides; tests inject a manual clock and scheduler here. */
  runtimeOptions?: PlcHostOptions['runtimeOptions'];
  className?: string;
}

const PLATFORM_OPTIONS = [
  { label: 'S7-200', value: 's7' },
  { label: 'LOGO!', value: 'logo' },
] as const satisfies readonly { label: string; value: PlcPlatform }[];

/**
 * The PLC studio. Two fully separate environments behind one master switch: a Siemens S7-200 CPU
 * (ladder + instruction list) and a LOGO! 0BA4 on an interactive electrical bench. Each owns its own
 * editor, memory image and runtime, so nothing leaks between them; the inactive one is stopped and
 * merely hidden, which keeps its program while the student is in the other tab.
 */
export function PlcSimulatorApp({
  initialProfileId = S7_200_CPU224.id,
  initialNetworks = [],
  initialLogoScenario = 'seal-in-gates',
  symbols,
  runtimeOptions,
  className = '',
}: PlcSimulatorAppProps) {
  const { t } = useTranslation('simulators');
  const [platform, setPlatform] = useState<PlcPlatform>(initialProfileId === LOGO_0BA8.id ? 'logo' : 's7');
  const [cpuId, setCpuId] = useState(() => {
    const requested = getProfile(initialProfileId);
    return requested?.family === 'S7-200' ? requested.id : S7_200_CPU224.id;
  });
  const networks = useRef<readonly Network[]>(initialNetworks);
  const remember = useCallback((next: readonly Network[]) => {
    networks.current = next;
  }, []);

  return (
    <div className={`flex min-h-[640px] w-full flex-col gap-2.5 font-sans text-slate-800 dark:text-slate-200 ${platform === 's7' ? 'h-[calc(100vh-15rem)]' : ''} ${className}`}>
      <div className="flex shrink-0 items-center justify-center py-0.5">
        <SegmentedControl<PlcPlatform>
          aria-label={t('plc.controllerPlatformAria', 'Controller platform')}
          size="md"
          value={platform}
          options={PLATFORM_OPTIONS.map((option) => ({ ...option }))}
          onChange={setPlatform}
          className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
        />
      </div>

      <div hidden={platform !== 's7'} className={`min-h-0 flex-1 flex-col ${platform === 's7' ? 'flex' : 'hidden'}`}>
        <S7Workspace
          key={cpuId}
          active={platform === 's7'}
          profileId={cpuId}
          initialNetworks={networks.current}
          symbols={symbols}
          runtimeOptions={runtimeOptions}
          onProfileChange={setCpuId}
          onNetworks={remember}
        />
      </div>

      <div hidden={platform !== 'logo'} className={`min-h-0 flex-1 flex-col ${platform === 'logo' ? 'flex' : 'hidden'}`}>
        <LogoWorkspace active={platform === 'logo'} initialScenario={initialLogoScenario} runtimeOptions={runtimeOptions} />
      </div>
    </div>
  );
}
