/** Messages between the engine Worker and its strip Workers (STEPS.md §7.1 technique 4). */
import type { Viewport } from "@shared/mathcore/ir/types";
import type { ImplicitSource } from "@shared/mathcore/implicit/source";
import type { FieldOptions, FieldResult } from "@shared/mathcore/implicit/strips";

export interface StripRequest {
  id: number;
  source: ImplicitSource;
  viewport: Viewport;
  options: FieldOptions;
}

export type StripResponse = { id: number; ok: true; result: FieldResult } | { id: number; ok: false; message: string };
