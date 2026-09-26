import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createFrameStore, type FrameStore } from '../../ui/hardware/frame-store';
import { useFrameVersion } from '../../ui/hardware/hooks';
import { LogoBenchController, type LogoControllerOptions } from '../controller';

/**
 * Owns one bench controller for the lifetime of the component. Operator actions re-render at once;
 * scan notifications are coalesced by the frame store to display rate, never once per scan.
 */
export function useLogoBench(options: LogoControllerOptions): { readonly controller: LogoBenchController; readonly frame: FrameStore } {
  const [controller] = useState(() => new LogoBenchController(options));
  useEffect(() => () => controller.dispose(), [controller]);
  const frame = useMemo(() => createFrameStore((notify) => controller.subscribe(notify)), [controller]);
  useFrameVersion(frame);
  useSyncExternalStore(controller.subscribeChanges, controller.getChangeVersion, controller.getChangeVersion);
  return { controller, frame };
}
