# Build spec — RateLimiter (token bucket)   [issued by Opus, the orchestrator]

Implement `RateLimiter` in `ratelimit.mjs` (ESM, `export class RateLimiter`). Pure, deterministic,
injectable clock — no reliance on real wall-clock time.

## Constructor
`new RateLimiter({ capacity, refillPerSec, now })`
- `capacity` — max tokens (the burst ceiling), `>= 0`.
- `refillPerSec` — tokens added per second (`>= 0`, may be fractional).
- `now` — optional `() => number` returning milliseconds (default `Date.now`). ALL timing derives from this.

## Method
`tryRemove(n = 1) => boolean`
1. Refill first: add `(elapsedMs / 1000) * refillPerSec` tokens accrued since the last refill, capped at `capacity`.
2. Then: if available tokens `>= n`, subtract `n`, return `true`. Otherwise return `false`. No partial consumption.

## Requirements (all mandatory — a miss is a real bug, not a gotcha)
- **R1** Starts full: a fresh limiter has exactly `capacity` tokens.
- **R2** Fractional refill accumulates: tokens are NOT floored between calls; sub-token refill must persist and add up across many small time steps.
- **R3** Refill never exceeds `capacity` (no over-fill, even after a long idle gap).
- **R4** Monotonic-safe: if `now()` returns a value `<=` the last observed time (clock stall or going backwards), treat elapsed as `0` — never add tokens, never corrupt state, never go negative.
- **R5** `capacity: 0` → `tryRemove(n>=1)` always `false`; `refillPerSec: 0` → no refill beyond the initial fill.
- **R6** `n > capacity` → always `false` (unsatisfiable), and tokens must never be left negative.
- **R7** `tryRemove(0)` → `true`, consumes nothing.
- **R8** No overflow / NaN: a huge elapsed gap, huge `n`, or fractional `refillPerSec` all stay finite and correct.
- **R9** Deterministic under the injected clock.

`tryRemove` returns a boolean and does not throw for valid numeric inputs.
