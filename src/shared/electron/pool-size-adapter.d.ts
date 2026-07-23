/**
 * src/shared/electron/pool-size-adapter.d.ts
 *
 * Adapter type surface for src/main/pool-size.js.
 *
 * ponytail: 1:1 mirrors the existing public surface — three exports:
 *           `computePoolSize`, `DEFAULT_POOL_CAP`, `MIN_POOL_SIZE`. Internal
 *           tuning knobs (the cap / min constants) are exposed as readonly
 *           numbers so callers can reason about the chosen pool size without
 *           coupling to the underlying arithmetic. Do not widen this adapter
 *           to expose pool-strategy objects — keep the public surface
 *           flat.
 */

export interface PoolSizeAdapter {
  computePoolSize(opts?: {
    cpus?: number;
    cap?: number;
    min?: number;
  }): number;
  readonly DEFAULT_POOL_CAP: number;
  readonly MIN_POOL_SIZE: number;
}
