import type { DetectResult } from '../types';

/** The proxy an Auto check is trying right now. */
export interface Probe {
  type: NonNullable<DetectResult['type']>;
  /** Lower case, to compare with auth challengers. */
  host: string;
  port: number;
  username: string;
  password: string;
  /** Auth challenges seen from it so far. */
  challenges: number;
}

// Only one check runs at a time: callers go through the commit queue.
let probe: Probe | null = null;

export const activeProbe = (): Probe | null => probe;

export function setProbe(next: Probe | null): void {
  probe = next;
}
